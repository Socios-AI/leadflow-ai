"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  Tag,
} from "lucide-react";
import { getInitials } from "@/lib/utils";

interface LeadDetailProps {
  lead: {
    id: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    status: string;
    source: string;
    countryCode: string;
    score: number;
    tags: string[];
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    campaign?: { name: string; type: string } | null;
    conversations: Array<{
      id: string;
      channel: string;
      isActive: boolean;
      lastMessageAt: string | null;
      messages: Array<{
        id: string;
        content: string;
        direction: string;
        createdAt: string;
      }>;
    }>;
  };
}

const STATUS_VARIANT: Record<string, "info" | "secondary" | "warning" | "success" | "destructive"> = {
  NEW: "info",
  CONTACTED: "secondary",
  IN_CONVERSATION: "warning",
  QUALIFIED: "success",
  CONVERTED: "success",
  LOST: "destructive",
  UNRESPONSIVE: "secondary",
};

export function LeadDetailContent({ lead }: LeadDetailProps) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/leads`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("leads.detail")}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-brand-300/10 flex items-center justify-center text-brand-300 font-bold text-xl">
                {getInitials(lead.name)}
              </div>
              <div>
                <CardTitle>{lead.name || t("leads.noName")}</CardTitle>
                <Badge variant={STATUS_VARIANT[lead.status] || "secondary"} className="mt-1">
                  {lead.status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {lead.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                <span>{lead.phone}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                <span>{lead.email}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
            </div>
            {lead.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                {lead.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {lead.campaign && (
              <div className="pt-2 border-t border-[hsl(var(--border))]">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {t("campaigns.title")}
                </p>
                <p className="text-sm font-medium mt-1">{lead.campaign.name}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-brand-300" />
              {t("leads.conversations")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lead.conversations.length > 0 ? (
              <div className="space-y-4">
                {lead.conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/${locale}/conversations/${conv.id}`}
                  >
                    <div className="p-4 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{conv.channel}</Badge>
                          {conv.isActive && (
                            <Badge variant="success">{t("common.active")}</Badge>
                          )}
                        </div>
                        {conv.lastMessageAt && (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            {new Date(conv.lastMessageAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {conv.messages[0] && (
                        <p className="text-sm text-[hsl(var(--muted-foreground))] truncate">
                          {conv.messages[0].content}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t("conversations.noConversations")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}