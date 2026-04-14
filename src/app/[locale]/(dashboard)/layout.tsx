// src/app/[locale]/(dashboard)/layout.tsx
import React from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
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

  return <DashboardShell>{children}</DashboardShell>
}