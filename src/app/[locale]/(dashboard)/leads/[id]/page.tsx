import React from "react";
import { notFound } from "next/navigation";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

interface LeadDetailPageProps {
  params: Promise<{ id: string; locale: string }>;
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return null;

  const lead = await prisma.lead.findUnique({
    where: { id, accountId: session.accountId },
    include: {
      campaign: true,
      conversations: {
        orderBy: { updatedAt: "desc" }, // Mudado de lastMessageAt para updatedAt
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
    },
  });

  if (!lead) notFound();

  const serialized = {
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    lastContactAt: (lead as any).lastContactAt?.toISOString() || null,
    campaign: lead.campaign
      ? { ...lead.campaign, createdAt: lead.campaign.createdAt.toISOString(), updatedAt: lead.campaign.updatedAt.toISOString() }
      : null,
    conversations: lead.conversations.map((c: any) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastMessageAt: c.lastMessageAt?.toISOString() || c.updatedAt.toISOString(),
      messages: c.messages.map((m: any) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{lead.name || "Lead"}</h1>
        <p className="text-muted-foreground">{lead.email || lead.phone || "No contact info"}</p>
      </div>
      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
        {JSON.stringify(serialized, null, 2)}
      </pre>
    </div>
  );
}