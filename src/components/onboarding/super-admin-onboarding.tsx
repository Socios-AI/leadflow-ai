// src/components/onboarding/super-admin-onboarding.tsx
//
// Full-screen onboarding overlay shown the first time a SUPER_ADMIN (or
// HIPER_ADMIN) lands on the dashboard. Five slides that explain:
//
//   1. Welcome + what the role means
//   2. Their responsibilities (create tenants for client companies)
//   3. How to create the first client tenant (live walkthrough)
//   4. What the client sees (each tenant is isolated)
//   5. CTA to open /admin
//
// Persistence: when the user clicks "Concluir" / "Skip", we POST to
// /api/admin/onboarding/complete which writes app_metadata on the
// Supabase user. The session reflects the flag on the next request, so
// the overlay never appears again unless the flag is cleared manually.

"use client";

import React, { useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Crown, Building2, ArrowRight, ArrowLeft,
  CheckCircle2, X, Shield, Layers, Sparkles, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Pass true on first mount so the overlay opens automatically. */
  open: boolean;
  /** True when the user is HIPER_ADMIN (changes copy slightly). */
  isHiper: boolean;
  onDismiss: () => void;
}

interface Slide {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  titleKey: string;
  descKey: string;
  bulletsKey?: string;
  ctaKey?: string;
  ctaHref?: string;
}

export function SuperAdminOnboarding({ open, isHiper, onDismiss }: Props) {
  const t = useTranslations("superAdminOnboarding");
  const locale = useLocale();
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const slides: Slide[] = [
    {
      icon: Crown,
      tone: "bg-amber-500/15 text-amber-500 ring-amber-500/25",
      titleKey: isHiper ? "s1TitleHiper" : "s1Title",
      descKey: isHiper ? "s1DescHiper" : "s1Desc",
      bulletsKey: isHiper ? "s1BulletsHiper" : "s1Bullets",
    },
    {
      icon: Shield,
      tone: "bg-primary/15 text-primary ring-primary/25",
      titleKey: "s2Title",
      descKey: "s2Desc",
      bulletsKey: "s2Bullets",
    },
    {
      icon: Building2,
      tone: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/25",
      titleKey: "s3Title",
      descKey: "s3Desc",
      bulletsKey: "s3Steps",
    },
    {
      icon: Layers,
      tone: "bg-violet-500/15 text-violet-400 ring-violet-500/25",
      titleKey: "s4Title",
      descKey: "s4Desc",
      bulletsKey: "s4Bullets",
    },
    {
      icon: Sparkles,
      tone: "bg-primary/15 text-primary ring-primary/25",
      titleKey: "s5Title",
      descKey: "s5Desc",
      ctaKey: "s5Cta",
      ctaHref: `/${locale}/admin`,
    },
  ];

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/onboarding/complete", { method: "POST" });
    } catch {
      // Non-fatal — user can dismiss again next session.
    } finally {
      setSaving(false);
      onDismiss();
    }
  }, [onDismiss]);

  if (!open) return null;

  const slide = slides[idx];
  const isLast = idx === slides.length - 1;
  const isFirst = idx === 0;
  const Icon = slide.icon;
  const bullets = slide.bulletsKey ? (t.raw(slide.bulletsKey) as string[]) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop, no click-to-close, intentional commitment to read it */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      <div className="relative max-w-xl w-full bg-card border border-border rounded-3xl shadow-floating overflow-hidden">
        {/* Skip in the corner */}
        <button
          onClick={finish}
          disabled={saving}
          className="absolute top-4 right-4 z-10 h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          aria-label={t("skip")}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress dots */}
        <div className="px-6 pt-6 pb-2 flex items-center gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 rounded-full transition-all",
                i === idx
                  ? "w-8 bg-primary"
                  : i < idx
                    ? "w-4 bg-primary/40"
                    : "w-4 bg-muted"
              )}
            />
          ))}
          <span className="ml-auto text-[10.5px] text-muted-foreground font-medium tabular-nums">
            {idx + 1} / {slides.length}
          </span>
        </div>

        <div className="px-7 pt-5 pb-8 space-y-5">
          <div className={cn("w-14 h-14 rounded-2xl grid place-items-center ring-1", slide.tone)}>
            <Icon className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-[20px] font-semibold tracking-tight text-foreground leading-tight">
              {t(slide.titleKey)}
            </h2>
            <p className="text-[13.5px] text-muted-foreground leading-relaxed font-dm-sans">
              {t(slide.descKey)}
            </p>
          </div>

          {bullets && bullets.length > 0 && (
            <ul className="space-y-2 pt-1">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-foreground/85 leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {slide.ctaKey && slide.ctaHref && (
            <Link
              href={slide.ctaHref}
              onClick={finish}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
            >
              {t(slide.ctaKey)}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-7 py-4 border-t border-border/60 bg-muted/30 flex items-center justify-between gap-3">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("back")}
          </button>
          {isLast ? (
            <button
              onClick={finish}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl btn-brand text-[13px] font-semibold disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              {t("finish")}
            </button>
          ) : (
            <button
              onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl btn-brand text-[13px] font-semibold"
            >
              {t("next")}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
