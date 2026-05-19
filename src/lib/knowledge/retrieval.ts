// src/lib/knowledge/retrieval.ts
//
// Lightweight retrieval for the knowledge base. No embeddings, no vector
// store, no extra infra. We rank entries and file chunks by token overlap
// with the lead's recent messages (BM25-ish scoring) and return the top-K
// pieces that fit inside a fixed character budget.
//
// Why this approach
//   - Embeddings are great but require an extra service, ongoing cost and
//     re-indexing on every edit. For 1000+ entries per tenant, BM25 over
//     chunked text is still extremely effective for sales conversations
//     because the lead's question and the knowledge usually share
//     surface-level vocabulary (product name, plan name, "preco", "duracao",
//     etc.). When we outgrow it we swap this module out behind the same API.
//
// Public surface
//   buildKnowledgeBlock(accountId, query, opts?) -> string
//
// The returned string is ready to be concatenated into the system prompt.

import prisma from "@/lib/db/prisma";

const DEFAULT_BUDGET_CHARS = 12_000;
const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 120;
const MAX_CHUNKS_RETURNED = 8;

const STOPWORDS = new Set([
  // PT
  "a","o","as","os","de","da","do","das","dos","um","uma","uns","umas","e","em",
  "no","na","nos","nas","por","para","pra","pro","com","sem","se","que","qual",
  "quais","como","quando","onde","mais","menos","ja","ou","mas","tambem","ainda",
  "isso","isto","aquilo","ele","ela","eles","elas","eu","tu","voce","nos","vos",
  "ser","estar","ter","fazer","ir","sim","nao","oi","ola","ola","obrigado",
  // ES
  "el","la","los","las","un","una","unos","unas","y","o","u","de","del","al","con",
  "sin","por","para","que","como","cuando","donde","mas","menos","si","no","es",
  // EN
  "the","a","an","of","to","in","on","at","by","for","with","is","are","was",
  "were","be","been","and","or","but","if","then","so","this","that","these",
  "those","i","you","he","she","it","we","they","do","does","did","have","has",
  "had","not","yes","no","what","when","where","why","how",
  // IT
  "il","lo","la","i","gli","le","un","uno","una","di","del","dello","della","dei",
  "degli","delle","a","al","alla","ai","con","per","tra","fra","da","in","ma","o",
  "che","come","quando","dove","piu","meno","si","no","cosa","perche",
]);

export interface ScoredChunk {
  id: string;
  source: "entry" | "file";
  title: string;
  text: string;
  score: number;
}

export interface BuildOpts {
  /** Total characters allowed in the final block. */
  budgetChars?: number;
  /** Cap how many sources end up in the block. */
  maxChunks?: number;
}

export async function buildKnowledgeBlock(
  accountId: string,
  query: string,
  opts: BuildOpts = {}
): Promise<string> {
  const budget = opts.budgetChars ?? DEFAULT_BUDGET_CHARS;
  const maxChunks = opts.maxChunks ?? MAX_CHUNKS_RETURNED;

  const [entries, files] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      where: { accountId },
      select: { id: true, title: true, content: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.knowledgeFile.findMany({
      where: { accountId, NOT: { extractedText: null } },
      select: {
        id: true,
        title: true,
        description: true,
        extractedText: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  if (entries.length === 0 && files.length === 0) return "";

  const queryTokens = tokenize(query);
  const corpus: ScoredChunk[] = [];

  for (const e of entries) {
    const text = e.content.trim();
    if (!text) continue;
    if (text.length <= CHUNK_CHARS) {
      corpus.push({ id: e.id, source: "entry", title: e.title, text, score: 0 });
    } else {
      for (const chunk of chunkText(text)) {
        corpus.push({ id: e.id, source: "entry", title: e.title, text: chunk, score: 0 });
      }
    }
  }
  for (const f of files) {
    const text = (f.extractedText || "").trim();
    if (!text) continue;
    const head = f.description ? `${f.title}, ${f.description}` : f.title;
    if (text.length <= CHUNK_CHARS) {
      corpus.push({ id: f.id, source: "file", title: head, text, score: 0 });
    } else {
      for (const chunk of chunkText(text)) {
        corpus.push({ id: f.id, source: "file", title: head, text: chunk, score: 0 });
      }
    }
  }

  if (corpus.length === 0) return "";

  // Pre-compute document frequencies for IDF.
  const df = new Map<string, number>();
  const docTokens: string[][] = corpus.map((c) => tokenize(c.text));
  for (const tokens of docTokens) {
    const unique = new Set(tokens);
    for (const t of unique) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = corpus.length;
  const avgLen =
    docTokens.reduce((acc, d) => acc + d.length, 0) / Math.max(1, docTokens.length);

  // BM25 scoring.
  const k1 = 1.4;
  const b = 0.75;
  for (let i = 0; i < corpus.length; i++) {
    const tokens = docTokens[i];
    if (tokens.length === 0) continue;
    let score = 0;
    for (const q of queryTokens) {
      const f = countToken(tokens, q);
      if (f === 0) continue;
      const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
      const denom = f + k1 * (1 - b + b * (tokens.length / Math.max(1, avgLen)));
      score += idf * ((f * (k1 + 1)) / denom);
    }
    corpus[i].score = score;
  }

  // If the query is empty (no tokens) fall back to most recent entries so we
  // never inject a blank block when the lead just said "oi".
  const ranked =
    queryTokens.length === 0
      ? corpus.slice(0, maxChunks)
      : corpus
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, maxChunks);

  if (ranked.length === 0) {
    // No keyword overlap — surface the freshest entries so the AI still has
    // some grounding for follow-up questions.
    const fallback = corpus.slice(0, Math.min(maxChunks, 4));
    return formatBlock(fallback, budget);
  }

  return formatBlock(ranked, budget);
}

function formatBlock(chunks: ScoredChunk[], budget: number): string {
  if (chunks.length === 0) return "";
  let used = 0;
  const parts: string[] = [];
  for (const c of chunks) {
    const block = `### ${c.title}\n${c.text.trim()}`;
    if (used + block.length > budget) {
      const remaining = budget - used;
      if (remaining > 200) parts.push(block.slice(0, remaining));
      break;
    }
    parts.push(block);
    used += block.length + 2;
  }
  return `\nBASE DE CONHECIMENTO (consulte antes de responder, NAO invente o que nao estiver aqui):\n${parts.join("\n\n")}\n`;
}

function chunkText(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + CHUNK_CHARS);
    const piece = text.slice(i, end);
    out.push(piece);
    if (end === text.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return out;
}

function tokenize(s: string): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics so "preco" matches "preço"
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 32 && !STOPWORDS.has(t));
}

function countToken(tokens: string[], q: string): number {
  let n = 0;
  for (const t of tokens) if (t === q) n++;
  return n;
}
