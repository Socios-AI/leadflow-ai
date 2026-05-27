// src/app/[locale]/(dashboard)/conversations/page.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Search, Brain, Phone, Mail, Smartphone, Send, Pause, Play,
  Clock, ChevronLeft, Bot, Loader2, AlertTriangle, Headphones,
  X, CheckCheck, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══ TYPES ═══ */
interface Conv { id: string; leadName: string; leadPhone: string | null; leadEmail: string | null; channel: string; isAIEnabled: boolean; isActive: boolean; lastMessage: string | null; lastMessageAt: string | null; unreadCount: number; sentiment: string | null; messageCount: number; }
interface Msg { id: string; direction: "INBOUND" | "OUTBOUND"; content: string; contentType: string; isAIGenerated: boolean; status: string; createdAt: string; metadata?: Record<string, unknown> | null; }
interface Detail { id: string; channel: string; isActive: boolean; isAIEnabled: boolean; sentiment: string | null; lead: { name: string | null; phone: string | null; email: string | null }; }

/* ═══ CONFIG ═══ */
const CH: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; dot: string; badge: string }> = {
  WHATSAPP: { icon: Phone, label: "WhatsApp", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  EMAIL:    { icon: Mail, label: "Email", dot: "bg-blue-500", badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  SMS:      { icon: Smartphone, label: "SMS", dot: "bg-violet-500", badge: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
};
function ini(n: string | null) { if (!n) return "??"; return n.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2); }

/* ═══ PAGE ═══ */
export default function ConversationsPage() {
  const t = useTranslations("conversations");
  const locale = useLocale();

  function ago(d: string | null): string {
    if (!d) return "";
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return t("time.now");
    if (m < 60) return `${m}${t("time.min")}`;
    if (m < 1440) return `${Math.floor(m / 60)}${t("time.hour")}`;
    if (m < 10080) return `${Math.floor(m / 1440)}${t("time.day")}`;
    return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short" });
  }

  function ftime(d: string): string {
    return new Date(d).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  /**
   * Map the raw `metadata.lastSendError` saved by send-parts.ts into a
   * short i18n key so the chat bubble can show "Sem WhatsApp" instead of
   * leaking the raw HTTP error to the operator.
   */
  function failReasonLabel(meta?: Record<string, unknown> | null): {
    label: string;
    hint?: string;
  } {
    const err = (meta && typeof meta.lastSendError === "string" ? meta.lastSendError : "").toLowerCase();
    if (!err) return { label: t("failGeneric") };
    if (err === "not_on_whatsapp" || err.includes("not_on_whatsapp")) {
      return { label: t("failNoWhatsapp"), hint: t("failNoWhatsappHint") };
    }
    if (err.includes("connection closed") || err.includes("auto-restart attempted")) {
      return { label: t("failInstanceOffline"), hint: t("failInstanceOfflineHint") };
    }
    if (err.includes("invalid_phone_format")) {
      return { label: t("failInvalidPhone") };
    }
    if (err.includes("missing_instance_name") || err.includes("missing_evolution")) {
      return { label: t("failChannelMisconfigured"), hint: t("failChannelMisconfiguredHint") };
    }
    if (err.includes("http 401") || err.includes("http 403")) {
      return { label: t("failAuth"), hint: t("failAuthHint") };
    }
    // Last resort: show the raw error in a small mono block so the
    // operator can copy it and ask for help.
    return { label: t("failGeneric"), hint: err.slice(0, 240) };
  }

  const [convs, setConvs] = useState<Conv[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [chF, setChF] = useState("ALL");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [det, setDet] = useState<Detail | null>(null);
  const [inp, setInp] = useState("");
  const [loadList, setLoadList] = useState(true);
  const [loadChat, setLoadChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const endR = useRef<HTMLDivElement>(null);
  const inpR = useRef<HTMLTextAreaElement>(null);
  const sel = convs.find(c => c.id === selId) || null;

  useEffect(() => { fetch("/api/conversations").then(r => r.ok ? r.json() : []).then(d => setConvs(Array.isArray(d) ? d : d?.conversations || [])).catch(() => {}).finally(() => setLoadList(false)); }, []);

  const list = useMemo(() => convs.filter(c => { const s = q.toLowerCase(); const ok = !s || c.leadName.toLowerCase().includes(s) || (c.leadPhone && c.leadPhone.includes(s)) || (c.leadEmail && c.leadEmail.toLowerCase().includes(s)); return ok && (chF === "ALL" || c.channel === chF); }), [convs, q, chF]);

  useEffect(() => {
    if (!selId) { setMsgs([]); setDet(null); return; }
    let x = false; setLoadChat(true);
    fetch(`/api/conversations/${selId}/messages`).then(r => r.ok ? r.json() : null).then(d => { if (!x && d) { setDet(d.conversation); setMsgs(d.messages || []); } }).catch(() => {}).finally(() => { if (!x) setLoadChat(false); });
    return () => { x = true; };
  }, [selId]);

  useEffect(() => { endR.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const toggle = useCallback(async () => {
    if (!det || toggling) return; setToggling(true);
    try { const r = await fetch(`/api/conversations/${det.id}/toggle-ai`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !det.isAIEnabled }) }); if (r.ok) { setDet(p => p ? { ...p, isAIEnabled: !p.isAIEnabled } : p); setConvs(p => p.map(c => c.id === det.id ? { ...c, isAIEnabled: !c.isAIEnabled } : c)); } } catch {} setToggling(false);
  }, [det, toggling]);

  const send = useCallback(async () => {
    if (!inp.trim() || sending || !selId) return; const txt = inp.trim(); setInp(""); setSending(true);
    const o: Msg = { id: `t${Date.now()}`, direction: "OUTBOUND", content: txt, contentType: "TEXT", isAIGenerated: false, status: "SENDING", createdAt: new Date().toISOString() };
    setMsgs(p => [...p, o]);
    try { const r = await fetch(`/api/conversations/${selId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: txt, disableAI: false }) }); if (r.ok) { const s = await r.json(); setMsgs(p => p.map(m => m.id === o.id ? { ...s } : m)); } } catch { setMsgs(p => p.map(m => m.id === o.id ? { ...m, status: "FAILED" } : m)); }
    setSending(false); inpR.current?.focus();
  }, [inp, sending, selId]);

  const ac = convs.filter(c => c.isActive).length;
  const ai = convs.filter(c => c.isAIEnabled).length;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-4rem)] overflow-hidden">

      {/* ════════════════ LEFT: LISTA ════════════════ */}
      <div className={cn("w-full lg:w-[380px] xl:w-[400px] shrink-0 border-r border-border flex flex-col overflow-hidden", selId ? "hidden lg:flex" : "flex")}>
        <div className="shrink-0 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <h1 className="font-display text-[18px] font-semibold text-foreground tracking-tight">{t("title")}</h1>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground bg-muted/70 px-2 py-0.5 rounded-md border border-border/50">{ac} {t("active")}</span>
              {ai > 0 && (
                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 flex items-center gap-1">
                  <Brain className="w-3 h-3" />{ai}
                </span>
              )}
            </div>
          </div>
          <p className="text-[11.5px] text-muted-foreground font-dm-sans">{t("subtitle")}</p>
        </div>

        <div className="shrink-0 px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="input-refined pl-9 pr-8 h-10"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-3">
          <div className="tab-bar w-full">
            {[["ALL", t("all")], ["WHATSAPP", "WhatsApp"], ["EMAIL", "Email"], ["SMS", "SMS"]].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setChF(k)}
                data-active={chF === k}
                className="tab-item flex-1 justify-center"
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadList ? (
            <div className="py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/20" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton-line w-32" />
                    <div className="skeleton-line w-48 opacity-70" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                <Headphones className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-[13.5px] font-semibold text-foreground">{q ? t("noResults") : t("noConversations")}</p>
              <p className="text-[11.5px] text-muted-foreground mt-1.5 max-w-[220px]">{q ? t("tryOtherTerm") : t("noConversationsDescription")}</p>
            </div>
          ) : list.map(c => {
            const cfg = CH[c.channel] || CH.WHATSAPP;
            const Ic = cfg.icon;
            const s = c.id === selId;
            return (
              <button
                key={c.id}
                onClick={() => setSelId(c.id)}
                data-selected={s}
                className="row-interactive w-full flex items-start gap-3 px-4 py-3 text-left cursor-pointer relative border-b border-border/20"
              >
                <div className="relative shrink-0 mt-0.5">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold ring-1 transition-colors",
                    s ? "bg-primary text-primary-foreground ring-primary/30" : "bg-gradient-to-br from-muted to-muted/60 text-muted-foreground ring-border/40"
                  )}>
                    {ini(c.leadName)}
                  </div>
                  {c.isActive && (
                    <span className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background shadow-sm", cfg.dot)} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={cn("text-[13px] truncate", s ? "font-semibold text-foreground" : "font-medium text-foreground")}>{c.leadName}</p>
                      {c.isAIEnabled && <Brain className="w-3 h-3 text-primary shrink-0" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">{ago(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Ic className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    <p className="text-[12px] text-muted-foreground truncate flex-1">{c.lastMessage || t("noMessages")}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold border tracking-wider", cfg.badge)}>
                      {cfg.label}
                    </span>
                    {c.messageCount > 0 && <span className="text-[10px] text-muted-foreground/50">{c.messageCount} msg</span>}
                    {c.unreadCount > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[9.5px] font-bold flex items-center justify-center shadow-md">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ════════════════ RIGHT: CHAT ════════════════ */}
      {selId && sel ? (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-gradient-to-b from-background to-background/95">
          <div className="shrink-0 flex items-center justify-between px-4 lg:px-5 py-3 border-b border-border bg-card/40 backdrop-blur-sm">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setSelId(null)} className="lg:hidden p-1 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
                {ini(sel.leadName)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-display text-[14px] font-semibold truncate text-foreground">{sel.leadName}</p>
                  {sel.isActive && <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)] shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-dm-sans">
                  {(() => { const C = (CH[sel.channel] || CH.WHATSAPP).icon; return <C className="w-3 h-3" />; })()}
                  <span>{sel.leadPhone || sel.leadEmail || sel.channel}</span>
                  {sel.messageCount > 0 && (
                    <>
                      <span className="opacity-30">·</span>
                      <span>{sel.messageCount} {t("msgLabel")}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={toggle}
              disabled={toggling || !det}
              className={cn(
                "flex items-center gap-2 h-9 px-3 rounded-xl text-[12px] font-semibold cursor-pointer border transition-all active:scale-[0.97]",
                det?.isAIEnabled
                  ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
              )}
            >
              {toggling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : det?.isAIEnabled ? (
                <>
                  <Brain className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("aiActive")}</span>
                  <Pause className="w-3 h-3 opacity-60" />
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("aiPaused")}</span>
                  <Play className="w-3 h-3 opacity-60" />
                </>
              )}
            </button>
          </div>

          {det && !det.isAIEnabled && (
            <div className="shrink-0 flex items-center gap-2 px-5 py-2 bg-amber-500/[0.08] border-b border-amber-500/15">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[11.5px] text-amber-500 font-medium font-dm-sans">
                {t("pausedBanner")}{" "}
                <button onClick={toggle} className="underline underline-offset-2 cursor-pointer font-semibold">{t("reactivate")}</button>
              </p>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 py-4 space-y-1.5">
            {loadChat ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}
                  >
                    <div
                      className="skeleton rounded-2xl"
                      style={{ width: `${40 + (i * 13) % 35}%`, height: `${44 + (i * 9) % 30}px`, animationDelay: `${i * 80}ms` }}
                    />
                  </div>
                ))}
              </div>
            ) : msgs.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-center">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4 animate-float">
                    <Bot className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-[13.5px] font-semibold text-foreground/80">{t("noMessages")}</p>
                  <p className="text-[11.5px] text-muted-foreground/70 mt-1.5 max-w-[240px]">{t("aiWillStart")}</p>
                </div>
              </div>
            ) : (
              <>
                {msgs.map((m, i) => {
                  const out = m.direction === "OUTBOUND";
                  const prev = msgs[i - 1];
                  const gap = !prev || (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) > 600000;
                  return (
                    <React.Fragment key={m.id}>
                      {gap && (
                        <div className="flex justify-center py-2">
                          <span className="text-[10px] text-muted-foreground/50 bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/40">
                            {ftime(m.createdAt)}
                          </span>
                        </div>
                      )}
                      <div className={cn("flex animate-fade-in-up", out ? "justify-end" : "justify-start")}>
                        <div className="flex flex-col gap-1.5 max-w-[72%]">
                          <div
                            className={cn(
                              "rounded-2xl px-3.5 py-2.5 border transition-shadow",
                              out
                                ? m.isAIGenerated
                                  ? m.status === "FAILED"
                                    ? "bg-rose-500/[0.06] border-rose-500/30 shadow-sm"
                                    : "bg-gradient-to-br from-primary/[0.1] to-primary/[0.05] border-primary/20 shadow-sm shadow-primary/5 hover:shadow-md hover:shadow-primary/10"
                                  : "bg-muted border-border/60 shadow-sm"
                                : "bg-card border-border/60 shadow-sm"
                            )}
                          >
                            {m.isAIGenerated && out && (
                              <div className="flex items-center gap-1 mb-1">
                                <Brain className="w-2.5 h-2.5 text-primary" />
                                <span className="text-[8.5px] font-bold text-primary tracking-[0.12em] uppercase">{t("aiBadge")}</span>
                              </div>
                            )}
                            <p className="text-[13px] leading-[1.6] font-dm-sans whitespace-pre-wrap">{m.content}</p>
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className="text-[9.5px] text-muted-foreground/50 tabular-nums">{ftime(m.createdAt)}</span>
                              {out && (m.status === "SENT" || m.status === "DELIVERED" ? (
                                <CheckCheck className="w-3 h-3 text-primary" />
                              ) : m.status === "SENDING" ? (
                                <Clock className="w-2.5 h-2.5 text-muted-foreground/40 animate-pulse" />
                              ) : m.status === "FAILED" ? (
                                <AlertTriangle className="w-3 h-3 text-rose-500" />
                              ) : (
                                <Check className="w-3 h-3 text-muted-foreground/40" />
                              ))}
                            </div>
                          </div>
                          {out && m.status === "FAILED" && (() => {
                            const { label, hint } = failReasonLabel(m.metadata);
                            return (
                              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 text-[11px] text-rose-500/90 font-dm-sans">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold leading-tight">{t("failTitle")}: {label}</p>
                                  {hint && (
                                    <p className="text-rose-500/70 mt-0.5 leading-snug break-words">{hint}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={endR} />
              </>
            )}
          </div>

          <div className="shrink-0 px-4 lg:px-5 py-3 border-t border-border bg-card/40 backdrop-blur-sm">
            <div className="flex items-end gap-2">
              <textarea
                ref={inpR}
                value={inp}
                onChange={e => setInp(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={t("writeMessage")}
                rows={1}
                className="flex-1 min-h-[42px] max-h-[120px] px-3.5 py-3 rounded-xl bg-muted border border-transparent text-[13px] placeholder:text-muted-foreground/45 resize-none focus:outline-none focus:border-ring/40 focus:bg-background focus:shadow-[0_0_0_4px_hsl(var(--ring)/0.12)] transition-all font-dm-sans"
              />
              <button
                onClick={send}
                disabled={!inp.trim() || sending}
                className="w-10 h-10 rounded-xl btn-brand flex items-center justify-center shrink-0 disabled:opacity-25 disabled:cursor-not-allowed active:scale-95 transition-transform"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-b from-background to-background/80">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-5 ring-1 ring-border/30 animate-float">
              <Headphones className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <p className="font-display text-[15px] font-semibold text-foreground/80">{t("selectConversation")}</p>
            <p className="text-[12.5px] text-muted-foreground/60 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
              {t("selectConversationDesc")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}