// src/app/api/v1/webhooks/leads/[accountId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { normalizePhone } from "@/lib/utils/normalize-phone";
import { queues } from "@/lib/queues";

/**
 * POST /api/v1/webhooks/leads/:accountId
 *
 * Accepts leads from ANY source:
 * - Meta Lead Ads (Facebook/Instagram)
 * - Google Ads Lead Forms
 * - Landing pages (Unbounce, Webflow, custom)
 * - CRMs (HubSpot, GoHighLevel, SprintHub)
 * - Zapier / Make / n8n
 * - Direct API calls
 *
 * The system auto-detects the format and normalizes.
 *
 * Headers (optional):
 *   x-webhook-secret: webhook secret for auth
 *
 * Body examples:
 *
 * Standard format:
 * { name, email, phone, countryCode, source, campaignId, metadata }
 *
 * Meta Lead Ads format (via Zapier/direct):
 * { full_name, email, phone_number, campaign_name, ad_name, form_name }
 *
 * Google Ads format:
 * { user_column_data: [{ column_id: "FULL_NAME", string_value: "..." }], campaign_id }
 *
 * Query params:
 *   ?campaign=CAMPAIGN_ID_OR_NAME — links the lead to a specific campaign
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    // 1. Verify account
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, plan: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // 2. Optional webhook secret verification
    const secret = req.headers.get("x-webhook-secret");
    if (secret) {
      const webhook = await prisma.webhook.findFirst({
        where: { accountId, secret, isActive: true },
      });
      if (!webhook) {
        return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
      }
    }

    // 3. Parse and normalize the body (handles multiple formats)
    const body = await req.json();
    const normalized = normalizeLeadData(body, req.nextUrl.searchParams);

    if (!normalized.email && !normalized.phone) {
      return NextResponse.json(
        { error: "Either email or phone is required" },
        { status: 400 }
      );
    }

    // 4. Normalize phone to E.164
    const phone = normalized.phone
      ? normalizePhone(normalized.phone, normalized.countryCode || "BR")
      : null;

    // 5. Resolve campaign
    const campaignId = await resolveCampaign(
      accountId,
      normalized.campaignId,
      normalized.campaignName
    );

    // 6. Deduplicate
    const orConditions: any[] = [];
    if (phone) orConditions.push({ phone });
    if (normalized.email) orConditions.push({ email: normalized.email.toLowerCase() });

    if (orConditions.length > 0) {
      const existing = await prisma.lead.findFirst({
        where: { accountId, OR: orConditions },
      });

      if (existing) {
        // Re-enqueue if still NEW
        if (existing.status === "NEW") {
          await queues.leadProcessing.add("retry-contact", {
            leadId: existing.id,
            accountId,
          });
        }
        return NextResponse.json({
          status: "duplicate",
          leadId: existing.id,
          leadStatus: existing.status,
        });
      }
    }

    // 7. Create lead
    const lead = await prisma.lead.create({
      data: {
        accountId,
        name: normalized.name || null,
        email: normalized.email?.toLowerCase() || null,
        phone,
        countryCode: normalized.countryCode || null,
        source: mapSource(normalized.source),
        campaignId,
        metadata: normalized.metadata || undefined,
        status: "NEW",
      },
    });

    // 8. Update campaign lead count
    if (campaignId) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { totalLeads: { increment: 1 } },
      });
    }

    // 9. Determine channel and enqueue
    const channel = phone ? "WHATSAPP" : "EMAIL";

    await queues.leadProcessing.add(
      "new-lead",
      { leadId: lead.id, accountId, channel },
      { priority: 1 }
    );

    // 10. Log
    await prisma.eventLog.create({
      data: {
        accountId,
        event: "lead.created",
        data: {
          leadId: lead.id,
          source: lead.source,
          channel,
          campaignId,
          rawPayload: body,
        },
      },
    });

    return NextResponse.json(
      { status: "created", leadId: lead.id, channel, campaignId },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal error", message: error.message },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════
// FORMAT NORMALIZER
// Handles Meta, Google, generic, and custom formats
// ═══════════════════════════════════════════════════

interface NormalizedLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  source: string | null;
  campaignId: string | null;
  campaignName: string | null;
  metadata: Record<string, any> | null;
}

function normalizeLeadData(
  body: Record<string, any>,
  searchParams: URLSearchParams
): NormalizedLead {
  // Check if it's Meta Lead Ads format
  if (body.full_name || body.phone_number || body.campaign_name) {
    return {
      name: body.full_name || body.first_name
        ? `${body.first_name || ""} ${body.last_name || ""}`.trim()
        : null,
      email: body.email || null,
      phone: body.phone_number || body.phone || null,
      countryCode: body.country_code || null,
      source: "MARKETING",
      campaignId: searchParams.get("campaign") || null,
      campaignName: body.campaign_name || body.ad_name || null,
      metadata: {
        platform: "meta",
        adName: body.ad_name,
        adsetName: body.adset_name,
        formName: body.form_name,
        rawFields: body,
      },
    };
  }

  // Check if it's Google Ads format
  if (body.user_column_data || body.google_key) {
    const columns = body.user_column_data || [];
    const getCol = (id: string) =>
      columns.find((c: any) => c.column_id === id)?.string_value || null;

    return {
      name: getCol("FULL_NAME") || getCol("FIRST_NAME"),
      email: getCol("EMAIL"),
      phone: getCol("PHONE_NUMBER"),
      countryCode: getCol("COUNTRY"),
      source: "MARKETING",
      campaignId: searchParams.get("campaign") || body.campaign_id || null,
      campaignName: body.campaign_name || null,
      metadata: { platform: "google", rawFields: body },
    };
  }

  // Standard / generic format
  return {
    name: body.name || body.full_name || body.firstName
      ? `${body.firstName || ""} ${body.lastName || ""}`.trim() || body.name
      : null,
    email: body.email || null,
    phone: body.phone || body.phone_number || body.phoneNumber || null,
    countryCode: body.countryCode || body.country_code || body.country || null,
    source: body.source || body.utm_source || null,
    campaignId: searchParams.get("campaign") || body.campaignId || body.campaign_id || null,
    campaignName: body.campaignName || body.campaign_name || body.utm_campaign || null,
    metadata: body.metadata || body.custom_fields || null,
  };
}

// ═══════════════════════════════════════════════════
// CAMPAIGN RESOLVER
// Matches by ID first, then by name
// ═══════════════════════════════════════════════════

async function resolveCampaign(
  accountId: string,
  campaignId: string | null,
  campaignName: string | null
): Promise<string | null> {
  // Try by ID first
  if (campaignId) {
    const byId = await prisma.campaign.findFirst({
      where: { accountId, id: campaignId },
      select: { id: true },
    });
    if (byId) return byId.id;
  }

  // Try by name
  if (campaignName) {
    const byName = await prisma.campaign.findFirst({
      where: {
        accountId,
        name: { contains: campaignName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (byName) return byName.id;
  }

  return null;
}

function mapSource(source: string | null): "MARKETING" | "WEBSITE" | "MANUAL" | "API" | "REFERRAL" {
  if (!source) return "MARKETING";
  const map: Record<string, any> = {
    marketing: "MARKETING",
    website: "WEBSITE",
    manual: "MANUAL",
    api: "API",
    referral: "REFERRAL",
    facebook: "MARKETING",
    google: "MARKETING",
    instagram: "MARKETING",
    tiktok: "MARKETING",
    meta: "MARKETING",
  };
  return map[source.toLowerCase()] || "MARKETING";
}