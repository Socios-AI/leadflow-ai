// src/app/[locale]/(dashboard)/conversations/conversations-content.tsx
"use client";

import React, { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Search,
  Clock,
  Brain,
  Phone,
  Mail,
  Smartphone,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationItem } from "./page";

interface ConversationsContentProps {
  conversations: ConversationItem[];
}

const CHANNEL_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  WHATSAPP: { icon: Phone, label: "WhatsApp", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  EMAIL: { icon: Mail, label: "Email", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  SMS: { icon: Smartphone, label: "SMS", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
};

export function ConversationsContent({ conversations }: ConversationsContentProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    return conversations.filter((conv) => {
      const matchSearch =
        !search ||
        conv.leadName?.toLowerCase().includes(search.toLowerCase()) ||
        conv.leadPhone?.includes(search) ||
        conv.leadEmail?.toLowerCase().includes(search.toLowerCase());

      const matchChannel =
        channelFilter === "ALL" || conv.channel === channelFilter;

      return matchSearch && matchChannel;
    });
  }, [conversations, search, channelFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          {t("conversations.title")}
        </h1>
        <p className="font-body text-sm text-[var(--text-secondary)] mt-1">
          {t("conversations.subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search") + "..."}
            className="pl-9 font-body"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {["ALL", "WHATSAPP", "EMAIL", "SMS"].map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium font-body whitespace-nowrap transition-colors border",
                channelFilter === ch
                  ? "bg-[var(--brand)] text-black border-[var(--brand)]"
                  : "bg-transparent text-[var(--text-secondary)] border-[hsl(var(--border))] hover:border-[var(--brand)]/50"
              )}
            >
              {ch === "ALL" ? "All" : ch}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations list */}
      {filtered.length > 0 ? (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <div className="divide-y divide-[hsl(var(--border))]">
            {filtered.map((conv) => {
              const channel = CHANNEL_CONFIG[conv.channel] || CHANNEL_CONFIG.WHATSAPP;
              const ChannelIcon = channel.icon;

              return (
                <Link
                  key={conv.id}
                  href={`/${locale}/conversations/${conv.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-[hsl(var(--muted))]/50 transition-colors group"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Avatar with active indicator */}
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
                        <span className="text-xs font-semibold font-body text-[hsl(var(--muted-foreground))]">
                          {getInitials(conv.leadName)}
                        </span>
                      </div>
                      {conv.isActive && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[hsl(var(--card))]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-body text-sm font-medium leading-none truncate">
                          {conv.leadName || conv.leadPhone || conv.leadEmail || "Unknown"}
                        </p>
                        {conv.isAIEnabled && (
                          <Brain className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
                        )}
                      </div>
                      <p className="font-body text-xs text-[var(--text-secondary)] mt-1.5 truncate max-w-[400px]">
                        {conv.lastMessageContent || "..."}
                      </p>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {/* Channel badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold font-body border ${channel.color}`}
                    >
                      <ChannelIcon className="w-3 h-3" />
                      {channel.label}
                    </span>

                    {/* Message count */}
                    <span className="font-body text-[11px] text-[var(--text-secondary)]">
                      {conv.messageCount} msg
                    </span>

                    {/* Time */}
                    <span className="font-body text-[11px] text-[var(--text-secondary)] flex items-center gap-1 min-w-[50px] justify-end">
                      <Clock className="w-3 h-3" />
                      {conv.lastMessageAt ? formatRelative(conv.lastMessageAt) : "—"}
                    </span>

                    <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))] group-hover:text-[var(--brand)] transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-16 text-center animate-fade-in-up">
          <div className="w-12 h-12 rounded-xl bg-[hsl(var(--muted))] flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
          </div>
          <p className="font-display font-medium text-base">
            {t("conversations.noConversations")}
          </p>
          <p className="font-body text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            {t("conversations.noConversationsDescription")}
          </p>
        </div>
      )}
    </div>
  );
}

function getInitials(name: string | null): string {
  if (!name) return "??";
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatRelative(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}