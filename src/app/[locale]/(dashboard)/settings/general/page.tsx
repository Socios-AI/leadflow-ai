// src/app/[locale]/(dashboard)/settings/general/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, CheckCircle } from "lucide-react";

export default function GeneralSettingsPage() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [language, setLanguage] = useState("pt");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${window.location.origin}/api/settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setName(data.name || "");
          setTimezone(data.timezone || "America/Sao_Paulo");
          setLanguage(data.locale || "pt");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${window.location.origin}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone, locale: language }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        // If language changed, redirect to new locale
        if (language !== locale) {
          router.push(`/${language}/settings/general`);
        }
      }
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--fg-muted)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/settings`}
          className="w-9 h-9 rounded-lg border border-[var(--border-color)] grid place-items-center hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-display font-semibold text-[22px] tracking-tight">
          {t("general")}
        </h1>
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-4">
        <div className="space-y-1.5">
          <Label className="font-body text-[13px]">{t("accountName")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 font-body text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-[13px]">{t("timezone")}</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="h-9 font-body text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="America/Sao_Paulo">America/Sao_Paulo (BRT)</SelectItem>
              <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
              <SelectItem value="America/Chicago">America/Chicago (CST)</SelectItem>
              <SelectItem value="America/Denver">America/Denver (MST)</SelectItem>
              <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
              <SelectItem value="America/Mexico_City">America/Mexico_City (CST)</SelectItem>
              <SelectItem value="America/Bogota">America/Bogota (COT)</SelectItem>
              <SelectItem value="America/Argentina/Buenos_Aires">Buenos Aires (ART)</SelectItem>
              <SelectItem value="Europe/Madrid">Europe/Madrid (CET)</SelectItem>
              <SelectItem value="Europe/Lisbon">Europe/Lisbon (WET)</SelectItem>
              <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-[13px]">{t("language")}</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-9 font-body text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pt">Português</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--emerald)] font-body animate-fade-in">
              <CheckCircle className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[var(--brand)] text-black hover:bg-[var(--brand-dim)] font-body font-medium h-9"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}