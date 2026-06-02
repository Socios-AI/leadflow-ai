// src/app/[locale]/(dashboard)/help/webhooks/page.tsx
//
// Step-by-step tutorial for wiring lead-source webhooks to this account.
// Linked from the pipeline page ("Ver guia de conexão passo a passo"),
// from the campaigns onboarding and from the integrations settings.

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  Mail,
  Megaphone,
  Plug,
  Zap,
} from "lucide-react";

interface SessionInfo {
  accountId?: string;
}

export default function WebhookHelpPage() {
  const t = useTranslations("help.webhooks");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: SessionInfo | null) => {
        if (s?.accountId) setAccountId(s.accountId);
      })
      .catch(() => {});
  }, []);

  const v1WebhookUrl = accountId
    ? `${origin}/api/v1/webhooks/leads/${accountId}`
    : "";

  function copy(key: string, value: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
  }

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/pipeline`}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="w-10 h-10 rounded-xl bg-primary grid place-items-center text-primary-foreground shadow-sm">
          <Plug className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-foreground leading-tight">
            {t("title")}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Universal webhook URL block */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-elevated space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 grid place-items-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
              {t("universalUrlTitle")}
            </h2>
            <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
              {t("universalUrlDesc")}
            </p>
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={v1WebhookUrl || t("loadingUrl")}
            className="flex-1 h-11 px-3 rounded-xl bg-muted border border-border/40 text-[12.5px] text-foreground font-mono"
          />
          <button
            onClick={() => copy("v1", v1WebhookUrl)}
            disabled={!v1WebhookUrl}
            className="h-11 px-4 rounded-xl border border-border text-[12.5px] font-medium hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            {copiedKey === "v1" ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedKey === "v1" ? tc("copied") : tc("copy")}
          </button>
        </div>
        <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {t("payloadTitle")}
          </p>
          <pre className="text-[11.5px] font-mono text-foreground overflow-x-auto whitespace-pre">
{`{
  "name": "Maria Silva",
  "email": "maria@example.com",
  "phone": "+5511999998888",
  "source": "MARKETING",
  "metadata": {
    "campaignName": "Black Friday",
    "adName": "Criativo A"
  }
}`}
          </pre>
        </div>
      </section>

      {/* Per-source tutorials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TutorialCard
          icon={Megaphone}
          tone="bg-blue-500/15 text-blue-400 ring-blue-500/20"
          title={t("metaTitle")}
          steps={[
            t("metaStep1"),
            t("metaStep2"),
            t("metaStep3"),
            t("metaStep4"),
          ]}
          docHref="https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving"
          docLabel={t("metaDocs")}
        />
        <TutorialCard
          icon={FileText}
          tone="bg-violet-500/15 text-violet-400 ring-violet-500/20"
          title={t("typeformTitle")}
          steps={[
            t("typeformStep1"),
            t("typeformStep2"),
            t("typeformStep3"),
          ]}
          docHref="https://www.typeform.com/help/a/connect-typeform-to-other-services-with-webhooks-360029266451/"
          docLabel={t("typeformDocs")}
        />
        <TutorialCard
          icon={Zap}
          tone="bg-amber-500/15 text-amber-400 ring-amber-500/20"
          title={t("zapierTitle")}
          steps={[
            t("zapierStep1"),
            t("zapierStep2"),
            t("zapierStep3"),
            t("zapierStep4"),
          ]}
          docHref="https://zapier.com/apps/webhook/help"
          docLabel={t("zapierDocs")}
        />
        <TutorialCard
          icon={Mail}
          tone="bg-rose-500/15 text-rose-400 ring-rose-500/20"
          title={t("genericTitle")}
          steps={[
            t("genericStep1"),
            t("genericStep2"),
            t("genericStep3"),
          ]}
          docHref={`/${locale}/settings/integrations`}
          docLabel={t("genericDocs")}
        />
      </div>

      {/* Testing block */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-display text-[14px] font-semibold text-foreground tracking-tight">
            {t("testTitle")}
          </h2>
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {t("testDesc")}
        </p>
        <pre className="text-[11.5px] font-mono text-foreground bg-muted/40 border border-border/40 rounded-xl p-3 overflow-x-auto whitespace-pre">
{`curl -X POST '${v1WebhookUrl || "<YOUR_URL>"}' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Teste Lead","email":"teste@example.com","phone":"+5511999990000"}'`}
        </pre>
        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
          {t("testHint")}
        </p>
      </section>

      <div className="flex items-center justify-between pt-3">
        <Link
          href={`/${locale}/pipeline`}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("backToPipeline")}
        </Link>
        <Link
          href={`/${locale}/settings/integrations`}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:underline"
        >
          {t("openIntegrations")}
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function TutorialCard({
  icon: Icon,
  tone,
  title,
  steps,
  docHref,
  docLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  steps: string[];
  docHref: string;
  docLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-elevated">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl grid place-items-center ring-1 ${tone}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-display text-[14px] font-semibold text-foreground tracking-tight flex-1 pt-1.5">
          {title}
        </h3>
      </div>
      <ol className="space-y-1.5 text-[12.5px] text-muted-foreground leading-relaxed mb-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="w-5 h-5 rounded-full bg-muted/60 text-foreground text-[10.5px] font-bold grid place-items-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="flex-1">{s}</span>
          </li>
        ))}
      </ol>
      <a
        href={docHref}
        target={docHref.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
      >
        {docLabel}
        <ArrowRight className="w-3 h-3" />
      </a>
    </div>
  );
}
