// src/app/[locale]/(dashboard)/campaigns/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { CampaignsContent } from "./campaigns-content";

export interface CampaignItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  platform: string | null;
  mediaUrl: string | null;
  mediaFormat: string | null;
  hasTranscription: boolean;
  totalLeads: number;
  convertedLeads: number;
  createdAt: string;
}

async function getCampaigns(accountId: string): Promise<CampaignItem[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });

  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    type: c.type,
    status: c.status,
    platform: c.platform,
    mediaUrl: c.mediaUrl,
    mediaFormat: c.mediaFormat,
    hasTranscription: !!c.transcription,
    totalLeads: c.totalLeads,
    convertedLeads: c.convertedLeads,
    createdAt: c.createdAt.toISOString(),
  }));
}

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session) return null;

  const campaigns = await getCampaigns(session.accountId);

  return <CampaignsContent campaigns={campaigns} />;
}