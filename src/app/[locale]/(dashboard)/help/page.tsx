// src/app/[locale]/(dashboard)/help/page.tsx
//
// Help hub: a card grid linking to all in-platform documentation. The
// guides are the same ones we point operators to from the empty states
// of /pipeline, /channels and /ai-config. Keep the cards short and
// route-driven so it's clear what each one delivers.

"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  HelpCircle, Rocket, Brain, Phone, Filter, Plug,
  ArrowRight, BookOpen,
} from "lucide-react";

interface HelpCard {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  titleKey: string;
  descKey: string;
}

export default function HelpPage() {
  const t = useTranslations("help.hub");
  const locale = useLocale();

  const cards: HelpCard[] = [
    {
      href: `/${locale}/help/setup`,
      icon: Rocket,
      tone: "bg-primary/15 text-primary ring-primary/20",
      titleKey: "setupTitle",
      descKey: "setupDesc",
    },
    {
      href: `/${locale}/help/setup#training`,
      icon: Brain,
      tone: "bg-violet-500/15 text-violet-400 ring-violet-500/20",
      titleKey: "trainingTitle",
      descKey: "trainingDesc",
    },
    {
      href: `/${locale}/help/setup#channels`,
      icon: Phone,
      tone: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/20",
      titleKey: "channelsTitle",
      descKey: "channelsDesc",
    },
    {
      href: `/${locale}/help/setup#funnel`,
      icon: Filter,
      tone: "bg-amber-500/15 text-amber-400 ring-amber-500/20",
      titleKey: "funnelTitle",
      descKey: "funnelDesc",
    },
    {
      href: `/${locale}/help/webhooks`,
      icon: Plug,
      tone: "bg-blue-500/15 text-blue-400 ring-blue-500/20",
      titleKey: "webhooksTitle",
      descKey: "webhooksDesc",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-16 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary grid place-items-center text-primary-foreground shadow-sm">
          <HelpCircle className="w-5 h-5" />
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

      <section className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0 shadow-sm">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold text-foreground tracking-tight">
            {t("startHereTitle")}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
            {t("startHereDesc")}
          </p>
          <Link
            href={`/${locale}/help/setup`}
            className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
          >
            {t("startHereCta")}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link
            key={c.titleKey}
            href={c.href}
            className="rounded-2xl border border-border bg-card p-5 shadow-elevated hover:border-border/80 hover:bg-card/80 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl grid place-items-center ring-1 shrink-0 ${c.tone}`}>
                <c.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-[14px] font-semibold text-foreground tracking-tight flex items-center gap-1.5">
                  {t(c.titleKey)}
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  {t(c.descKey)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
