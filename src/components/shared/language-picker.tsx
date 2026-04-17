// src/components/shared/language-picker.tsx
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "@/i18n/routing";
import { useLocale } from "next-intl";
import { Globe, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const LOCALES = [
  { code: "pt", flag: "🇧🇷", label: "Português", short: "PT" },
  { code: "en", flag: "🇺🇸", label: "English", short: "EN" },
  { code: "es", flag: "🇪🇸", label: "Español", short: "ES" },
] as const;

type LocaleCode = (typeof LOCALES)[number]["code"];

/**
 * Compact locale switcher — globe icon + dropdown.
 * Use in screens that don't have the main sidebar (onboarding, auth pages).
 */
export function LanguagePicker({
  align = "end",
  compact = false,
}: {
  align?: "start" | "end";
  compact?: boolean;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const current = LOCALES.find((l) => l.code === locale) || LOCALES[0];

  function switchTo(next: LocaleCode) {
    setOpen(false);
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <Globe className="w-3.5 h-3.5" />
        {compact ? (
          <span className="text-[11px] font-semibold">{current.short}</span>
        ) : (
          <span>{current.label}</span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(
              "absolute top-full mt-1.5 z-50 w-[160px] rounded-lg border border-border bg-card shadow-lg py-1",
              align === "end" ? "right-0" : "left-0"
            )}
          >
            {LOCALES.map((loc) => {
              const selected = loc.code === locale;
              return (
                <button
                  key={loc.code}
                  onClick={() => switchTo(loc.code)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-[12.5px] transition-colors text-left",
                    selected
                      ? "text-foreground bg-muted/70"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <span className="text-[14px]">{loc.flag}</span>
                  <span className="flex-1">{loc.label}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Inline locale cards — used on the welcome screen so the very first thing
 * a new user sees is language selection in all three languages.
 */
export function LanguageChoice() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: LocaleCode) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="grid grid-cols-3 gap-2 max-w-lg mx-auto">
      {LOCALES.map((loc) => {
        const selected = loc.code === locale;
        return (
          <button
            key={loc.code}
            onClick={() => switchTo(loc.code)}
            className={cn(
              "flex items-center justify-center gap-2 h-11 rounded-lg border-2 transition-all text-[13px] font-medium",
              selected
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
            )}
          >
            <span className="text-base leading-none">{loc.flag}</span>
            <span>{loc.label}</span>
          </button>
        );
      })}
    </div>
  );
}
