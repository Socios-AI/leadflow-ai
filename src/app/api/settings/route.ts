// src/app/api/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const account = await prisma.account.findUnique({
      where: { id: session.accountId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        locale: true,
        timezone: true,
      },
    });

    return NextResponse.json(account);
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, timezone, locale } = body;

    const updated = await prisma.account.update({
      where: { id: session.accountId },
      data: {
        ...(name && { name }),
        ...(timezone && { timezone }),
        ...(locale && { locale }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}