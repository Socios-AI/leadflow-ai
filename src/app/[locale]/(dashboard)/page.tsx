// src/app/[locale]/(dashboard)/page.tsx
import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { loadDashboardOverview } from "@/lib/dashboard/overview";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  if (!session) {
    // Middleware normally catches this, but if we slip through (cookie expired
    // mid-request) we bounce to the login instead of showing a spinner.
    redirect(`/${locale}/login`);
  }

  const data = await loadDashboardOverview(session.accountId);
  return (
    <DashboardContent initialData={data} userName={session.userName} />
  );
}
