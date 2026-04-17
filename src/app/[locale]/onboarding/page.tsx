// src/app/[locale]/onboarding/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import prisma from "@/lib/db/prisma";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  const [account, user] = await Promise.all([
    prisma.account.findUnique({
      where: { id: session.accountId },
      select: { name: true, onboardingCompletedAt: true, aiConfig: { select: { persona: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    }),
  ]);

  // Already completed → send user to dashboard
  if (account?.onboardingCompletedAt) redirect(`/${locale}`);

  const persona = (account?.aiConfig?.persona as Record<string, unknown>) || {};

  return (
    <OnboardingWizard
      userName={user?.name || user?.email?.split("@")[0] || "por aí"}
      accountName={account?.name || ""}
      initialPersona={{
        pipelineTemplate: String(persona.pipelineTemplate || ""),
        pipelineGoal: String(persona.pipelineGoal || ""),
        pipelinePrimaryChannel: String(persona.pipelinePrimaryChannel || "WHATSAPP"),
        aiName: String(persona.aiName || ""),
        aiRole: String(persona.aiRole || ""),
        tone: String(persona.tone || "professional_friendly"),
      }}
    />
  );
}
