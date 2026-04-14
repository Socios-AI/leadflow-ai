// src/app/[locale]/(dashboard)/conversations/[id]/page.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Pause,
  Play,
  Send,
  Phone,
  Mail,
  Smartphone,
  Clock,
  AlertTriangle,
  Bot,
  User,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface ConversationDetail {
  id: string;
  channel: string;
  isActive: boolean;
  isAIEnabled: boolean;
  sentiment: string | null;
  lead: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
}

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  contentType: string;
  isAIGenerated: boolean;
  status: string;
  createdAt: string;
}

const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  WHATSAPP: Phone,
  EMAIL: Mail,
  SMS: Smartphone,
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
function getInitials(name: string | null): string {
  if (!name) return "??";
  return name.split(" ").filter(Boolean).map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ═══════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════ */
export default function ConversationDetailPage() {
  const params = useParams();
  const locale = useLocale();
  const conversationId = params.id as string;

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [togglingAI, setTogglingAI] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load conversation + messages ──
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setConversation(data.conversation);
        setMessages(data.messages || []);
      } catch (err) {
        console.error("Failed to load conversation:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conversationId]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Toggle AI ──
  const toggleAI = useCallback(async () => {
    if (!conversation || togglingAI) return;
    setTogglingAI(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/toggle-ai`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !conversation.isAIEnabled }),
      });
      if (res.ok) {
        setConversation((prev) =>
          prev ? { ...prev, isAIEnabled: !prev.isAIEnabled } : prev
        );
      }
    } catch (err) {
      console.error("Toggle AI failed:", err);
    } finally {
      setTogglingAI(false);
    }
  }, [conversation, conversationId, togglingAI]);

  // ── Send message ──
  const sendMessage = useCallback(async () => {
    if (!input.trim() || sending) return;

    const content = input.trim();
    setInput("");
    setSending(true);

    // Optimistic UI
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      direction: "OUTBOUND",
      content,
      contentType: "TEXT",
      isAIGenerated: false,
      status: "SENDING",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, disableAI: false }),
      });

      if (res.ok) {
        const saved = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...saved } : m))
        );
      }
    } catch (err) {
      console.error("Send failed:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id ? { ...m, status: "FAILED" } : m
        )
      );
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, sending, conversationId]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Conversa não encontrada</p>
      </div>
    );
  }

  const leadName = conversation.lead.name || conversation.lead.phone || conversation.lead.email || "Lead";
  const ChannelIcon = CHANNEL_ICON[conversation.channel] || Phone;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ═══ Header ═══ */}
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/${locale}/conversations`}
            className="p-1.5 -ml-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>

          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {getInitials(conversation.lead.name)}
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-display text-sm font-semibold truncate">{leadName}</p>
              {conversation.isActive && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-body">
              <ChannelIcon className="w-3 h-3" />
              <span>{conversation.channel}</span>
              <span className="text-border">·</span>
              <span>{conversation.lead.phone || conversation.lead.email}</span>
            </div>
          </div>
        </div>

        {/* AI Toggle */}
        <button
          onClick={toggleAI}
          disabled={togglingAI}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border",
            conversation.isAIEnabled
              ? "bg-(--chip-brand-bg) text-(--chip-brand-text) border-(--chip-brand-border) hover:brightness-110"
              : "bg-muted text-muted-foreground border-border hover:bg-accent"
          )}
        >
          {togglingAI ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : conversation.isAIEnabled ? (
            <>
              <Brain className="w-3.5 h-3.5" />
              <span>IA Ativa</span>
              <Pause className="w-3 h-3 opacity-60" />
            </>
          ) : (
            <>
              <Bot className="w-3.5 h-3.5" />
              <span>IA Pausada</span>
              <Play className="w-3 h-3 opacity-60" />
            </>
          )}
        </button>
      </div>

      {/* ═══ AI Paused Banner ═══ */}
      {!conversation.isAIEnabled && (
        <div className="shrink-0 flex items-center gap-2 px-4 md:px-6 py-2.5 bg-amber-500/[0.06] border-b border-amber-500/[0.12]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-500 font-medium font-body">
            IA pausada nesta conversa — você está no controle manual.
            <button
              onClick={toggleAI}
              className="ml-2 underline underline-offset-2 hover:brightness-110 cursor-pointer"
            >
              Reativar IA
            </button>
          </p>
        </div>
      )}

      {/* ═══ Messages ═══ */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                <Bot className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground font-body">
                Nenhuma mensagem ainda
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isOutbound = msg.direction === "OUTBOUND";
          return (
            <div
              key={msg.id}
              className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-3 relative",
                  isOutbound
                    ? msg.isAIGenerated
                      ? "bg-(--chip-brand-bg) border border-(--chip-brand-border) text-foreground"
                      : "bg-muted border border-border text-foreground"
                    : "bg-card border border-border text-foreground"
                )}
              >
                {/* AI badge */}
                {msg.isAIGenerated && isOutbound && (
                  <div className="flex items-center gap-1 mb-1.5">
                    <Brain className="w-3 h-3 text-(--chip-brand-text)" />
                    <span className="text-[9px] font-semibold text-(--chip-brand-text) tracking-wider uppercase">
                      Resposta da IA
                    </span>
                  </div>
                )}

                <p className="text-[13px] leading-relaxed font-body whitespace-pre-wrap">
                  {msg.content}
                </p>

                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(msg.createdAt)}
                  </span>
                  {isOutbound && (
                    <span
                      className={cn(
                        "text-[10px]",
                        msg.status === "SENT" || msg.status === "DELIVERED"
                          ? "text-(--chip-brand-text)"
                          : msg.status === "FAILED"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      )}
                    >
                      {msg.status === "SENT" || msg.status === "DELIVERED"
                        ? "✓✓"
                        : msg.status === "SENDING"
                          ? "..."
                          : msg.status === "FAILED"
                            ? "✗"
                            : "✓"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ═══ Input ═══ */}
      <div className="shrink-0 px-4 md:px-6 py-3 border-t border-border bg-card">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Digite uma mensagem..."
            rows={1}
            className="flex-1 min-h-[44px] max-h-[120px] px-4 py-3 rounded-xl bg-muted border border-border text-[13px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-body"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-xl btn-brand flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}