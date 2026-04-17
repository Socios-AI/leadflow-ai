// src/app/api/integrations/meta/business/route.ts
//
// Stores / updates the business-context fields (name, niche, product/offer)
// the AI uses when handling Meta-originated leads.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateBusinessInfo, getIntegrationStatus } from "@/lib/integrations/meta";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    businessName?: string;
    businessNiche?: string;
    businessProduct?: string;
  };

  const status = await getIntegrationStatus(session.accountId);
  if (!status.connected) {
    return NextResponse.json(
      { error: "not_connected" },
      { status: 400 }
    );
  }

  await updateBusinessInfo(session.accountId, {
    businessName: body.businessName ?? null,
    businessNiche: body.businessNiche ?? null,
    businessProduct: body.businessProduct ?? null,
  });

  return NextResponse.json({ ok: true });
}
