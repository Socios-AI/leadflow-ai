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
interface Msg { id: string; direction: "INBOUND" | "OUTBOUND"; content: string; contentType: string; isAIGenerated: boolean; status: string; createdAt: string; }
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
        <div className="shrink-0 px-5 pt-4 pb-2">
          <div className="flex items-center justify-between mb-1">
            <h1 className="font-space-grotesk text-lg font-bold text-foreground tracking-tight">{t("title")}</h1>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{ac} {t("active")}</span>
              {ai > 0 && <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md flex items-center gap-1"><Brain className="w-3 h-3" />{ai}</span>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground font-dm-sans">{t("subtitle")}</p>
        </div>

        <div className="shrink-0 px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={t("searchPlaceholder")}
              className="w-full h-9 pl-9 pr-8 rounded-lg bg-muted border border-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring/30 transition-all font-dm-sans" />
            {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2 flex gap-1">
          {[["ALL", t("all")], ["WHATSAPP", "WhatsApp"], ["EMAIL", "Email"], ["SMS", "SMS"]].map(([k, l]) => (
            <button key={k} onClick={() => setChF(k)} className={cn("px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors", chF === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>{l}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadList ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3"><Headphones className="w-5 h-5 text-muted-foreground/40" /></div>
              <p className="text-[13px] font-medium text-foreground">{q ? t("noResults") : t("noConversations")}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{q ? t("tryOtherTerm") : t("noConversationsDescription")}</p>
            </div>
          ) : list.map(c => {
            const cfg = CH[c.channel] || CH.WHATSAPP; const Ic = cfg.icon; const s = c.id === selId;
            return (
              <button key={c.id} onClick={() => setSelId(c.id)} className={cn("w-full flex items-start gap-3 px-4 py-3 text-left cursor-pointer relative border-b border-border/20 transition-colors", s ? "bg-muted" : "hover:bg-muted/40")}>
                {s && <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-primary" />}
                <div className="relative shrink-0 mt-0.5">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold", s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{ini(c.leadName)}</div>
                  {c.isActive && <span className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", cfg.dot)} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={cn("text-[13px] truncate", s ? "font-semibold" : "font-medium")}>{c.leadName}</p>
                      {c.isAIEnabled && <Brain className="w-3 h-3 text-primary shrink-0" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{ago(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Ic className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    <p className="text-[12px] text-muted-foreground truncate flex-1">{c.lastMessage || t("noMessages")}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border", cfg.badge)}>{cfg.label}</span>
                    {c.messageCount > 0 && <span className="text-[10px] text-muted-foreground/40">{c.messageCount} msg</span>}
                    {c.unreadCount > 0 && <span className="ml-auto w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{c.unreadCount}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ════════════════ RIGHT: CHAT ════════════════ */}
      {selId && sel ? (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-4 lg:px-5 py-2.5 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setSelId(null)} className="lg:hidden p-1 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"><ChevronLeft className="w-5 h-5" /></button>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-primary text-primary-foreground">{ini(sel.leadName)}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-space-grotesk text-[14px] font-semibold truncate">{sel.leadName}</p>
                  {sel.isActive && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-dm-sans">
                  {(() => { const C = (CH[sel.channel] || CH.WHATSAPP).icon; return <C className="w-3 h-3" />; })()}
                  <span>{sel.leadPhone || sel.leadEmail || sel.channel}</span>
                  {sel.messageCount > 0 && <><span className="opacity-20">·</span><span>{sel.messageCount} {t("msgLabel")}</span></>}
                </div>
              </div>
            </div>
            <button onClick={toggle} disabled={toggling || !det} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-semibold cursor-pointer border transition-all", det?.isAIEnabled ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border")}>
              {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : det?.isAIEnabled ? <><Brain className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t("aiActive")}</span><Pause className="w-3 h-3 opacity-50" /></> : <><Bot className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t("aiPaused")}</span><Play className="w-3 h-3 opacity-50" /></>}
            </button>
          </div>

          {det && !det.isAIEnabled && (
            <div className="shrink-0 flex items-center gap-2 px-5 py-1.5 bg-amber-500/[0.06] border-b border-amber-500/10">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-500 font-medium font-dm-sans">{t("pausedBanner")} <button onClick={toggle} className="underline underline-offset-2 cursor-pointer">{t("reactivate")}</button></p>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-5 py-3 space-y-1.5">
            {loadChat ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>
            ) : msgs.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-center">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3"><Bot className="w-5 h-5 text-muted-foreground/40" /></div>
                  <p className="text-[13px] text-muted-foreground font-dm-sans">{t("noMessages")}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-1">{t("aiWillStart")}</p>
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
                      {gap && <div className="flex justify-center py-1.5"><span className="text-[10px] text-muted-foreground/30 bg-muted/50 px-2.5 py-0.5 rounded-full">{ftime(m.createdAt)}</span></div>}
                      <div className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[72%] rounded-2xl px-3.5 py-2.5 border", out ? m.isAIGenerated ? "bg-primary/[0.07] border-primary/10" : "bg-muted border-border/50" : "bg-card border-border/50")}>
                          {m.isAIGenerated && out && <div className="flex items-center gap-1 mb-1"><Brain className="w-2.5 h-2.5 text-primary" /><span className="text-[8px] font-bold text-primary tracking-wider uppercase">{t("aiBadge")}</span></div>}
                          <p className="text-[13px] leading-[1.6] font-dm-sans whitespace-pre-wrap">{m.content}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[9px] text-muted-foreground/40">{ftime(m.createdAt)}</span>
                            {out && (m.status === "SENT" || m.status === "DELIVERED" ? <CheckCheck className="w-3 h-3 text-primary" /> : m.status === "SENDING" ? <Clock className="w-2.5 h-2.5 text-muted-foreground/30" /> : m.status === "FAILED" ? <span className="text-destructive text-[9px]">!</span> : <Check className="w-3 h-3 text-muted-foreground/30" />)}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={endR} />
              </>
            )}
          </div>

          <div className="shrink-0 px-4 lg:px-5 py-2.5 border-t border-border">
            <div className="flex items-end gap-2">
              <textarea ref={inpR} value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={t("writeMessage")} rows={1}
                className="flex-1 min-h-[40px] max-h-[120px] px-3.5 py-2.5 rounded-xl bg-muted border border-transparent text-[13px] placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-ring/30 transition-all font-dm-sans" />
              <button onClick={send} disabled={!inp.trim() || sending} className="w-10 h-10 rounded-xl btn-brand flex items-center justify-center shrink-0 disabled:opacity-25 disabled:cursor-not-allowed">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4"><Headphones className="w-6 h-6 text-muted-foreground/20" /></div>
            <p className="font-space-grotesk text-[14px] font-semibold text-foreground/70">{t("selectConversation")}</p>
            <p className="text-[12px] text-muted-foreground/60 mt-1 max-w-[240px] mx-auto">{t("selectConversationDesc")}</p>
          </div>
        </div>
      )}
    </div>
  );
}