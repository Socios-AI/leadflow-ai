// src/app/api/channels/email/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const accountId = session.account.id;

  try {
    switch (action) {
      case "test": {
        const { provider, resendApiKey, domain, fromName, fromEmail, testEmail } = body;
        const apiKey = provider === "platform" ? process.env.RESEND_API_KEY! : resendApiKey;
        if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 400 });

        const resend = new Resend(apiKey);
        const from = `${fromName || "Team"} <${fromEmail || "noreply"}@${domain}>`;
        const { data, error } = await resend.emails.send({
          from, to: [testEmail || "test@example.com"],
          subject: "Test Email",
          html: "<p>Your email channel is configured correctly.</p>",
        });
        if (error) return NextResponse.json({ success: false, error: error.message });
        return NextResponse.json({ success: true, emailId: data?.id });
      }

      case "save": {
        const { provider, resendApiKey, domain, fromName, fromEmail, enabled } = body;
        const config: Record<string, any> = {
          provider: provider || "platform",
          domain: domain || process.env.RESEND_DOMAIN || "",
          fromName: fromName || "Team",
          fromEmail: fromEmail || "noreply",
        };
        if (provider === "custom" && resendApiKey) config.resendApiKey = resendApiKey;

        await prisma.channel.upsert({
          where: { accountId_type: { accountId, type: "EMAIL" } },
          create: { accountId, type: "EMAIL", isEnabled: enabled ?? false, config },
          update: { isEnabled: enabled ?? false, config },
        });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
