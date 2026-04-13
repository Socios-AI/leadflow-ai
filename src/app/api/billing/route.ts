// src/app/api/billing/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { stripe, PRICE_IDS } from "@/lib/stripe";

// POST - Create checkout session or portal session
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, plan } = await req.json();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const account = await prisma.account.findUnique({
    where: { id: session.accountId },
    select: {
      id: true,
      stripeCustomerId: true,
      plan: true,
      stripeSubId: true,
      stripeSubStatus: true,
    },
  });

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  try {
    switch (action) {
      // Create a new checkout session for subscription
      case "checkout": {
        const priceId = PRICE_IDS[plan?.toUpperCase()];
        if (!priceId || priceId.includes("placeholder")) {
          return NextResponse.json({ error: "Invalid plan or price not configured" }, { status: 400 });
        }

        // Create or reuse Stripe customer
        let customerId = account.stripeCustomerId;

        if (!customerId) {
          const customer = await stripe.customers.create({
            email: session.email,
            metadata: { accountId: account.id },
          });
          customerId = customer.id;

          await prisma.account.update({
            where: { id: account.id },
            data: { stripeCustomerId: customerId },
          });
        }

        const checkoutSession = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${appUrl}/pt/dashboard?checkout=success`,
          cancel_url: `${appUrl}/pt/settings/billing?checkout=cancelled`,
          subscription_data: {
            trial_period_days: 7,
            metadata: { accountId: account.id },
          },
          metadata: { accountId: account.id, plan: plan?.toUpperCase() },
        });

        return NextResponse.json({ url: checkoutSession.url });
      }

      // Open Stripe customer portal (manage subscription)
      case "portal": {
        if (!account.stripeCustomerId) {
          return NextResponse.json({ error: "No billing account" }, { status: 400 });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
          customer: account.stripeCustomerId,
          return_url: `${appUrl}/pt/settings/billing`,
        });

        return NextResponse.json({ url: portalSession.url });
      }

      // Get current billing status
      case "status": {
        return NextResponse.json({
          plan: account.plan,
          stripeSubStatus: account.stripeSubStatus,
          hasActiveSubscription: ["active", "trialing"].includes(account.stripeSubStatus || ""),
        });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Billing error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET - Get billing status
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.account.findUnique({
    where: { id: session.accountId },
    select: {
      plan: true,
      stripeSubStatus: true,
      stripeSubId: true,
      trialEndsAt: true,
    },
  });

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  return NextResponse.json({
    plan: account.plan,
    status: account.stripeSubStatus || "none",
    subscriptionId: account.stripeSubId,
    trialEndsAt: account.trialEndsAt?.toISOString() || null,
    isActive: ["active", "trialing"].includes(account.stripeSubStatus || ""),
  });
}