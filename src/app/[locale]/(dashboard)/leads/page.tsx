// src/app/[locale]/(dashboard)/leads/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { LeadsContent } from "./leads-content";

export interface LeadItem {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string;
  score: number;
  tags: string[];
  campaignName: string | null;
  lastContactAt: string | null;
  createdAt: string;
}

async function getLeads(accountId: string): Promise<LeadItem[]> {
  const leads = await prisma.lead.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      campaign: { select: { name: true } },
    },
  });

  return leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    status: l.status,
    source: l.source,
    score: l.score,
    tags: l.tags,
    campaignName: l.campaign?.name || null,
    lastContactAt: l.lastContactAt?.toISOString() || null,
    createdAt: l.createdAt.toISOString(),
  }));
}

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) return null;

  const leads = await getLeads(session.accountId);

  return <LeadsContent leads={leads} />;
}