// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import prisma from "@/lib/db/prisma";
import { z } from "zod";
import { cookies } from "next/headers";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "validation_failed" }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const cookieStore = await cookies();

    // Create Supabase client that properly sets auth cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Can fail in read-only contexts
            }
          },
        },
      }
    );

    // Authenticate — this sets the sb-<ref>-auth-token cookies automatically
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.session) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    // Get user + account
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { account: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!user || user.memberships.length === 0) {
      return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }

    const membership = user.memberships[0];
    const account = membership.account;
    const hasAccess = checkAccountAccess(account);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        plan: account.plan,
        locale: account.locale,
      },
      role: membership.role,
      hasAccess,
      redirectTo: hasAccess
        ? `/${account.locale}`
        : `/${account.locale}/settings/billing`,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

function checkAccountAccess(account: {
  plan: string;
  stripeSubStatus: string | null;
  trialEndsAt: Date | null;
}): boolean {
  // FREE and ENTERPRISE always have access (no Stripe required)
  if (account.plan === "FREE" || account.plan === "ENTERPRISE") return true;

  // Active or trialing subscriptions have access
  if (
    account.stripeSubStatus === "active" ||
    account.stripeSubStatus === "trialing"
  ) {
    return true;
  }

  // Active trial period
  if (account.trialEndsAt && new Date(account.trialEndsAt) > new Date()) {
    return true;
  }

  return false;
}