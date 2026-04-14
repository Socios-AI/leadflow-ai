// src/app/api/ai-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = await prisma.aIConfig.findUnique({ where: { accountId: session.accountId } });
    if (!config) return NextResponse.json({ assistantId: "closer", aiName: "Luna", aiRole: "", companyName: "", industry: "", companyDescription: "", products: "", differentials: "", targetAudience: "", temperature: 0.7, debounceSeconds: 8 });
    const p = (config.persona as any) || {};
    return NextResponse.json({ assistantId: p.assistantId || "closer", aiName: p.aiName || "Luna", aiRole: p.aiRole || "", companyName: p.companyName || "", industry: p.industry || "", companyDescription: p.companyDescription || "", products: p.products || "", differentials: p.differentials || "", targetAudience: p.targetAudience || "", temperature: config.temperature, debounceSeconds: p.debounceSeconds || 8 });
  } catch (e: any) { console.error("GET ai-config:", e.message); return NextResponse.json({ error: "Internal error" }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    // Preserve pipeline settings if they exist
    const existing = await prisma.aIConfig.findUnique({ where: { accountId: session.accountId } });
    const existingPersona = (existing?.persona as any) || {};
    const persona = {
      ...existingPersona,
      assistantId: body.assistantId, aiName: body.aiName, aiRole: body.aiRole,
      companyName: body.companyName, industry: body.industry, companyDescription: body.companyDescription,
      products: body.products, differentials: body.differentials, targetAudience: body.targetAudience,
      debounceSeconds: body.debounceSeconds,
    };
    await prisma.aIConfig.upsert({
      where: { accountId: session.accountId },
      create: { accountId: session.accountId, provider: "openai", model: "gpt-4o", systemPrompt: body.systemPrompt || "", temperature: body.temperature ?? 0.7, maxTokens: 500, persona },
      update: { systemPrompt: body.systemPrompt || "", temperature: body.temperature ?? 0.7, persona },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) { console.error("PUT ai-config:", e.message); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

/**
 * POST — Voice input: Whisper transcribes (auto-detects language) → GPT extracts structured fields
 * Works in ANY language: Portuguese, English, Spanish, or any other.
 * Whisper auto-detects the spoken language, GPT extracts fields regardless of input language.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File;
    if (!file) return NextResponse.json({ error: "No audio" }, { status: 400 });

    // 1. Whisper — auto-detects ANY language
    const wf = new FormData();
    wf.append("file", file);
    wf.append("model", "whisper-1");
    wf.append("response_format", "text");
    // Do NOT set language param — Whisper auto-detects

    const wr = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: wf,
    });
    if (!wr.ok) return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    const text = await wr.text();

    // 2. GPT — extracts fields in any language, returns values in the user's language
    const pr = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini", temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You are a multilingual data extractor. The user spoke about their company and AI assistant configuration in any language (Portuguese, English, Spanish, or other). Extract the following fields from their speech. Return ONLY a JSON object with these fields. Use empty string "" if a field was NOT mentioned. Keep the values in the SAME LANGUAGE the user spoke.

{
  "aiName": "name they want for the AI assistant (e.g. Luna, Sarah, Carlos)",
  "aiRole": "role/title for the AI (e.g. Sales Consultant, Vendedora, Consultora)",
  "companyName": "company name",
  "industry": "industry/sector - try to match one of: Marketing Digital, E-commerce, SaaS / Software, Educação / Cursos, Saúde / Bem-estar, Consultoria, Imobiliário, Financeiro, Coaching, Serviços Profissionais, Varejo, Outro. If speaking English use the Portuguese equivalent. If no match, use Outro.",
  "companyDescription": "what the company does - brief description",
  "products": "main products or services offered",
  "differentials": "competitive advantages, guarantees, unique selling points",
  "targetAudience": "ideal customer profile, who they sell to"
}

Important: Only include fields that were CLEARLY mentioned. Leave as "" if not mentioned or unclear.` },
          { role: "user", content: text },
        ],
      }),
    });

    if (!pr.ok) return NextResponse.json({ companyDescription: text });
    const pd = await pr.json();
    try { return NextResponse.json(JSON.parse(pd.choices?.[0]?.message?.content || "{}")); }
    catch { return NextResponse.json({ companyDescription: text }); }
  } catch (e: any) {
    console.error("POST ai-config voice:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}