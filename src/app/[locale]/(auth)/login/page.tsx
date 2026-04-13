// src/app/[locale]/(auth)/login/page.tsx
"use client";

import React, { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? t("loginFailed") : null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "invalid_credentials" ? t("invalidCredentials") :
          data.error === "account_not_found" ? t("accountNotFound") :
          t("loginFailed")
        );
        return;
      }

      // Use the redirect from the API response, NOT from the URL params
      // This prevents stale billing redirects from looping
      const destination = data.redirectTo || `/${locale}`;

      // Use replace to prevent back-button loop
      window.location.href = destination;
    } catch {
      setError(t("loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-[360px] animate-scale-in">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/images/logo.png" alt="Logo" width={32} height={32} className="rounded-lg" />
        </div>

        <div className="glass-card p-6 space-y-5">
          <div className="text-center">
            <h1 className="font-display font-medium text-[18px] tracking-[-0.02em] text-[var(--fg)]">
              {t("loginTitle")}
            </h1>
            <p className="font-body text-[12px] text-[var(--fg-3)] mt-1">{t("loginSubtitle")}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
              <AlertCircle className="w-3.5 h-3.5 text-[var(--red)] mt-0.5 shrink-0" />
              <span className="font-body text-[11px] text-[var(--red)]">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="font-body text-[11px] text-[var(--fg-2)]">{t("email")}</Label>
              <Input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                className="h-9 font-body text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="font-body text-[11px] text-[var(--fg-2)]">{t("password")}</Label>
                <Link href={`/${locale}/forgot-password`} className="font-body text-[10px] text-[var(--brand)] hover:underline">
                  {t("forgotPassword")}
                </Link>
              </div>
              <Input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                className="h-9 font-body text-[12px]"
              />
            </div>
            <Button
              type="submit" disabled={loading}
              className="w-full h-9 font-body font-semibold text-[12px] bg-[var(--brand)] text-black hover:bg-[var(--brand-hover)] transition-all"
            >
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("login")}
            </Button>
          </form>

          <p className="text-center font-body text-[11px] text-[var(--fg-3)]">
            {t("dontHaveAccount")}{" "}
            <Link href={`/${locale}/register`} className="font-medium text-[var(--brand)] hover:underline">
              {t("register")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}