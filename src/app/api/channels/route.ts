// src/app/api/channels/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const channels = await prisma.channel.findMany({
      where: { accountId: session.accountId },
    });

    // Strip sensitive fields from config before sending to client
    const safe = channels.map((ch) => {
      const cfg = ch.config as Record<string, any>;
      const sanitized = { ...cfg };
      // Never send API keys/tokens to the frontend
      delete sanitized.evolutionApiKey;
      delete sanitized.resendApiKey;
      delete sanitized.twilioAuthToken;
      return { ...ch, config: sanitized };
    });

    return NextResponse.json(safe);
  } catch (error) {
    console.error("Get channels error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { type, config, isEnabled } = body;

    if (!type || !["WHATSAPP", "EMAIL", "SMS"].includes(type)) {
      return NextResponse.json({ error: "Invalid channel type" }, { status: 400 });
    }

    // Merge with existing config (so partial updates don't wipe secrets)
    const existing = await prisma.channel.findUnique({
      where: { accountId_type: { accountId: session.accountId, type } },
    });

    const existingCfg = (existing?.config as Record<string, any>) || {};
    const mergedConfig = { ...existingCfg, ...config };

    // Remove empty strings from secrets (means "don't change")
    for (const key of ["evolutionApiKey", "resendApiKey", "twilioAuthToken"]) {
      if (mergedConfig[key] === "") delete mergedConfig[key];
    }

    const channel = await prisma.channel.upsert({
      where: { accountId_type: { accountId: session.accountId, type } },
      create: {
        accountId: session.accountId,
        type,
        isEnabled: isEnabled ?? false,
        config: mergedConfig,
      },
      update: {
        isEnabled: isEnabled ?? existing?.isEnabled ?? false,
        config: mergedConfig,
      },
    });

    return NextResponse.json({ success: true, channelId: channel.id });
  } catch (error) {
    console.error("Update channel error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}