// src/app/[locale]/(dashboard)/settings/integrations/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Copy, CheckCircle, Plus, Trash2, Loader2, Send, Link2,
  ExternalLink, AlertCircle, Eye, EyeOff, Webhook, TestTube,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WebhookItem {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  webhookUrl: string;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
}

export default function IntegrationsPage() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [activeSection, setActiveSection] = useState<"webhooks" | "test" | "docs">("webhooks");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [whRes, campRes] = await Promise.all([
        fetch(`${window.location.origin}/api/webhooks/manage`),
        fetch(`${window.location.origin}/api/campaigns`),
      ]);
      const wh = await whRes.json();
      const camp = await campRes.json();
      setWebhooks(Array.isArray(wh) ? wh : []);
      setCampaigns(Array.isArray(camp) ? camp : []);
    } catch {}
    setLoading(false);
  };

  const createWebhook = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${window.location.origin}/api/webhooks/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Lead Webhook", events: ["lead.created"] }),
      });
      const data = await res.json();
      setWebhooks((prev) => [data, ...prev]);
    } catch {}
    setCreating(false);
  };

  const deleteWebhook = async (id: string) => {
    await fetch(`${window.location.origin}/api/webhooks/manage?id=${id}`, { method: "DELETE" });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const sendTestLead = async () => {
    if (!webhooks.length) return;
    setTesting(true);
    setTestResult(null);

    const wh = webhooks[0];
    const url = selectedCampaign
      ? `${wh.webhookUrl}?campaign=${selectedCampaign}`
      : wh.webhookUrl;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": wh.secret,
        },
        body: JSON.stringify({
          name: "Test Lead",
          email: `test-${Date.now()}@example.com`,
          phone: "+5511999990000",
          countryCode: "BR",
          source: "manual",
          metadata: { test: true },
        }),
      });
      const data = await res.json();
      setTestResult({ success: res.ok, data });
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--fg-muted)]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display font-semibold text-[22px] tracking-tight">
          Integrations
        </h1>
        <p className="font-body text-[13px] text-[var(--fg-secondary)] mt-0.5">
          Connect your ad platforms and CRMs to receive leads automatically
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-[var(--border-color)]">
        {[
          { key: "webhooks" as const, label: "Webhook URL" },
          { key: "test" as const, label: "Test Connection" },
          { key: "docs" as const, label: "How to Connect" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={cn(
              "px-3 py-2.5 text-[12px] font-medium font-body border-b-2 -mb-px transition-colors",
              activeSection === tab.key
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-secondary)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── WEBHOOKS ── */}
      {activeSection === "webhooks" && (
        <div className="space-y-4">
          {/* Create webhook */}
          {webhooks.length === 0 ? (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
              <Webhook className="w-10 h-10 mx-auto text-[var(--fg-muted)] opacity-40 mb-3" />
              <p className="font-body text-[13px] text-[var(--fg-secondary)] mb-4">
                Create a webhook to start receiving leads
              </p>
              <Button
                onClick={createWebhook}
                disabled={creating}
                className="bg-[var(--brand)] text-black hover:bg-[var(--brand-dim)] font-body font-medium"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Create Webhook
              </Button>
            </div>
          ) : (
            webhooks.map((wh) => (
              <div
                key={wh.id}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-[var(--border-color)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--emerald)]" />
                    <span className="font-body text-[13px] font-medium">Lead Webhook</span>
                  </div>
                  <button
                    onClick={() => deleteWebhook(wh.id)}
                    className="w-7 h-7 rounded-md grid place-items-center hover:bg-[var(--red)]/10 text-[var(--red)] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Webhook URL */}
                  <div className="space-y-1.5">
                    <Label className="font-body text-[12px] text-[var(--fg-muted)]">Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={wh.webhookUrl}
                        readOnly
                        className="h-9 font-mono text-[12px] bg-[var(--bg-muted)]"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(wh.webhookUrl, `url-${wh.id}`)}
                        className="shrink-0 h-9"
                      >
                        {copied === `url-${wh.id}` ? (
                          <CheckCircle className="w-3.5 h-3.5 text-[var(--emerald)]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Secret */}
                  <div className="space-y-1.5">
                    <Label className="font-body text-[12px] text-[var(--fg-muted)]">
                      Secret (send as x-webhook-secret header)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={showSecret === wh.id ? wh.secret : "••••••••••••••••••••"}
                        readOnly
                        className="h-9 font-mono text-[12px] bg-[var(--bg-muted)]"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSecret(showSecret === wh.id ? null : wh.id)}
                        className="shrink-0 h-9"
                      >
                        {showSecret === wh.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(wh.secret, `secret-${wh.id}`)}
                        className="shrink-0 h-9"
                      >
                        {copied === `secret-${wh.id}` ? (
                          <CheckCircle className="w-3.5 h-3.5 text-[var(--emerald)]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Campaign linking */}
                  <div className="space-y-1.5">
                    <Label className="font-body text-[12px] text-[var(--fg-muted)]">
                      Link to Campaign (append ?campaign=ID to URL)
                    </Label>
                    {campaigns.length > 0 ? (
                      <div className="space-y-2">
                        {campaigns.map((c) => {
                          const linkedUrl = `${wh.webhookUrl}?campaign=${c.id}`;
                          return (
                            <div
                              key={c.id}
                              className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-color)]"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-body text-[12px] font-medium truncate">{c.name}</p>
                                <p className="font-mono text-[10px] text-[var(--fg-muted)] truncate">{linkedUrl}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(linkedUrl, `camp-${c.id}`)}
                                className="shrink-0 h-7 text-[11px]"
                              >
                                {copied === `camp-${c.id}` ? (
                                  <CheckCircle className="w-3 h-3 text-[var(--emerald)]" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="font-body text-[12px] text-[var(--fg-muted)]">
                        No campaigns yet. Create a campaign first, then link it here.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TEST ── */}
      {activeSection === "test" && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-color)]">
            <h2 className="font-display font-medium text-[14px]">Send Test Lead</h2>
            <p className="font-body text-[11px] text-[var(--fg-muted)] mt-0.5">
              Send a fake lead to verify your webhook is working
            </p>
          </div>
          <div className="p-5 space-y-4">
            {webhooks.length === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--amber)]/8 border border-[var(--amber)]/15">
                <AlertCircle className="w-4 h-4 text-[var(--amber)] mt-0.5 shrink-0" />
                <p className="font-body text-[12px] text-[var(--fg-secondary)]">
                  Create a webhook first in the "Webhook URL" tab.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="font-body text-[12px]">Link to Campaign (optional)</Label>
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                    <SelectTrigger className="h-9 font-body text-[13px]"><SelectValue placeholder="No campaign" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No campaign</SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={sendTestLead}
                  disabled={testing}
                  className="bg-[var(--brand)] text-black hover:bg-[var(--brand-dim)] font-body font-medium"
                >
                  {testing ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <TestTube className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Send Test Lead
                </Button>

                {testResult && (
                  <div
                    className={cn(
                      "p-3 rounded-lg border text-[12px] font-body",
                      testResult.success
                        ? "bg-[var(--emerald)]/8 border-[var(--emerald)]/15"
                        : "bg-[var(--red)]/8 border-[var(--red)]/15"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      {testResult.success ? (
                        <CheckCircle className="w-3.5 h-3.5 text-[var(--emerald)]" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-[var(--red)]" />
                      )}
                      <span className={testResult.success ? "text-[var(--emerald)]" : "text-[var(--red)]"}>
                        {testResult.success ? "Lead received successfully!" : "Failed"}
                      </span>
                    </div>
                    <pre className="font-mono text-[10px] text-[var(--fg-secondary)] whitespace-pre-wrap bg-[var(--bg-muted)] p-2 rounded">
                      {JSON.stringify(testResult.data || testResult.error, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── DOCS ── */}
      {activeSection === "docs" && (
        <div className="space-y-4">
          <DocCard
            title="Meta Lead Ads (Facebook / Instagram)"
            steps={[
              "Go to Meta Business Suite → Events Manager → Lead Ads",
              "Click 'CRM Setup' or use Zapier/Make to connect",
              "Set the webhook URL to your Nexus webhook URL above",
              "Add the x-webhook-secret header with your secret",
              "Map fields: full_name, email, phone_number",
              "Add ?campaign=CAMPAIGN_ID to link to a specific campaign",
            ]}
          />
          <DocCard
            title="Google Ads Lead Forms"
            steps={[
              "In Google Ads, go to your Lead Form extension",
              "Under 'Lead delivery', choose 'Webhook'",
              "Paste your Nexus webhook URL",
              "Google sends data in user_column_data format — Nexus auto-detects this",
              "Add ?campaign=CAMPAIGN_ID to the URL for campaign tracking",
            ]}
          />
          <DocCard
            title="Landing Pages (Unbounce, Webflow, custom)"
            steps={[
              "In your form builder, find 'Webhook' or 'HTTP POST' integration",
              "Set the URL to your Nexus webhook URL",
              "Send a JSON POST with: { name, email, phone }",
              "Optional: add countryCode, source, metadata fields",
              "Add x-webhook-secret header for security",
            ]}
          />
          <DocCard
            title="Zapier / Make / n8n"
            steps={[
              "Create a new Zap/Scenario with your trigger (form, CRM, etc.)",
              "Add a 'Webhooks by Zapier' or 'HTTP Request' action",
              "Method: POST, URL: your Nexus webhook URL",
              "Headers: Content-Type: application/json, x-webhook-secret: YOUR_SECRET",
              "Body: { name, email, phone, source, campaignId }",
            ]}
          />
          <DocCard
            title="Direct API Call"
            steps={[
              "POST /api/v1/webhooks/leads/{accountId}?campaign={campaignId}",
              "Header: Content-Type: application/json",
              "Header: x-webhook-secret: YOUR_SECRET",
              'Body: { "name": "John", "email": "john@example.com", "phone": "+15551234567", "source": "marketing" }',
              "Response: { status: 'created', leadId: '...', channel: 'WHATSAPP' }",
            ]}
          />
        </div>
      )}
    </div>
  );
}

function DocCard({ title, steps }: { title: string; steps: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors"
      >
        <span className="font-display font-medium text-[14px]">{title}</span>
        <span className={cn("transition-transform", open && "rotate-180")}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[var(--fg-muted)]">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 animate-fade-in">
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--brand-glow)] text-[var(--brand)] grid place-items-center shrink-0 mt-0.5">
                  <span className="font-body text-[10px] font-semibold">{i + 1}</span>
                </span>
                <p className="font-body text-[12px] text-[var(--fg-secondary)] leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}