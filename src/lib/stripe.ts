// src/lib/stripe.ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
});

/**
 * Price IDs from your Stripe Dashboard.
 * Create these products in Stripe first, then paste the price IDs here.
 *
 * To set up:
 * 1. Go to Stripe Dashboard > Products
 * 2. Create "Starter", "Pro", "Enterprise" products
 * 3. Add monthly recurring prices
 * 4. Copy the price IDs (price_xxx) below
 */
export const PRICE_IDS: Record<string, string> = {
  STARTER: process.env.STRIPE_PRICE_STARTER || "price_starter_placeholder",
  PRO: process.env.STRIPE_PRICE_PRO || "price_pro_placeholder",
  ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise_placeholder",
};

export const PLAN_FROM_PRICE: Record<string, string> = Object.fromEntries(
  Object.entries(PRICE_IDS).map(([plan, priceId]) => [priceId, plan])
);