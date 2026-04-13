// src/app/[locale]/(dashboard)/settings/page.tsx
"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Settings, Link2, Users, CreditCard, Webhook, Key, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsLink {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const base = `/${locale}/settings`;

  const sections: SettingsLink[] = [
    {
      key: "general",
      href: `${base}/general`,
      icon: Settings,
      description: "Account name, timezone, language",
    },
    {
      key: "integrations",
      href: `${base}/integrations`,
      icon: Link2,
      description: "Webhook URLs, connect ad platforms, test leads",
    },
    {
      key: "team",
      href: `${base}/team`,
      icon: Users,
      description: "Invite members, manage roles",
    },
    {
      key: "billing",
      href: `${base}/billing`,
      icon: CreditCard,
      description: "Plan, invoices, payment method",
    },
    {
      key: "webhooks",
      href: `${base}/webhooks`,
      icon: Webhook,
      description: "Outbound webhooks for your systems",
    },
    {
      key: "apiKeys",
      href: `${base}/api-keys`,
      icon: Key,
      description: "API keys for programmatic access",
    },
  ];

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-semibold text-[22px] tracking-tight">
          {t("title")}
        </h1>
        <p className="font-body text-[13px] text-[var(--fg-secondary)] mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      <div className="space-y-2 stagger">
        {sections.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--brand)]/25 transition-all group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-[var(--bg-muted)] grid place-items-center group-hover:bg-[var(--brand-glow)] transition-colors">
                <section.icon className="w-[16px] h-[16px] text-[var(--fg-muted)] group-hover:text-[var(--brand)] transition-colors" />
              </div>
              <div>
                <p className="font-body text-[13px] font-medium">
                  {t(section.key)}
                </p>
                <p className="font-body text-[11px] text-[var(--fg-muted)] mt-0.5">
                  {section.description}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--fg-muted)] group-hover:text-[var(--brand)] transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}