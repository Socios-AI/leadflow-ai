// src/app/[locale]/(dashboard)/settings/integrations/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Facebook,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  TestTube,
  Trash2,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════

interface WebhookItem {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  webhookUrl: string;
  createdAt: string;
}
interface Campaign {
  id: string;
  name: string;
}
interface MetaPage {
  id: string;
  name: string;
  category?: string;
}
interface MetaAdAccount {
  id: string;
  name: string;
  currency?: string;
  status?: string;
}
type MetaStatus =
  | {
      connected: true;
      userName?: string;
      email?: string;
      pages?: MetaPage[];
      adAccounts?: MetaAdAccount[];
      businessName?: string | null;
      businessNiche?: string | null;
      businessProduct?: string | null;
      connectedAt?: string;
      expiresAt?: string;
    }
  | { connected: false };
type GoogleStatus =
  | { connected: true; email: string; calendarId: string; connectedAt: string }
  | { connected: false };

type Section = "connections" | "lead-sources" | "test" | "docs";

// ═════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════

export default function IntegrationsPage() {
  const [section, setSection] = useState<Section>("connections");
  const [loading, setLoading] = useState(true);

  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metaStatus, setMetaStatus] = useState<MetaStatus>({ connected: false });
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ connected: false });

  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [whRes, campRes, metaRes, gcalRes] = await Promise.all([
        fetch("/api/webhooks/manage"),
        fetch("/api/campaigns"),
        fetch("/api/integrations/meta/status"),
        fetch("/api/integrations/google/status"),
      ]);
      const wh = await whRes.json().catch(() => []);
      const camp = await campRes.json().catch(() => []);
      const meta = await metaRes.json().catch(() => ({ connected: false }));
      const gcal = await gcalRes.json().catch(() => ({ connected: false }));
      setWebhooks(Array.isArray(wh) ? wh : []);
      setCampaigns(Array.isArray(camp) ? camp : []);
      setMetaStatus(meta);
      setGoogleStatus(gcal);
    } catch {
      // silent — page stays usable even if one endpoint fails
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── surface OAuth callback results via query string ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const meta = qs.get("meta");
    const google = qs.get("google");
    if (meta === "connected") setBanner({ kind: "success", text: "Meta conectado com sucesso." });
    else if (meta === "error") setBanner({ kind: "error", text: "Não foi possível conectar ao Meta. Tente novamente." });
    else if (google === "connected") setBanner({ kind: "success", text: "Google Calendar conectado com sucesso." });
    else if (google === "error") setBanner({ kind: "error", text: "Não foi possível conectar ao Google. Tente novamente." });
    if (meta || google) {
      // clean query string
      const url = new URL(window.location.href);
      url.searchParams.delete("meta");
      url.searchParams.delete("google");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
      const t = setTimeout(() => setBanner(null), 4500);
      return () => clearTimeout(t);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <header className="space-y-1.5">
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground">
          Integrações
        </h1>
        <p className="text-[13.5px] text-muted-foreground max-w-2xl">
          Conecte suas plataformas de tráfego, agenda e fontes de leads. Tudo o que for ligado aqui fica disponível para a IA usar nos atendimentos em tempo real.
        </p>
      </header>

      {/* Banner */}
      {banner && (
        <div
          className={cn(
            "flex items-start gap-2.5 px-4 py-3 rounded-lg border text-[13px]",
            banner.kind === "success"
              ? "bg-primary/10 border-primary/20 text-foreground"
              : "bg-destructive/10 border-destructive/20 text-foreground"
          )}
        >
          {banner.kind === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-muted-foreground hover:text-foreground text-[11px] font-medium"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {[
          { key: "connections", label: "Conexões" },
          { key: "lead-sources", label: "Fontes de leads" },
          { key: "test", label: "Teste" },
          { key: "docs", label: "Documentação" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key as Section)}
            className={cn(
              "relative px-3.5 py-2.5 text-[13px] font-medium -mb-px border-b-2 transition-colors",
              section === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {section === "connections" && (
        <ConnectionsSection
          meta={metaStatus}
          google={googleStatus}
          onRefresh={loadAll}
        />
      )}

      {section === "lead-sources" && (
        <LeadSourcesSection
          webhooks={webhooks}
          setWebhooks={setWebhooks}
          campaigns={campaigns}
        />
      )}

      {section === "test" && (
        <TestSection webhooks={webhooks} campaigns={campaigns} />
      )}

      {section === "docs" && <DocsSection />}
    </div>
  );
}

// ═════════════════════════════════════════════
// CONNECTIONS (Meta + Google Calendar)
// ═════════════════════════════════════════════

function ConnectionsSection({
  meta,
  google,
  onRefresh,
}: {
  meta: MetaStatus;
  google: GoogleStatus;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5 stagger-children">
      <MetaCard status={meta} onRefresh={onRefresh} />
      <GoogleCalendarCard status={google} onRefresh={onRefresh} />
    </div>
  );
}

// ── META ──────────────────────────────────────

function MetaCard({ status, onRefresh }: { status: MetaStatus; onRefresh: () => void }) {
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = () => {
    window.location.href = "/api/integrations/meta/connect";
  };

  const handleDisconnect = async () => {
    if (!confirm("Desconectar a conta Meta? A IA deixa de receber novos leads dos formulários nativos.")) return;
    setDisconnecting(true);
    await fetch("/api/integrations/meta/disconnect", { method: "POST" });
    setDisconnecting(false);
    onRefresh();
  };

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-4 px-6 py-5 border-b border-border">
        <div className="w-11 h-11 rounded-xl bg-[#1877F2]/10 text-[#1877F2] grid place-items-center shrink-0">
          <Facebook className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-[15px] font-semibold text-foreground">
              Meta Business
            </h2>
            <StatusPill connected={status.connected} />
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Facebook, Instagram e Lead Ads — conecte uma única vez e a IA passa a receber os leads em tempo real.
          </p>
        </div>
        {!status.connected ? (
          <Button onClick={handleConnect} className="shrink-0">
            <Link2 className="w-4 h-4 mr-1.5" />
            Conectar Meta
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="shrink-0 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            {disconnecting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            Desconectar
          </Button>
        )}
      </div>

      {/* Body */}
      {!status.connected ? (
        <MetaEmptyState />
      ) : (
        <MetaConnectedBody status={status} />
      )}
    </section>
  );
}

function MetaEmptyState() {
  const features: { icon: React.ElementType; text: string }[] = [
    { icon: Sparkles, text: "Recebimento automático de leads de campanhas Meta (Facebook/Instagram Lead Ads)." },
    { icon: Sparkles, text: "Atendimento imediato pelo WhatsApp assim que o lead preenche o formulário." },
    { icon: Sparkles, text: "Leitura das páginas e contas de anúncio conectadas para contextualizar a IA." },
  ];
  return (
    <div className="px-6 py-6 space-y-4">
      <ul className="space-y-2.5">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] text-foreground/90">
            <f.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-muted-foreground">
        Ao clicar em <strong className="text-foreground">Conectar Meta</strong>, você é redirecionado ao Facebook para autorizar o acesso. Suas credenciais nunca passam por aqui.
      </p>
    </div>
  );
}

function MetaConnectedBody({ status }: { status: Extract<MetaStatus, { connected: true }> }) {
  return (
    <div className="divide-y divide-border">
      {/* Account summary */}
      <div className="px-6 py-5 grid sm:grid-cols-2 gap-x-6 gap-y-3">
        <MetaMeta label="Usuário" value={status.userName || "—"} />
        <MetaMeta label="E-mail" value={status.email || "—"} />
        <MetaMeta
          label="Páginas conectadas"
          value={`${status.pages?.length || 0}`}
        />
        <MetaMeta
          label="Contas de anúncio"
          value={`${status.adAccounts?.length || 0}`}
        />
      </div>

      {/* Pages + Ad accounts */}
      {(status.pages?.length || status.adAccounts?.length) ? (
        <div className="px-6 py-5 grid md:grid-cols-2 gap-6">
          {status.pages && status.pages.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Páginas
              </h3>
              <ul className="space-y-1.5">
                {status.pages.slice(0, 6).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/60 text-[12.5px]"
                  >
                    <span className="truncate font-medium text-foreground">{p.name}</span>
                    {p.category && (
                      <span className="text-[10.5px] text-muted-foreground shrink-0">{p.category}</span>
                    )}
                  </li>
                ))}
                {status.pages.length > 6 && (
                  <li className="text-[11px] text-muted-foreground pl-3">
                    + {status.pages.length - 6} outras
                  </li>
                )}
              </ul>
            </div>
          )}
          {status.adAccounts && status.adAccounts.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Contas de anúncio
              </h3>
              <ul className="space-y-1.5">
                {status.adAccounts.slice(0, 6).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/60 text-[12.5px]"
                  >
                    <span className="truncate font-medium text-foreground">{a.name}</span>
                    {a.currency && (
                      <span className="text-[10.5px] text-muted-foreground shrink-0">{a.currency}</span>
                    )}
                  </li>
                ))}
                {status.adAccounts.length > 6 && (
                  <li className="text-[11px] text-muted-foreground pl-3">
                    + {status.adAccounts.length - 6} outras
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {/* Business context form */}
      <BusinessContextForm initial={status} />
    </div>
  );
}

function MetaMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-[13px] text-foreground mt-0.5 truncate">{value}</div>
    </div>
  );
}

function BusinessContextForm({
  initial,
}: {
  initial: Extract<MetaStatus, { connected: true }>;
}) {
  const [name, setName] = useState(initial.businessName || "");
  const [niche, setNiche] = useState(initial.businessNiche || "");
  const [product, setProduct] = useState(initial.businessProduct || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/integrations/meta/business", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: name.trim() || null,
        businessNiche: niche.trim() || null,
        businessProduct: product.trim() || null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="space-y-0.5">
        <h3 className="font-display text-[14px] font-semibold text-foreground">
          Contexto do negócio
        </h3>
        <p className="text-[12px] text-muted-foreground">
          A IA usa estas informações para personalizar o atendimento dos leads que vêm das suas campanhas.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="biz-name" className="text-[12px]">Nome do negócio</Label>
          <Input
            id="biz-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Minha empresa"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="biz-niche" className="text-[12px]">Nicho / segmento</Label>
          <Select value={niche} onValueChange={setNiche}>
            <SelectTrigger id="biz-niche" className="text-[13px]">
              <SelectValue placeholder="Selecione um nicho" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ecommerce">E-commerce</SelectItem>
              <SelectItem value="servicos-locais">Serviços locais</SelectItem>
              <SelectItem value="infoproduto">Infoproduto / educação</SelectItem>
              <SelectItem value="saude-estetica">Saúde e estética</SelectItem>
              <SelectItem value="imobiliaria">Imobiliária</SelectItem>
              <SelectItem value="financeiro">Financeiro / seguros</SelectItem>
              <SelectItem value="b2b">B2B / SaaS</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="biz-offer" className="text-[12px]">Produto ou oferta principal</Label>
        <Textarea
          id="biz-offer"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="Descreva o que você vende, o preço médio, para quem é, e o diferencial. A IA vai usar isso no atendimento."
          rows={4}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : saved ? (
            <Check className="w-3.5 h-3.5 mr-1.5" />
          ) : null}
          {saved ? "Salvo" : "Salvar contexto"}
        </Button>
        {saved && (
          <span className="text-[12px] text-muted-foreground">Atualizado agora.</span>
        )}
      </div>
    </div>
  );
}

// ── GOOGLE CALENDAR ──────────────────────────

function GoogleCalendarCard({
  status,
  onRefresh,
}: {
  status: GoogleStatus;
  onRefresh: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = () => {
    window.location.href = "/api/integrations/google/connect";
  };
  const handleDisconnect = async () => {
    if (!confirm("Desconectar o Google Calendar? A IA deixa de poder agendar reuniões.")) return;
    setDisconnecting(true);
    await fetch("/api/integrations/google/disconnect", { method: "POST" });
    setDisconnecting(false);
    onRefresh();
  };

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-4 px-6 py-5 border-b border-border">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
          <CalendarDays className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-[15px] font-semibold text-foreground">
              Google Calendar
            </h2>
            <StatusPill connected={status.connected} />
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            A IA consulta sua disponibilidade e cria reuniões automaticamente quando o objetivo do funil é agendar.
          </p>
        </div>
        {!status.connected ? (
          <Button onClick={handleConnect} className="shrink-0">
            <Link2 className="w-4 h-4 mr-1.5" />
            Conectar Google
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="shrink-0 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            {disconnecting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            Desconectar
          </Button>
        )}
      </div>

      {status.connected ? (
        <div className="px-6 py-5 grid sm:grid-cols-3 gap-x-6 gap-y-3">
          <MetaMeta label="Conta" value={status.email} />
          <MetaMeta label="Calendário" value={status.calendarId} />
          <MetaMeta
            label="Conectado em"
            value={new Date(status.connectedAt).toLocaleDateString("pt-BR")}
          />
        </div>
      ) : (
        <div className="px-6 py-6 text-[12.5px] text-muted-foreground">
          Ao conectar, a IA respeita os horários comerciais da sua persona e só oferece slots realmente livres.
        </div>
      )}
    </section>
  );
}

// ═════════════════════════════════════════════
// LEAD SOURCES (webhooks)
// ═════════════════════════════════════════════

function LeadSourcesSection({
  webhooks,
  setWebhooks,
  campaigns,
}: {
  webhooks: WebhookItem[];
  setWebhooks: React.Dispatch<React.SetStateAction<WebhookItem[]>>;
  campaigns: Campaign[];
}) {
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1800);
  };

  const createWebhook = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/webhooks/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Lead Webhook", events: ["lead.created"] }),
      });
      const data = await res.json();
      setWebhooks((prev) => [data, ...prev]);
    } catch {}
    setCreating(false);
  };

  const deleteWebhook = async (id: string) => {
    if (!confirm("Excluir este webhook? Qualquer integração apontada pra ele para de funcionar.")) return;
    await fetch(`/api/webhooks/manage?id=${id}`, { method: "DELETE" });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <div className="space-y-5">
      {webhooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground grid place-items-center mx-auto mb-3">
            <Webhook className="w-5 h-5" />
          </div>
          <p className="text-[13px] text-foreground mb-1 font-medium">
            Crie seu primeiro webhook de leads
          </p>
          <p className="text-[12px] text-muted-foreground mb-4 max-w-sm mx-auto">
            Qualquer formulário, landing page, CRM ou ferramenta de automação pode enviar leads pra esta URL.
          </p>
          <Button onClick={createWebhook} disabled={creating}>
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Criar webhook
          </Button>
        </div>
      ) : (
        webhooks.map((wh) => (
          <section
            key={wh.id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            <header className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <h3 className="font-display text-[14px] font-semibold text-foreground">
                  Lead Webhook
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteWebhook(wh.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </header>

            <div className="px-6 py-5 space-y-5">
              <Field label="URL do webhook">
                <div className="flex gap-2">
                  <Input
                    value={wh.webhookUrl}
                    readOnly
                    className="font-mono text-[12px] bg-muted/50"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(wh.webhookUrl, `url-${wh.id}`)}
                  >
                    {copied === `url-${wh.id}` ? (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </Field>

              <Field label="Secret (envie no header x-webhook-secret)">
                <div className="flex gap-2">
                  <Input
                    value={showSecret === wh.id ? wh.secret : "•".repeat(24)}
                    readOnly
                    className="font-mono text-[12px] bg-muted/50"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setShowSecret(showSecret === wh.id ? null : wh.id)
                    }
                  >
                    {showSecret === wh.id ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(wh.secret, `secret-${wh.id}`)}
                  >
                    {copied === `secret-${wh.id}` ? (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </Field>

              {campaigns.length > 0 && (
                <Field label="Atalhos por campanha (acrescenta ?campaign=ID)">
                  <ul className="space-y-1.5">
                    {campaigns.map((c) => {
                      const url = `${wh.webhookUrl}?campaign=${c.id}`;
                      return (
                        <li
                          key={c.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-medium text-foreground truncate">
                              {c.name}
                            </p>
                            <p className="text-[10.5px] font-mono text-muted-foreground truncate">
                              {url}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(url, `camp-${c.id}`)}
                          >
                            {copied === `camp-${c.id}` ? (
                              <Check className="w-3 h-3 text-primary" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </Field>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// ═════════════════════════════════════════════
// TEST
// ═════════════════════════════════════════════

function TestSection({
  webhooks,
  campaigns,
}: {
  webhooks: WebhookItem[];
  campaigns: Campaign[];
}) {
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    data?: unknown;
    error?: string;
  } | null>(null);

  const sendTestLead = async () => {
    if (!webhooks.length) return;
    setTesting(true);
    setResult(null);
    const wh = webhooks[0];
    const url = selectedCampaign
      ? `${wh.webhookUrl}?campaign=${selectedCampaign}`
      : wh.webhookUrl;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": wh.secret,
        },
        body: JSON.stringify({
          name: "Test Lead",
          email: `test-${Date.now()}@example.com`,
          phone: "+5511999990000",
          countryCode: "BR",
          source: "manual",
          metadata: { test: true },
        }),
      });
      const data = await res.json();
      setResult({ success: res.ok, data });
    } catch (err: unknown) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
    setTesting(false);
  };

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="px-6 py-4 border-b border-border">
        <h2 className="font-display text-[15px] font-semibold text-foreground">
          Enviar lead de teste
        </h2>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          Dispara um lead fictício no webhook para validar que a IA recebeu, gerou resposta e enviou pelo canal.
        </p>
      </header>

      <div className="px-6 py-5 space-y-4">
        {webhooks.length === 0 ? (
          <EmptyHint>
            Crie um webhook primeiro na aba <strong className="text-foreground">Fontes de leads</strong>.
          </EmptyHint>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Atrelar a uma campanha (opcional)</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem campanha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem campanha</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={sendTestLead} disabled={testing}>
              {testing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <TestTube className="w-3.5 h-3.5 mr-1.5" />
              )}
              Enviar lead de teste
            </Button>

            {result && (
              <div
                className={cn(
                  "rounded-lg border p-3 text-[12px]",
                  result.success
                    ? "bg-primary/10 border-primary/20 text-foreground"
                    : "bg-destructive/10 border-destructive/20 text-foreground"
                )}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  {result.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                  )}
                  <span
                    className={cn(
                      "font-medium",
                      result.success ? "text-primary" : "text-destructive"
                    )}
                  >
                    {result.success ? "Lead recebido com sucesso" : "Falha ao enviar"}
                  </span>
                </div>
                <pre className="font-mono text-[10.5px] bg-muted/70 p-2 rounded whitespace-pre-wrap break-words text-muted-foreground">
                  {JSON.stringify(result.data || result.error, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════
// DOCS
// ═════════════════════════════════════════════

function DocsSection() {
  const guides: { title: string; steps: string[] }[] = [
    {
      title: "Meta Lead Ads (Facebook / Instagram)",
      steps: [
        "Conecte sua conta Meta na aba Conexões — a IA passa a receber os leads direto das campanhas.",
        "Se preferir usar um intermediário (Zapier, Make, n8n), escolha o gatilho Facebook Lead Ads.",
        "Aponte o webhook da ferramenta para a URL da aba Fontes de leads.",
        "Inclua o header x-webhook-secret com o secret exibido.",
        "Mapeie os campos: full_name → name, email → email, phone_number → phone.",
      ],
    },
    {
      title: "Google Ads Lead Forms",
      steps: [
        "Dentro do Google Ads, acesse a extensão de formulário de lead.",
        "Em 'Lead delivery', escolha Webhook.",
        "Cole a URL da aba Fontes de leads.",
        "O Nexus detecta o formato user_column_data automaticamente.",
      ],
    },
    {
      title: "Landing pages (Unbounce, Webflow, personalizado)",
      steps: [
        "No construtor do formulário, procure por Webhook ou HTTP POST.",
        "Configure método POST e envie JSON: { name, email, phone }.",
        "Opcionais: countryCode, source, metadata.",
        "Adicione o header x-webhook-secret.",
      ],
    },
    {
      title: "Zapier / Make / n8n",
      steps: [
        "Crie um Zap/Cenário com qualquer gatilho (formulário, CRM, planilha).",
        "Adicione a ação Webhooks by Zapier / HTTP Request.",
        "Método POST e URL da aba Fontes de leads.",
        "Headers: Content-Type: application/json e x-webhook-secret: SEU_SECRET.",
      ],
    },
    {
      title: "Chamada direta à API",
      steps: [
        "POST /api/v1/webhooks/leads/{accountId}?campaign={campaignId}",
        "Headers: Content-Type: application/json, x-webhook-secret: SEU_SECRET",
        'Body: { "name": "João", "email": "joao@exemplo.com", "phone": "+5511999999999", "source": "marketing" }',
        "Resposta: { status: 'created', leadId: '...', channel: 'WHATSAPP' }",
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {guides.map((g) => (
        <DocCard key={g.title} title={g.title} steps={g.steps} />
      ))}
    </div>
  );
}

function DocCard({ title, steps }: { title: string; steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
      >
        <span className="font-display text-[14px] font-medium text-foreground">
          {title}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={cn(
            "text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-5 animate-fade-in">
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[12.5px] text-foreground/90 leading-relaxed">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0 mt-0.5 text-[10.5px] font-semibold">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// ═════════════════════════════════════════════
// Shared tiny building blocks
// ═════════════════════════════════════════════

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border",
        connected
          ? "bg-primary/10 text-primary border-primary/20"
          : "bg-muted text-muted-foreground border-border"
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          connected ? "bg-primary" : "bg-muted-foreground/60"
        )}
      />
      {connected ? "Conectado" : "Desconectado"}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11.5px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-muted/60 border border-border text-[12.5px] text-muted-foreground">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

