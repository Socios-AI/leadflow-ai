// src/app/[locale]/(auth)/login/page.tsx
"use client";

import React, { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguagePicker } from "@/components/shared/language-picker";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function LoginPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? t("loginFailed") : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        redirectTo?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        if (data.error === "invalid_credentials") setError(t("invalidCredentials"));
        else if (data.error === "rate_limited") setError(t("rateLimited"));
        else if (data.error === "missing_credentials") setError(t("fillAllFields"));
        else setError(t("loginFailed"));
        return;
      }
      window.location.href = data.redirectTo || `/${locale}`;
    } catch {
      setError(t("loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setOauthLoading(provider);
    try {
      const { error: oauthError } = await supabaseBrowser.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?locale=${locale}`,
          queryParams:
            provider === "google"
              ? { access_type: "offline", prompt: "consent" }
              : {},
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setOauthLoading(null);
      }
    } catch {
      setError(t("oauthFailed"));
      setOauthLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden">
      {/* Ambient backdrop, soft and slow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-40 -left-20 w-[60vw] h-[60vw] rounded-full bg-primary/[0.06] blur-[120px]" />
        <div className="absolute -bottom-40 -right-20 w-[50vw] h-[50vw] rounded-full bg-primary/[0.04] blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)/0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.5) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />
      </div>

      {/* Top bar with locale picker */}
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Marketing Digital AI"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="font-display text-[13px] font-semibold tracking-tight">
            Marketing Digital AI
          </span>
        </div>
        <LanguagePicker align="end" compact />
      </header>

      {/* Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[408px] animate-fade-in-up">
          <div className="text-center mb-7">
            <h1 className="font-display text-[28px] font-semibold tracking-tight text-foreground leading-[1.15]">
              {t("loginTitle")}
            </h1>
            <p className="text-[13.5px] text-muted-foreground mt-2.5 leading-relaxed">
              {t("loginSubtitle")}
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-floating p-7 space-y-5">
            {/* OAuth */}
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuth("google")}
                disabled={!!oauthLoading || loading}
                className="h-10 border-border/70 hover:bg-muted/70 hover:border-border transition-all active:scale-[0.98]"
              >
                {oauthLoading === "google" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <GoogleIcon />
                    Google
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuth("apple")}
                disabled={!!oauthLoading || loading}
                className="h-10 border-border/70 hover:bg-muted/70 hover:border-border transition-all active:scale-[0.98]"
              >
                {oauthLoading === "apple" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <AppleIcon />
                    Apple
                  </>
                )}
              </Button>
            </div>

            <div className="divider-labeled">{t("orContinueWith")}</div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/25 text-[12.5px] text-destructive animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                id="email"
                label={t("email")}
                icon={Mail}
              >
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  className="h-11 pl-9 transition-all focus-visible:ring-4 focus-visible:ring-ring/15"
                />
              </Field>

              <Field
                id="password"
                label={t("password")}
                icon={Lock}
                trailing={
                  <Link
                    href={`/${locale}/forgot-password`}
                    className="text-[11.5px] font-medium text-primary hover:underline underline-offset-2"
                  >
                    {t("forgotPassword")}
                  </Link>
                }
              >
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 pl-9 pr-10 transition-all focus-visible:ring-4 focus-visible:ring-ring/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </Field>

              <Button
                type="submit"
                disabled={loading || !!oauthLoading}
                className={cn(
                  "w-full h-11 text-[13.5px] font-semibold gap-1.5 mt-1",
                  "btn-brand active:scale-[0.99]"
                )}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {t("login")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-[12.5px] text-muted-foreground pt-1">
              {t("dontHaveAccount")}{" "}
              <Link
                href={`/${locale}/register`}
                className="font-semibold text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
              >
                {t("register")}
              </Link>
            </p>
          </div>

          <p className="text-center text-[10.5px] text-muted-foreground/60 mt-6 px-4 leading-relaxed">
            {t("legalFooter")}
          </p>
        </div>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────
// Field shell with leading icon support
// ──────────────────────────────────────────────

function Field({
  id,
  label,
  icon: Icon,
  trailing,
  children,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label
          htmlFor={id}
          className="text-[11.5px] font-medium text-muted-foreground"
        >
          {label}
        </Label>
        {trailing}
      </div>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC04"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
