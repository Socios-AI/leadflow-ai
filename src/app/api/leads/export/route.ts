// src/app/api/leads/export/route.ts
//
// Streaming CSV export of every lead in the operator's account. Used by
// the "Export CSV" button on /leads. Fields chosen to round-trip back
// into Excel/Google Sheets: stable column order, ISO timestamps, no
// commas inside quoted strings.

import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leads = await prisma.lead.findMany({
    where: { accountId: session.accountId },
    orderBy: { createdAt: "desc" },
    include: {
      campaign: { select: { name: true } },
      conversations: {
        select: { channel: true, lastMessageAt: true, isAIEnabled: true },
        orderBy: { lastMessageAt: "desc" },
        take: 1,
      },
    },
  });

  const header = [
    "id",
    "name",
    "email",
    "phone",
    "status",
    "source",
    "country_code",
    "score",
    "tags",
    "campaign",
    "channel",
    "ai_enabled",
    "last_contact_at",
    "created_at",
  ];

  const rows = leads.map((l) => {
    const conv = l.conversations[0];
    return [
      l.id,
      l.name || "",
      l.email || "",
      l.phone || "",
      l.status,
      l.source,
      l.countryCode || "",
      String(l.score ?? 0),
      (l.tags || []).join("; "),
      l.campaign?.name || "",
      conv?.channel || "",
      conv?.isAIEnabled ? "yes" : "no",
      conv?.lastMessageAt?.toISOString() || "",
      l.createdAt.toISOString(),
    ].map(csvEscape).join(",");
  });

  // Prepend the UTF-8 BOM so Excel opens it with the right encoding.
  const body = "﻿" + [header.join(","), ...rows].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
