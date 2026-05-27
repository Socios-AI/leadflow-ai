// src/app/[locale]/(dashboard)/help/setup/page.tsx
//
// The end-to-end setup tutorial. Three sections (Training, Channels,
// Funnel) plus a "what to do when something goes wrong" troubleshooting
// block. Anchored sections (#training, #channels, #funnel, #trouble)
// because cards on /help link directly to them.
//
// All copy lives in messages/{pt,en,es,it}.json under help.setup.* so we
// can swap wording without touching the layout.

"use client";

import React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeft, Brain, Phone, Filter, BookOpen, ArrowRight,
  CheckCircle2, AlertTriangle, Sparkles, Database, Settings,
  MessageSquare, Plug, RefreshCw,
} from "lucide-react";

export default function SetupGuidePage() {
  const t = useTranslations("help.setup");
  const locale = useLocale();

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/help`}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="w-10 h-10 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center text-primary">
          <BookOpen className="w-5 h-5" />
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

      {/* Index */}
      <nav className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t("indexTitle")}
        </p>
        <ol className="space-y-2 text-[13px]">
          {[
            { anchor: "#training", label: t("step1ShortTitle"), icon: Brain },
            { anchor: "#channels", label: t("step2ShortTitle"), icon: Phone },
            { anchor: "#funnel", label: t("step3ShortTitle"), icon: Filter },
            { anchor: "#trouble", label: t("step4ShortTitle"), icon: AlertTriangle },
          ].map((it, i) => (
            <li key={it.anchor} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/12 text-primary text-[11px] font-bold grid place-items-center">
                {i + 1}
              </span>
              <a
                href={it.anchor}
                className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
              >
                <it.icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{it.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* STEP 1 — Training */}
      <Section
        id="training"
        idx={1}
        icon={Brain}
        tone="bg-violet-500/15 text-violet-400 ring-violet-500/25"
        title={t("step1Title")}
        intro={t("step1Intro")}
      >
        <SubSection icon={Settings} title={t("s1Sub1Title")}>
          <P>{t("s1Sub1P1")}</P>
          <Bullets items={t.raw("s1Sub1Bullets") as string[]} />
          <Tip>{t("s1Sub1Tip")}</Tip>
        </SubSection>

        <SubSection icon={Sparkles} title={t("s1Sub2Title")}>
          <P>{t("s1Sub2P1")}</P>
          <Steps items={t.raw("s1Sub2Steps") as string[]} />
          <Warn>{t("s1Sub2Warn")}</Warn>
        </SubSection>

        <SubSection icon={Database} title={t("s1Sub3Title")}>
          <P>{t("s1Sub3P1")}</P>
          <Bullets items={t.raw("s1Sub3Bullets") as string[]} />
          <P>{t("s1Sub3P2")}</P>
          <Steps items={t.raw("s1Sub3Steps") as string[]} />
          <Tip>{t("s1Sub3Tip")}</Tip>
        </SubSection>

        <ChecklistBox title={t("s1ChecklistTitle")}>
          {(t.raw("s1Checklist") as string[]).map((it, i) => (
            <ChecklistRow key={i}>{it}</ChecklistRow>
          ))}
        </ChecklistBox>

        <CTA href={`/${locale}/ai-config`} label={t("s1Cta")} />
      </Section>

      {/* STEP 2 — Channels */}
      <Section
        id="channels"
        idx={2}
        icon={Phone}
        tone="bg-emerald-500/15 text-emerald-500 ring-emerald-500/25"
        title={t("step2Title")}
        intro={t("step2Intro")}
      >
        <SubSection icon={Phone} title={t("s2Sub1Title")}>
          <P>{t("s2Sub1P1")}</P>
          <Steps items={t.raw("s2Sub1Steps") as string[]} />
          <Tip>{t("s2Sub1Tip")}</Tip>
          <P className="mt-3 font-semibold">{t("s2Sub1WhenFailsTitle")}</P>
          <Bullets
            items={t.raw("s2Sub1WhenFails") as string[]}
            icon={AlertTriangle}
            tone="text-amber-500"
          />
        </SubSection>

        <SubSection icon={MessageSquare} title={t("s2Sub2Title")}>
          <P>{t("s2Sub2P1")}</P>
          <Steps items={t.raw("s2Sub2Steps") as string[]} />
          <Tip>{t("s2Sub2Tip")}</Tip>
        </SubSection>

        <SubSection icon={MessageSquare} title={t("s2Sub3Title")}>
          <P>{t("s2Sub3P1")}</P>
          <Steps items={t.raw("s2Sub3Steps") as string[]} />
        </SubSection>

        <ChecklistBox title={t("s2ChecklistTitle")}>
          {(t.raw("s2Checklist") as string[]).map((it, i) => (
            <ChecklistRow key={i}>{it}</ChecklistRow>
          ))}
        </ChecklistBox>

        <CTA href={`/${locale}/channels/whatsapp`} label={t("s2Cta")} />
      </Section>

      {/* STEP 3 — Funnel */}
      <Section
        id="funnel"
        idx={3}
        icon={Filter}
        tone="bg-amber-500/15 text-amber-500 ring-amber-500/25"
        title={t("step3Title")}
        intro={t("step3Intro")}
      >
        <SubSection icon={Filter} title={t("s3Sub1Title")}>
          <P>{t("s3Sub1P1")}</P>
          <Bullets items={t.raw("s3Sub1Bullets") as string[]} />
        </SubSection>

        <SubSection icon={MessageSquare} title={t("s3Sub2Title")}>
          <P>{t("s3Sub2P1")}</P>
          <Steps items={t.raw("s3Sub2Steps") as string[]} />
          <Tip>{t("s3Sub2Tip")}</Tip>
        </SubSection>

        <SubSection icon={RefreshCw} title={t("s3Sub3Title")}>
          <P>{t("s3Sub3P1")}</P>
          <Steps items={t.raw("s3Sub3Steps") as string[]} />
          <Warn>{t("s3Sub3Warn")}</Warn>
        </SubSection>

        <SubSection icon={Plug} title={t("s3Sub4Title")}>
          <P>{t("s3Sub4P1")}</P>
          <Steps items={t.raw("s3Sub4Steps") as string[]} />
          <P className="mt-2">
            {t("s3Sub4MoreLink")}{" "}
            <Link href={`/${locale}/help/webhooks`} className="text-primary hover:underline">
              {t("s3Sub4MoreLinkLabel")}
            </Link>
            .
          </P>
        </SubSection>

        <ChecklistBox title={t("s3ChecklistTitle")}>
          {(t.raw("s3Checklist") as string[]).map((it, i) => (
            <ChecklistRow key={i}>{it}</ChecklistRow>
          ))}
        </ChecklistBox>

        <CTA href={`/${locale}/pipeline`} label={t("s3Cta")} />
      </Section>

      {/* STEP 4 — Troubleshooting */}
      <Section
        id="trouble"
        idx={4}
        icon={AlertTriangle}
        tone="bg-rose-500/15 text-rose-500 ring-rose-500/25"
        title={t("step4Title")}
        intro={t("step4Intro")}
      >
        <TroubleItem
          q={t("t1Q")}
          aTitle={t("t1ATitle")}
          steps={t.raw("t1Steps") as string[]}
        />
        <TroubleItem
          q={t("t2Q")}
          aTitle={t("t2ATitle")}
          steps={t.raw("t2Steps") as string[]}
        />
        <TroubleItem
          q={t("t3Q")}
          aTitle={t("t3ATitle")}
          steps={t.raw("t3Steps") as string[]}
        />
        <TroubleItem
          q={t("t4Q")}
          aTitle={t("t4ATitle")}
          steps={t.raw("t4Steps") as string[]}
        />
        <TroubleItem
          q={t("t5Q")}
          aTitle={t("t5ATitle")}
          steps={t.raw("t5Steps") as string[]}
        />

        <div className="rounded-xl border border-border/40 bg-muted/30 p-4 mt-4">
          <p className="text-[12.5px] text-foreground font-semibold">{t("supportTitle")}</p>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            {t("supportDesc")}
          </p>
        </div>
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════
// Layout primitives
// ════════════════════════════════════════════════════

function Section({
  id, idx, icon: Icon, tone, title, intro, children,
}: {
  id: string; idx: number; icon: React.ComponentType<{ className?: string }>;
  tone: string; title: string; intro: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-4 scroll-mt-24">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl grid place-items-center ring-1 shrink-0 ${tone}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted-foreground/80">
            {/* "STEP 01" / "PASSO 01" */}
            {/* idx is rendered as zero-padded for visual rhythm */}
            {String(idx).padStart(2, "0")}
          </p>
          <h2 className="font-display text-[18px] font-semibold text-foreground tracking-tight leading-tight mt-0.5">
            {title}
          </h2>
          <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
            {intro}
          </p>
        </div>
      </div>
      <div className="space-y-4 pl-1">{children}</div>
    </section>
  );
}

function SubSection({
  icon: Icon, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-elevated">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-display text-[14px] font-semibold text-foreground tracking-tight">
          {title}
        </h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[13px] text-foreground/90 leading-relaxed font-dm-sans ${className}`}>
      {children}
    </p>
  );
}

function Bullets({
  items, icon: Icon = CheckCircle2, tone = "text-emerald-500/70",
}: {
  items: string[];
  icon?: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-[12.5px] text-foreground/85 leading-relaxed">
          <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tone}`} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[12.5px] text-foreground/85 leading-relaxed">
          <span className="w-5 h-5 rounded-full bg-muted text-foreground text-[10.5px] font-bold grid place-items-center shrink-0 mt-0.5">
            {i + 1}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-2 text-[12px] text-foreground/80 flex items-start gap-2">
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-500/90 flex items-start gap-2">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function ChecklistBox({
  title, children,
}: {
  title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 space-y-2">
      <p className="text-[11.5px] font-bold uppercase tracking-wider text-emerald-500/90">
        {title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function ChecklistRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] text-foreground/85 leading-relaxed">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
      <span>{children}</span>
    </li>
  );
}

function CTA({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
    >
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  );
}

function TroubleItem({
  q, aTitle, steps,
}: {
  q: string; aTitle: string; steps: string[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-elevated">
      <p className="text-[13px] font-semibold text-foreground flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
        <span>{q}</span>
      </p>
      <p className="text-[12.5px] text-foreground/85 font-medium pl-6">{aTitle}</p>
      <div className="pl-6">
        <Steps items={steps} />
      </div>
    </div>
  );
}

