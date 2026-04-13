"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  const t = useTranslations("analytics");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("leadsOverTime")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            <BarChart3 className="w-16 h-16 opacity-20" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("conversionFunnel")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            <BarChart3 className="w-16 h-16 opacity-20" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("channelPerformance")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            <BarChart3 className="w-16 h-16 opacity-20" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("aiMetrics")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            <BarChart3 className="w-16 h-16 opacity-20" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}