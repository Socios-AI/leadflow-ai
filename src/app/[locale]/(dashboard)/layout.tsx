// src/app/[locale]/(dashboard)/layout.tsx
import React from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import prisma from '@/lib/db/prisma'
import { DashboardShell } from '@/components/layout/dashboard-shell'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getSession()

  if (!session) {
    redirect(`/${locale}/login`)
  }

  // Gate onboarding: first-time accounts must finish the wizard before
  // landing on the dashboard. We query once here — cheap and auth-required.
  const account = await prisma.account.findUnique({
    where: { id: session.accountId },
    select: { onboardingCompletedAt: true },
  })
  if (!account?.onboardingCompletedAt) {
    redirect(`/${locale}/onboarding`)
  }

  return <DashboardShell>{children}</DashboardShell>
}