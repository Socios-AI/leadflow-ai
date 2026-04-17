// src/app/api/webhooks/manage/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import crypto from "crypto";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhooks = await prisma.webhook.findMany({
    where: { accountId: session.accountId },
    orderBy: { createdAt: "desc" },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return NextResponse.json(
    webhooks.map((w) => ({
      ...w,
      webhookUrl: `${appUrl}/api/v1/webhooks/leads/${session.accountId}`,
      metaWebhookUrl: `${appUrl}/api/v1/webhooks/meta/${session.accountId}`,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

  const webhook = await prisma.webhook.create({
    data: {
      accountId: session.accountId,
      url: body.name || "Default Webhook",
      secret,
      events: body.events || ["lead.created"],
      isActive: true,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return NextResponse.json({
    ...webhook,
    webhookUrl: `${appUrl}/api/v1/webhooks/leads/${session.accountId}`,
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await prisma.webhook.deleteMany({
    where: { id, accountId: session.accountId },
  });

  return NextResponse.json({ success: true });
}
