// src/app/[locale]/(dashboard)/page.tsx
import React from "react";
import { getSession } from "@/lib/auth/session";
import { loadDashboardOverview } from "@/lib/dashboard/overview";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const data = await loadDashboardOverview(session.accountId);
  return <DashboardContent initialData={data} />;
}
