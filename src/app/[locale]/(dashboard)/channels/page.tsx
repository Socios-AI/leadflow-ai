// src/app/[locale]/(dashboard)/channels/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Phone,
  Mail,
  Smartphone,
  Wifi,
  WifiOff,
  Send,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "whatsapp" | "email" | "sms";
type WAStatus = "idle" | "creating" | "waiting_scan" | "connected" | "error";

export default function ChannelsPage() {
  const t = useTranslations("channels");
  const tc = useTranslations("common");
  const [activeTab, setActiveTab] = useState<Tab>("whatsapp");

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="font-display font-semibold text-[22px] tracking-tight">
          {t("title")}
        </h1>
        <p className="font-body text-[13px] text-[var(--fg-secondary)] mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border-color)]">
        {(["whatsapp", "email", "sms"] as Tab[]).map((tab) => {
          const icons = { whatsapp: Phone, email: Mail, sms: Smartphone };
          const Icon = icons[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium font-body border-b-2 -mb-px transition-colors",
                activeTab === tab
                  ? "border-[var(--brand)] text-[var(--brand)]"
                  : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-secondary)]"
              )}
            >
              <Icon className="w-4 h-4" />
              {t(tab)}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "whatsapp" && <WhatsAppSetup />}
      {activeTab === "email" && <EmailSetup />}
      {activeTab === "sms" && <SMSSetup />}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// WHATSAPP SETUP
// ═══════════════════════════════════════════════════

function WhatsAppSetup() {
  const t = useTranslations("channels");
  const [status, setStatus] = useState<WAStatus>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Check current status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${window.location.origin}/api/channels/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-status" }),
      });
      const data = await res.json();
      setConnected(data.connected);
      setInstanceName(data.instanceName || "");
      if (data.connected) setStatus("connected");
    } catch {
      // Not configured yet
    } finally {
      setChecking(false);
    }
  };

  const createInstance = async () => {
    setStatus("creating");
    setError(null);
    try {
      const res = await fetch(`${window.location.origin}/api/channels/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-instance" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create instance");
        setStatus("error");
        return;
      }

      setInstanceName(data.instanceName);
      setQrCode(data.qrCode);
      setPairingCode(data.pairingCode);
      setStatus("waiting_scan");

      // Start polling for connection
      pollConnection();
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  const pollConnection = useCallback(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/channels/whatsapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check-status" }),
        });
        const data = await res.json();
        if (data.connected) {
          setConnected(true);
          setStatus("connected");
          setQrCode(null);
          clearInterval(interval);
        }
      } catch {}
    }, 3000);

    // Stop polling after 2 minutes
    setTimeout(() => clearInterval(interval), 120000);
  }, []);

  const refreshQR = async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/channels/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-qr" }),
      });
      const data = await res.json();
      setQrCode(data.qrCode);
      setPairingCode(data.pairingCode);
    } catch {}
  };

  const disconnect = async () => {
    await fetch(`${window.location.origin}/api/channels/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    setConnected(false);
    setStatus("idle");
    setQrCode(null);
    setInstanceName("");
  };

  if (checking) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--fg-muted)]" />
        <p className="font-body text-[13px] text-[var(--fg-muted)] mt-3">Checking connection...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden animate-fade-up">
      <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
        <div>
          <h2 className="font-display font-medium text-[15px]">{t("whatsappConfig.title")}</h2>
          <p className="font-body text-[12px] text-[var(--fg-muted)] mt-0.5">
            Connect your WhatsApp to start engaging leads automatically
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--emerald)] font-body">
              <Wifi className="w-3.5 h-3.5" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--fg-muted)] font-body">
              <WifiOff className="w-3.5 h-3.5" /> Disconnected
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Connected state */}
        {status === "connected" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--emerald)]/8 border border-[var(--emerald)]/15">
              <CheckCircle className="w-5 h-5 text-[var(--emerald)] shrink-0" />
              <div>
                <p className="font-body text-[13px] font-medium text-[var(--emerald)]">
                  WhatsApp connected successfully
                </p>
                <p className="font-body text-[11px] text-[var(--fg-muted)] mt-0.5">
                  Instance: {instanceName} — AI will automatically respond to leads
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={disconnect}
              className="text-[var(--red)] border-[var(--red)]/20 hover:bg-[var(--red)]/5"
            >
              Disconnect
            </Button>
          </div>
        )}

        {/* Idle — not connected yet */}
        {status === "idle" && (
          <div className="text-center py-6">
            <Phone className="w-10 h-10 mx-auto text-[var(--fg-muted)] opacity-40 mb-3" />
            <p className="font-body text-[13px] text-[var(--fg-secondary)] mb-4">
              Connect your WhatsApp to let AI engage your leads
            </p>
            <Button
              onClick={createInstance}
              className="bg-[var(--brand)] text-black hover:bg-[var(--brand-dim)] font-body font-medium"
            >
              Connect WhatsApp
            </Button>
          </div>
        )}

        {/* Creating */}
        {status === "creating" && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand)]" />
            <p className="font-body text-[13px] text-[var(--fg-secondary)] mt-3">
              Creating WhatsApp instance...
            </p>
          </div>
        )}

        {/* QR Code — waiting for scan */}
        {status === "waiting_scan" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--brand-glow)] border border-[var(--brand)]/15">
              <AlertCircle className="w-4 h-4 text-[var(--brand)] mt-0.5 shrink-0" />
              <p className="font-body text-[12px] text-[var(--fg-secondary)]">
                Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → Scan the QR code below
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 py-4">
              {qrCode ? (
                <div className="p-3 bg-white rounded-xl">
                  <img
                    src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code"
                    className="w-[240px] h-[240px]"
                  />
                </div>
              ) : (
                <div className="w-[240px] h-[240px] rounded-xl bg-[var(--bg-muted)] grid place-items-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--fg-muted)]" />
                </div>
              )}

              {pairingCode && (
                <div className="text-center">
                  <p className="font-body text-[11px] text-[var(--fg-muted)]">Or use pairing code:</p>
                  <p className="font-display font-semibold text-lg tracking-widest mt-1">{pairingCode}</p>
                </div>
              )}

              <button
                onClick={refreshQR}
                className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--brand)] hover:underline font-body"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh QR
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--red)]/8 border border-[var(--red)]/15">
              <XCircle className="w-4 h-4 text-[var(--red)] mt-0.5 shrink-0" />
              <p className="font-body text-[12px] text-[var(--red)]">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setStatus("idle"); setError(null); }}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// EMAIL SETUP
// ═══════════════════════════════════════════════════

function EmailSetup() {
  const t = useTranslations("channels");
  const [provider, setProvider] = useState<"platform" | "custom">("platform");
  const [resendApiKey, setResendApiKey] = useState("");
  const [domain, setDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("noreply");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  // Load existing config
  useEffect(() => {
    fetch(`${window.location.origin}/api/channels`)
      .then((r) => r.json())
      .then((channels) => {
        const em = channels?.find?.((c: any) => c.type === "EMAIL");
        if (em) {
          const cfg = em.config as Record<string, string>;
          setProvider((cfg.provider as "platform" | "custom") || "platform");
          setDomain(cfg.domain || "");
          setFromName(cfg.fromName || "");
          setFromEmail(cfg.fromEmail || "noreply");
          setEnabled(em.isEnabled);
        }
      })
      .catch(() => {});
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${window.location.origin}/api/channels/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          provider,
          resendApiKey,
          domain,
          fromName,
          fromEmail,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${window.location.origin}/api/channels/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          provider,
          resendApiKey,
          domain,
          fromName,
          fromEmail,
          enabled,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden animate-fade-up">
      <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
        <div>
          <h2 className="font-display font-medium text-[15px]">{t("emailConfig.title")}</h2>
          <p className="font-body text-[12px] text-[var(--fg-muted)] mt-0.5">
            AI will send and reply to emails conversationally
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-body text-[12px] text-[var(--fg-muted)]">Enabled</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Domain choice */}
        <div className="space-y-1.5">
          <Label className="font-body text-[13px]">{t("emailConfig.domainChoice")}</Label>
          <Select value={provider} onValueChange={(v: "platform" | "custom") => setProvider(v)}>
            <SelectTrigger className="h-9 font-body text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="platform">{t("emailConfig.usePlatformDomain")}</SelectItem>
              <SelectItem value="custom">{t("emailConfig.useOwnDomain")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom domain fields */}
        {provider === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label className="font-body text-[13px]">{t("emailConfig.resendApiKey")}</Label>
              <Input
                type="password"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder="re_..."
                className="h-9 font-body text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-body text-[13px]">{t("emailConfig.domain")}</Label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="yourdomain.com"
                className="h-9 font-body text-[13px]"
              />
            </div>
          </>
        )}

        {/* From name/email */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-body text-[13px]">{t("emailConfig.fromName")}</Label>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Nexus AI"
              className="h-9 font-body text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-[13px]">{t("emailConfig.fromEmail")}</Label>
            <Input
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="noreply"
              className="h-9 font-body text-[13px]"
            />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={cn(
            "flex items-start gap-2 p-2.5 rounded-lg text-[12px] font-body border",
            testResult.success
              ? "bg-[var(--emerald)]/8 border-[var(--emerald)]/15 text-[var(--emerald)]"
              : "bg-[var(--red)]/8 border-[var(--red)]/15 text-[var(--red)]"
          )}>
            {testResult.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {testResult.success ? "Test email sent successfully" : testResult.error}
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--emerald)]/8 border border-[var(--emerald)]/15 text-[var(--emerald)] text-[12px] font-body">
            <CheckCircle className="w-4 h-4" /> Saved
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Test
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[var(--brand)] text-black hover:bg-[var(--brand-dim)]">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SMS SETUP
// ═══════════════════════════════════════════════════

function SMSSetup() {
  const t = useTranslations("channels");
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${window.location.origin}/api/channels`)
      .then((r) => r.json())
      .then((channels) => {
        const sm = channels?.find?.((c: any) => c.type === "SMS");
        if (sm) {
          const cfg = sm.config as Record<string, string>;
          setSid(cfg.twilioAccountSid || "");
          setPhone(cfg.twilioPhoneNumber || "");
          setEnabled(sm.isEnabled);
        }
      })
      .catch(() => {});
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${window.location.origin}/api/channels/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          twilioAccountSid: sid,
          twilioAuthToken: token,
          twilioPhoneNumber: phone,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${window.location.origin}/api/channels/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          twilioAccountSid: sid,
          twilioAuthToken: token,
          twilioPhoneNumber: phone,
          enabled,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden animate-fade-up">
      <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
        <div>
          <h2 className="font-display font-medium text-[15px]">{t("smsConfig.title")}</h2>
          <p className="font-body text-[12px] text-[var(--fg-muted)] mt-0.5">
            {t("smsConfig.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-body text-[12px] text-[var(--fg-muted)]">Enabled</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label className="font-body text-[13px]">{t("smsConfig.twilioSid")}</Label>
          <Input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="AC..." className="h-9 font-body text-[13px]" />
        </div>
        <div className="space-y-1.5">
          <Label className="font-body text-[13px]">{t("smsConfig.twilioToken")}</Label>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="..." className="h-9 font-body text-[13px]" />
        </div>
        <div className="space-y-1.5">
          <Label className="font-body text-[13px]">{t("smsConfig.twilioPhone")}</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890" className="h-9 font-body text-[13px]" />
        </div>

        {testResult && (
          <div className={cn(
            "flex items-start gap-2 p-2.5 rounded-lg text-[12px] font-body border",
            testResult.success
              ? "bg-[var(--emerald)]/8 border-[var(--emerald)]/15 text-[var(--emerald)]"
              : "bg-[var(--red)]/8 border-[var(--red)]/15 text-[var(--red)]"
          )}>
            {testResult.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {testResult.success ? "Test SMS sent" : testResult.error}
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--emerald)]/8 border border-[var(--emerald)]/15 text-[var(--emerald)] text-[12px] font-body">
            <CheckCircle className="w-4 h-4" /> Saved
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Test
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[var(--brand)] text-black hover:bg-[var(--brand-dim)]">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}