// src/lib/integrations/meta.ts
//
// Meta (Facebook + Instagram + WhatsApp Business) integration.
// Handles OAuth, long-lived token exchange, page / ad account discovery,
// and Lead Ads webhook subscription.
//
// The app is awaiting Meta review but the flow is fully wired — once the
// review lands we only need to flip the Meta app out of development mode.
//
// Required env vars:
//   META_APP_ID
//   META_APP_SECRET
//   META_REDIRECT_URI   e.g. https://app.example.com/api/integrations/meta/callback
//   META_WEBHOOK_VERIFY_TOKEN
//   NEXT_PUBLIC_APP_URL

import prisma from "@/lib/db/prisma";

const GRAPH = "https://graph.facebook.com/v21.0";
const OAUTH_AUTH = "https://www.facebook.com/v21.0/dialog/oauth";

const REQUIRED_SCOPES = [
  "public_profile",
  "email",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "leads_retrieval",
  "ads_read",
  "ads_management",
  "business_management",
  "instagram_basic",
  "instagram_manage_messages",
];

// ═════════════════════════════════════════════
// OAUTH FLOW
// ═════════════════════════════════════════════

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv("META_APP_ID"),
    redirect_uri: requiredEnv("META_REDIRECT_URI"),
    response_type: "code",
    scope: REQUIRED_SCOPES.join(","),
    state,
    auth_type: "rerequest",
  });
  return `${OAUTH_AUTH}?${params.toString()}`;
}

interface ShortTokenResp {
  access_token: string;
  token_type: string;
  expires_in?: number;
}
interface LongTokenResp {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (~60d)
}

export async function exchangeCode(code: string): Promise<ShortTokenResp> {
  const qs = new URLSearchParams({
    client_id: requiredEnv("META_APP_ID"),
    client_secret: requiredEnv("META_APP_SECRET"),
    redirect_uri: requiredEnv("META_REDIRECT_URI"),
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${qs.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta exchangeCode failed: ${res.status} ${body}`);
  }
  return (await res.json()) as ShortTokenResp;
}

export async function upgradeToLongLivedToken(
  shortToken: string
): Promise<LongTokenResp> {
  const qs = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: requiredEnv("META_APP_ID"),
    client_secret: requiredEnv("META_APP_SECRET"),
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${qs.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta long-lived token failed: ${res.status} ${body}`);
  }
  return (await res.json()) as LongTokenResp;
}

// ═════════════════════════════════════════════
// USER / PAGE / AD ACCOUNT DISCOVERY
// ═════════════════════════════════════════════

interface MetaUser {
  id: string;
  name: string;
  email?: string;
}

async function graphGet<T>(path: string, token: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${token}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph GET ${path} failed: ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

export async function fetchMetaUser(token: string): Promise<MetaUser> {
  return graphGet<MetaUser>("/me?fields=id,name,email", token);
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  category?: string;
  tasks?: string[];
}

export async function listPages(token: string): Promise<MetaPage[]> {
  const data = await graphGet<{
    data?: {
      id: string;
      name: string;
      access_token: string;
      category?: string;
      tasks?: string[];
    }[];
  }>("/me/accounts?fields=id,name,access_token,category,tasks&limit=100", token);
  return (data.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
    category: p.category,
    tasks: p.tasks,
  }));
}

export interface MetaAdAccount {
  id: string;
  name: string;
  currency?: string;
  status?: string;
}

export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const data = await graphGet<{
    data?: {
      id: string;
      name: string;
      currency?: string;
      account_status?: number;
    }[];
  }>("/me/adaccounts?fields=id,name,currency,account_status&limit=100", token);
  return (data.data || []).map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    status: a.account_status === 1 ? "ACTIVE" : "OTHER",
  }));
}

// ═════════════════════════════════════════════
// LEAD ADS: subscribe our webhook to each Page
// ═════════════════════════════════════════════

export async function subscribePageToLeadgen(
  pageId: string,
  pageAccessToken: string
): Promise<void> {
  const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      subscribed_fields: "leadgen,messages,messaging_postbacks",
      access_token: pageAccessToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Non-fatal: page subscription may require app review / business verification
    console.warn(`[Meta] subscribe page ${pageId}: ${res.status} ${body}`);
  }
}

// ═════════════════════════════════════════════
// PERSIST / STATUS / DISCONNECT
// ═════════════════════════════════════════════

export async function persistIntegration(
  accountId: string,
  opts: {
    longLivedToken: LongTokenResp;
    user: MetaUser;
    pages: MetaPage[];
    adAccounts: MetaAdAccount[];
  }
): Promise<void> {
  const { longLivedToken, user, pages, adAccounts } = opts;
  const expiresAt = new Date(Date.now() + longLivedToken.expires_in * 1000);

  await prisma.metaIntegration.upsert({
    where: { accountId },
    create: {
      accountId,
      metaUserId: user.id,
      metaUserName: user.name,
      email: user.email,
      accessToken: longLivedToken.access_token,
      tokenExpiresAt: expiresAt,
      scope: REQUIRED_SCOPES.join(","),
      pages: pages as unknown as object,
      adAccounts: adAccounts as unknown as object,
    },
    update: {
      metaUserId: user.id,
      metaUserName: user.name,
      email: user.email,
      accessToken: longLivedToken.access_token,
      tokenExpiresAt: expiresAt,
      scope: REQUIRED_SCOPES.join(","),
      pages: pages as unknown as object,
      adAccounts: adAccounts as unknown as object,
    },
  });

  // Fire-and-forget subscribe each page to leadgen webhooks
  for (const page of pages) {
    subscribePageToLeadgen(page.id, page.accessToken).catch(() => {});
  }
}

export interface MetaStatus {
  connected: boolean;
  userName?: string;
  email?: string;
  pages?: MetaPage[];
  adAccounts?: MetaAdAccount[];
  businessName?: string | null;
  businessNiche?: string | null;
  businessProduct?: string | null;
  connectedAt?: Date;
  expiresAt?: Date;
}

export async function getIntegrationStatus(
  accountId: string
): Promise<MetaStatus> {
  const integ = await prisma.metaIntegration.findUnique({
    where: { accountId },
  });
  if (!integ) return { connected: false };
  return {
    connected: true,
    userName: integ.metaUserName || undefined,
    email: integ.email || undefined,
    pages: (integ.pages as unknown as MetaPage[]) || [],
    adAccounts: (integ.adAccounts as unknown as MetaAdAccount[]) || [],
    businessName: integ.businessName,
    businessNiche: integ.businessNiche,
    businessProduct: integ.businessProduct,
    connectedAt: integ.createdAt,
    expiresAt: integ.tokenExpiresAt,
  };
}

export async function updateBusinessInfo(
  accountId: string,
  data: {
    businessName?: string | null;
    businessNiche?: string | null;
    businessProduct?: string | null;
  }
): Promise<void> {
  await prisma.metaIntegration.update({
    where: { accountId },
    data: {
      businessName: data.businessName ?? undefined,
      businessNiche: data.businessNiche ?? undefined,
      businessProduct: data.businessProduct ?? undefined,
    },
  });
}

export async function disconnect(accountId: string): Promise<void> {
  const integ = await prisma.metaIntegration.findUnique({
    where: { accountId },
    select: { accessToken: true },
  });
  if (integ?.accessToken) {
    try {
      await fetch(
        `${GRAPH}/me/permissions?access_token=${encodeURIComponent(integ.accessToken)}`,
        { method: "DELETE" }
      );
    } catch {
      // best-effort — we still wipe locally
    }
  }
  await prisma.metaIntegration.deleteMany({ where: { accountId } });
}

// ═════════════════════════════════════════════
// WEBHOOK VERIFY TOKEN
// ═════════════════════════════════════════════

export function verifyWebhookSubscription(
  mode: string | null,
  token: string | null,
  challenge: string | null
): string | null {
  if (mode !== "subscribe") return null;
  if (token !== process.env.META_WEBHOOK_VERIFY_TOKEN) return null;
  return challenge;
}

// ═════════════════════════════════════════════
// LEADGEN WEBHOOK INGESTION
// ═════════════════════════════════════════════

/**
 * Resolve which account owns a given Facebook Page, by scanning the
 * stored `pages` JSON of every MetaIntegration row.
 *
 * Returns the accountId + the Page-scoped access token (needed to read
 * the leadgen details from the Graph API).
 */
export async function findAccountForPage(
  pageId: string
): Promise<{ accountId: string; pageAccessToken: string; page: MetaPage } | null> {
  const integrations = await prisma.metaIntegration.findMany({
    select: { accountId: true, pages: true },
  });
  for (const integ of integrations) {
    const pages = (integ.pages as unknown as MetaPage[] | null) || [];
    const page = pages.find((p) => p.id === pageId);
    if (page && page.accessToken) {
      return { accountId: integ.accountId, pageAccessToken: page.accessToken, page };
    }
  }
  return null;
}

export interface LeadgenDetails {
  id: string;
  createdTime?: string;
  adId?: string;
  formId?: string;
  campaignId?: string;
  campaignName?: string;
  adName?: string;
  formName?: string;
  fields: Record<string, string>;
}

/**
 * Fetches the full lead payload from the Graph API using the Page access
 * token. Meta only sends us the leadgen_id in the webhook — we have to
 * pull the field data ourselves.
 */
export async function fetchLeadgenDetails(
  leadgenId: string,
  pageAccessToken: string
): Promise<LeadgenDetails> {
  const fields =
    "id,created_time,ad_id,ad_name,form_id,campaign_id,campaign_name,field_data";
  const res = await fetch(
    `${GRAPH}/${leadgenId}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta leadgen fetch failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    id: string;
    created_time?: string;
    ad_id?: string;
    ad_name?: string;
    form_id?: string;
    campaign_id?: string;
    campaign_name?: string;
    field_data?: { name: string; values?: string[] }[];
  };

  const fieldsMap: Record<string, string> = {};
  for (const f of data.field_data || []) {
    if (!f.name) continue;
    fieldsMap[f.name] = (f.values && f.values[0]) || "";
  }

  return {
    id: data.id,
    createdTime: data.created_time,
    adId: data.ad_id,
    adName: data.ad_name,
    formId: data.form_id,
    campaignId: data.campaign_id,
    campaignName: data.campaign_name,
    fields: fieldsMap,
  };
}

/**
 * Maps a Meta field_data map to our canonical lead shape. Meta forms use
 * predictable field names (`full_name`, `email`, `phone_number`) but
 * custom questions are preserved in `metadata.customFields`.
 */
export function normalizeLeadgenFields(fields: Record<string, string>): {
  name: string | null;
  email: string | null;
  phone: string | null;
  customFields: Record<string, string>;
} {
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = fields[k];
      if (v && v.trim()) return v.trim();
    }
    return null;
  };

  const firstName = pick("first_name");
  const lastName = pick("last_name");
  const fullName =
    pick("full_name", "name") ||
    (firstName || lastName ? `${firstName || ""} ${lastName || ""}`.trim() : null);

  // Collect everything else as metadata
  const known = new Set([
    "full_name",
    "name",
    "first_name",
    "last_name",
    "email",
    "phone_number",
    "phone",
  ]);
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!known.has(k) && v) custom[k] = v;
  }

  return {
    name: fullName,
    email: pick("email"),
    phone: pick("phone_number", "phone"),
    customFields: custom,
  };
}

// ═════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════

function requiredEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}
