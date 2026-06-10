// src/app/api/leads/import/route.ts
//
// Spreadsheet lead import (CSV / XLSX) with column mapping.
//
// Two-phase, both via multipart/form-data POST:
//   action="preview" → parse the file, return detected headers, a few sample
//     rows, the total row count, and a HEURISTIC suggested mapping
//     (which column looks like name/email/phone/etc). The operator then
//     confirms or edits this mapping in the UI.
//   action="commit"  → re-receive the same file + the confirmed `mapping`
//     (JSON) + `contactNow`. Create the Lead rows (skipping duplicates and
//     rows with no contact info) and, when contactNow is on, enqueue the
//     proactive first-contact job so the AI reaches out — same path used by
//     the leads webhook.
//
// We re-parse the file on commit instead of round-tripping all rows through
// the browser, so large imports stay light on the wire.

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/db/prisma";
import { queues } from "@/lib/queues";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "leads/import" });

// Hard cap per import to keep the request inside the serverless/runtime
// timeout and to avoid a single upload blasting thousands of WhatsApp first
// contacts at once. Larger lists should be split.
const MAX_ROWS = 2000;
const SAMPLE_ROWS = 5;

// Target lead fields the operator can map a column onto, with the header
// keywords we use to guess the mapping. Order = match priority (more specific
// fields first so e.g. a "contato" column lands on phone, not name).
const FIELD_KEYWORDS: { field: LeadField; keywords: string[] }[] = [
  { field: "email", keywords: ["email", "mail", "correio", "eaddress"] },
  { field: "phone", keywords: ["phone", "telefone", "whatsapp", "whats", "celular", "cel", "tel", "mobile", "fone", "numero", "telephone", "contato", "contact"] },
  { field: "countryCode", keywords: ["countrycode", "country", "pais", "ddi", "codpais"] },
  { field: "campaign", keywords: ["campaign", "campanha", "origem", "source", "utm", "fonte"] },
  { field: "name", keywords: ["name", "nome", "nombre", "fullname", "cliente", "lead", "pessoa", "razaosocial"] },
];

type LeadField = "name" | "email" | "phone" | "countryCode" | "campaign";
type Mapping = Partial<Record<LeadField, string>>; // field -> header

function norm(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Best-effort guess of which header maps to which lead field. */
function suggestMapping(headers: string[]): Mapping {
  const used = new Set<string>();
  const mapping: Mapping = {};
  for (const { field, keywords } of FIELD_KEYWORDS) {
    let best: { header: string; score: number } | null = null;
    for (const h of headers) {
      if (used.has(h)) continue;
      const nh = norm(h);
      if (!nh) continue;
      for (const kw of keywords) {
        if (nh === kw || nh.includes(kw) || kw.includes(nh)) {
          const score = kw.length + (nh === kw ? 100 : 0);
          if (!best || score > best.score) best = { header: h, score };
        }
      }
    }
    if (best) {
      mapping[field] = best.header;
      used.add(best.header);
    }
  }
  return mapping;
}

/** Parse the first sheet into { headers, rows } (rows = array of objects keyed by header). */
function parseSheet(buf: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  // header:1 → array-of-arrays so we can read the header row verbatim and
  // de-duplicate/trim it before keying the data rows.
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = (matrix[0] || []).map((h) => String(h ?? "").trim()).filter((h) => h !== "");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const obj: Record<string, string> = {};
    let hasAny = false;
    headers.forEach((h, idx) => {
      const v = String(r[idx] ?? "").trim();
      obj[h] = v;
      if (v) hasAny = true;
    });
    if (hasAny) rows.push(obj);
  }
  return { headers, rows };
}

function cleanPhone(raw: string, countryCode?: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits.replace(/\D/g, "")) return null;
  // If a country dial code column is present and the number doesn't already
  // carry one, prepend it (digits only). Best-effort — operators are told to
  // include the country code for reliable WhatsApp delivery.
  if (countryCode && !digits.startsWith("+")) {
    const cc = countryCode.replace(/[^\d]/g, "");
    if (cc && !digits.startsWith(cc)) digits = cc + digits.replace(/^0+/, "");
  }
  return digits.startsWith("+") ? digits : `+${digits.replace(/^\+/, "")}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const action = String(form.get("action") || "preview");
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  let parsed: { headers: string[]; rows: Record<string, string>[] };
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseSheet(buf);
  } catch (e) {
    log.warn("parse failed", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "parse_failed" }, { status: 422 });
  }

  if (parsed.headers.length === 0) {
    return NextResponse.json({ error: "empty_or_no_header" }, { status: 422 });
  }

  // ── PREVIEW ──
  if (action === "preview") {
    return NextResponse.json({
      headers: parsed.headers,
      totalRows: parsed.rows.length,
      sampleRows: parsed.rows.slice(0, SAMPLE_ROWS),
      suggestedMapping: suggestMapping(parsed.headers),
      fields: ["name", "email", "phone", "countryCode", "campaign"],
    });
  }

  // ── COMMIT ──
  let mapping: Mapping = {};
  try {
    mapping = JSON.parse(String(form.get("mapping") || "{}"));
  } catch {
    return NextResponse.json({ error: "invalid_mapping" }, { status: 400 });
  }
  const contactNow = String(form.get("contactNow") || "true") === "true";

  // A lead is only useful if we can reach it. Require at least one of
  // phone/email to be mapped.
  if (!mapping.phone && !mapping.email) {
    return NextResponse.json({ error: "need_phone_or_email_column" }, { status: 400 });
  }

  const accountId = session.accountId;
  const rows = parsed.rows.slice(0, MAX_ROWS);
  const truncated = parsed.rows.length > MAX_ROWS;

  // One-shot dedup: load existing phones (last 10 digits) + emails for this
  // account so re-importing the same list doesn't create duplicates.
  const existing = await prisma.lead.findMany({
    where: { accountId },
    select: { phone: true, email: true },
  });
  const existingPhones = new Set<string>();
  const existingEmails = new Set<string>();
  for (const e of existing) {
    if (e.phone) existingPhones.add(e.phone.replace(/\D/g, "").slice(-10));
    if (e.email) existingEmails.add(e.email.toLowerCase());
  }

  // Resolve campaign names → ids once (match existing campaigns; we don't
  // auto-create campaigns here).
  const campaignCol = mapping.campaign;
  const campaignIdByName = new Map<string, string>();
  if (campaignCol) {
    const names = new Set<string>();
    for (const r of rows) {
      const n = (r[campaignCol] || "").trim();
      if (n) names.add(n);
    }
    if (names.size > 0) {
      const camps = await prisma.campaign.findMany({
        where: { accountId },
        select: { id: true, name: true },
      });
      for (const n of names) {
        const hit = camps.find((c) => c.name.trim().toLowerCase() === n.toLowerCase());
        if (hit) campaignIdByName.set(n.toLowerCase(), hit.id);
      }
    }
  }

  let created = 0;
  let skippedDuplicate = 0;
  let skippedNoContact = 0;
  const createdLeads: { id: string; channel: "WHATSAPP" | "EMAIL" }[] = [];

  for (const r of rows) {
    const name = mapping.name ? (r[mapping.name] || "").trim() || null : null;
    const email = mapping.email ? (r[mapping.email] || "").trim().toLowerCase() || null : null;
    const cc = mapping.countryCode ? (r[mapping.countryCode] || "").trim() : "";
    const phone = mapping.phone ? cleanPhone(r[mapping.phone] || "", cc) : null;

    if (!phone && !email) {
      skippedNoContact++;
      continue;
    }

    // Dedup
    const phoneKey = phone ? phone.replace(/\D/g, "").slice(-10) : "";
    if ((phoneKey && existingPhones.has(phoneKey)) || (email && existingEmails.has(email))) {
      skippedDuplicate++;
      continue;
    }
    if (phoneKey) existingPhones.add(phoneKey);
    if (email) existingEmails.add(email);

    const campaignName = campaignCol ? (r[campaignCol] || "").trim() : "";
    const campaignId = campaignName ? campaignIdByName.get(campaignName.toLowerCase()) || null : null;

    try {
      const lead = await prisma.lead.create({
        data: {
          accountId,
          name,
          email,
          phone,
          countryCode: cc || null,
          source: "MANUAL",
          status: "NEW",
          score: 0,
          campaignId,
          // Imported leads are funnel leads (proactive). They must NOT carry
          // unverifiedInbound, so the WhatsApp funnel-only gate engages them.
          metadata: { importedAt: new Date().toISOString(), importedBy: session.userId },
        },
      });
      created++;
      const channel: "WHATSAPP" | "EMAIL" = phone ? "WHATSAPP" : "EMAIL";
      createdLeads.push({ id: lead.id, channel });
      if (campaignId) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { totalLeads: { increment: 1 } },
        }).catch(() => {});
      }
    } catch (e) {
      log.warn("lead create failed", { err: e instanceof Error ? e.message : String(e) });
    }
  }

  // Enqueue proactive first-contact, spread out to avoid a thundering herd of
  // simultaneous WhatsApp sends (anti-ban + rate limits). ~3s between leads,
  // capped so very large imports still drain in a bounded window.
  if (contactNow && createdLeads.length > 0) {
    for (let i = 0; i < createdLeads.length; i++) {
      const { id, channel } = createdLeads[i];
      const delay = Math.min(i * 3000, 30 * 60 * 1000);
      await queues.leadProcessing.add(
        "new-lead",
        { leadId: id, accountId, channel },
        { priority: 5, delay }
      ).catch((e) => log.warn("enqueue failed", { leadId: id, err: e instanceof Error ? e.message : String(e) }));
    }
  }

  log.info("import committed", {
    accountId,
    created,
    skippedDuplicate,
    skippedNoContact,
    contactNow,
    truncated,
  });

  return NextResponse.json({
    success: true,
    created,
    skippedDuplicate,
    skippedNoContact,
    truncated,
    contacted: contactNow ? createdLeads.length : 0,
  });
}
