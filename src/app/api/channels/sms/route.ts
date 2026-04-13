// src/app/api/channels/sms/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const accountId = session.account.id;

  try {
    switch (action) {
      case "test": {
        const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber, testPhone } = body;
        if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
          return NextResponse.json({ error: "All Twilio fields required" }, { status: 400 });
        }
        const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
          },
          body: new URLSearchParams({
            To: testPhone || twilioPhoneNumber,
            From: twilioPhoneNumber,
            Body: "Test SMS - your channel is configured.",
          }),
        });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ success: false, error: data.message });
        return NextResponse.json({ success: true, sid: data.sid });
      }

      case "save": {
        const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber, enabled } = body;
        const config: Record<string, any> = {
          twilioAccountSid: twilioAccountSid || "",
          twilioPhoneNumber: twilioPhoneNumber || "",
        };
        if (twilioAuthToken) config.twilioAuthToken = twilioAuthToken;

        await prisma.channel.upsert({
          where: { accountId_type: { accountId, type: "SMS" } },
          create: { accountId, type: "SMS", isEnabled: enabled ?? false, config },
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
