// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { stripe, PLAN_FROM_PRICE } from "@/lib/stripe";
import Stripe from "stripe";

// Disable body parsing — Stripe needs raw body for signature verification
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Stripe signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Checkout completed — activate subscription
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const accountId = session.metadata?.accountId;
        const plan = session.metadata?.plan || "STARTER";

        if (!accountId) break;

        await prisma.account.update({
          where: { id: accountId },
          data: {
            stripeCustomerId: session.customer as string,
            stripeSubId: session.subscription as string,
            stripeSubStatus: "active",
            stripePriceId: null,
            plan: plan as any,
            trialEndsAt: session.subscription
              ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              : null,
          },
        });

        await prisma.eventLog.create({
          data: {
            accountId,
            event: "billing.checkout_completed",
            data: { plan, sessionId: session.id },
          },
        });

        console.log(`[stripe] Checkout completed for account ${accountId}, plan: ${plan}`);
        break;
      }

      // Subscription updated (plan change, renewal, etc.)
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const accountId = sub.metadata?.accountId;

        if (!accountId) {
          // Try to find account by customer ID
          const account = await prisma.account.findFirst({
            where: { stripeCustomerId: sub.customer as string },
          });
          if (!account) break;

          const priceId = sub.items.data[0]?.price.id;
          const plan = PLAN_FROM_PRICE[priceId] || account.plan;

          await prisma.account.update({
            where: { id: account.id },
            data: {
              stripeSubStatus: sub.status,
              stripePriceId: priceId,
              plan: plan as any,
              trialEndsAt: sub.trial_end
                ? new Date(sub.trial_end * 1000)
                : null,
            },
          });
          break;
        }

        const priceId = sub.items.data[0]?.price.id;
        const plan = PLAN_FROM_PRICE[priceId] || "STARTER";

        await prisma.account.update({
          where: { id: accountId },
          data: {
            stripeSubStatus: sub.status,
            stripePriceId: priceId,
            plan: plan as any,
            trialEndsAt: sub.trial_end
              ? new Date(sub.trial_end * 1000)
              : null,
          },
        });

        console.log(`[stripe] Subscription updated for account ${accountId}: ${sub.status}`);
        break;
      }

      // Subscription deleted (cancelled or expired)
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const account = await prisma.account.findFirst({
          where: { stripeCustomerId: sub.customer as string },
        });

        if (account) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              stripeSubStatus: "cancelled",
              plan: "FREE",
              stripeSubId: null,
            },
          });

          await prisma.eventLog.create({
            data: {
              accountId: account.id,
              event: "billing.subscription_cancelled",
              data: { subscriptionId: sub.id },
            },
          });

          console.log(`[stripe] Subscription cancelled for account ${account.id}`);
        }
        break;
      }

      // Payment failed
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        const account = await prisma.account.findFirst({
          where: { stripeCustomerId: invoice.customer as string },
        });

        if (account) {
          await prisma.account.update({
            where: { id: account.id },
            data: { stripeSubStatus: "past_due" },
          });

          await prisma.eventLog.create({
            data: {
              accountId: account.id,
              event: "billing.payment_failed",
              data: { invoiceId: invoice.id },
            },
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook processing error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}