// src/app/api/onboarding/skip/route.ts
//
// Marks onboarding as completed without saving wizard data. The user can
// edit everything later in Pipeline / AI Config.

import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.account.update({
    where: { id: session.accountId },
    data: { onboardingCompletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
