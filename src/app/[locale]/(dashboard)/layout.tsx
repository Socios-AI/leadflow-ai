// src/app/[locale]/(dashboard)/layout.tsx
import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/${locale}/login`);
  }

  // The session resolver already returns onboardingCompleted — no extra
  // database round-trip needed.
  if (!session.onboardingCompleted) {
    redirect(`/${locale}/onboarding`);
  }

  // Trigger the SUPER_ADMIN walkthrough overlay on first dashboard load.
  // SUPER_ADMINs only — the HIPER_ADMIN is the platform owner and
  // already knows how everything works. Persists across browsers via
  // Supabase app_metadata.
  const showAdminOnboarding =
    session.platformRole === "SUPER_ADMIN" && !session.superAdminOnboarded;

  return (
    <DashboardShell adminOnboarding={showAdminOnboarding ? {} : null}>
      {children}
    </DashboardShell>
  );
}
