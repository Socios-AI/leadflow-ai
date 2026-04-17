// src/lib/integrations/google-calendar.ts
//
// Google Calendar integration — per-account OAuth 2.0 flow + API helpers.
//
// No external SDK: everything goes through fetch. This keeps the bundle
// small and sidesteps the 50MB+ cost of the `googleapis` package.
//
// Required env vars:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI     (e.g. https://app.example.com/api/integrations/google/callback)

import prisma from "@/lib/db/prisma";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const CAL_API = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

// ═══════════════════════════════════════════════
// OAUTH FLOW
// ═══════════════════════════════════════════════

export function getAuthUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requiredEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // force refresh_token on every connect
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requiredEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed: ${res.status} ${body}`);
  }
  return (await res.json()) as TokenResponse;
}

async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
  const data = (await res.json()) as { email?: string };
  return data.email || "";
}

/**
 * Persist tokens after a successful OAuth code exchange.
 * Called from the /callback route.
 */
export async function persistIntegration(
  accountId: string,
  tokens: TokenResponse
): Promise<void> {
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. The user may have already authorized the app — revoke access at https://myaccount.google.com/permissions and try again."
    );
  }
  const email = await fetchUserEmail(tokens.access_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleCalendarIntegration.upsert({
    where: { accountId },
    create: {
      accountId,
      email,
      calendarId: "primary",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: expiresAt,
      scope: tokens.scope,
    },
    update: {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: expiresAt,
      scope: tokens.scope,
    },
  });
}

// ═══════════════════════════════════════════════
// TOKEN REFRESH
// ═══════════════════════════════════════════════

async function refreshAccessToken(
  accountId: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await prisma.googleCalendarIntegration.update({
    where: { accountId },
    data: {
      accessToken: data.access_token,
      tokenExpiresAt: expiresAt,
    },
  });
  return { accessToken: data.access_token, expiresAt };
}

async function getFreshAccessToken(accountId: string): Promise<string> {
  const integ = await prisma.googleCalendarIntegration.findUnique({
    where: { accountId },
  });
  if (!integ) throw new Error(`No Google Calendar integration for ${accountId}`);

  // Refresh if it expires in < 60s
  const buffer = 60_000;
  if (integ.tokenExpiresAt.getTime() - Date.now() > buffer) {
    return integ.accessToken;
  }
  const refreshed = await refreshAccessToken(accountId, integ.refreshToken);
  return refreshed.accessToken;
}

async function calendarFetch(
  accountId: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getFreshAccessToken(accountId);
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return res;
}

// ═══════════════════════════════════════════════
// FREE/BUSY + SLOT FINDER
// ═══════════════════════════════════════════════

export interface BusyWindow {
  start: string;
  end: string;
}

export async function listBusyWindows(
  accountId: string,
  timeMinISO: string,
  timeMaxISO: string,
  timeZone = "America/Sao_Paulo"
): Promise<BusyWindow[]> {
  const integ = await prisma.googleCalendarIntegration.findUnique({
    where: { accountId },
    select: { calendarId: true },
  });
  if (!integ) return [];
  const res = await calendarFetch(accountId, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      timeZone,
      items: [{ id: integ.calendarId }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`freeBusy failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: BusyWindow[] }>;
  };
  const busy = data.calendars?.[integ.calendarId]?.busy || [];
  return busy;
}

export interface FindSlotsOptions {
  durationMinutes: number; // e.g. 30
  days: number; // horizon, e.g. 7
  businessHoursStart: number; // 0–23, e.g. 9
  businessHoursEnd: number; // e.g. 18
  timeZone?: string;
  slotStepMinutes?: number; // discretization step
  maxSlots?: number;
}

/**
 * Returns a list of ISO start/end slots that don't overlap busy windows,
 * within business hours of the next `days` days.
 */
export async function findAvailableSlots(
  accountId: string,
  opts: FindSlotsOptions
): Promise<{ startISO: string; endISO: string }[]> {
  const {
    durationMinutes,
    days,
    businessHoursStart,
    businessHoursEnd,
    timeZone = "America/Sao_Paulo",
    slotStepMinutes = 30,
    maxSlots = 8,
  } = opts;

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const busy = await listBusyWindows(
    accountId,
    now.toISOString(),
    horizon.toISOString(),
    timeZone
  );

  const busyRanges = busy.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const slots: { startISO: string; endISO: string }[] = [];
  const stepMs = slotStepMinutes * 60_000;
  const durationMs = durationMinutes * 60_000;

  // Start from the next slot boundary after now + 1h buffer
  const bufferMs = 60 * 60_000;
  let cursor = roundUpTo(now.getTime() + bufferMs, stepMs);

  while (cursor + durationMs <= horizon.getTime() && slots.length < maxSlots) {
    const d = new Date(cursor);
    const hour = d.getHours();

    // Skip outside business hours
    if (hour < businessHoursStart || hour >= businessHoursEnd) {
      cursor = nextBusinessHourStart(d, businessHoursStart, businessHoursEnd);
      continue;
    }

    const endCursor = cursor + durationMs;
    const overlaps = busyRanges.some(
      (b) => !(endCursor <= b.start || cursor >= b.end)
    );

    if (!overlaps) {
      slots.push({
        startISO: new Date(cursor).toISOString(),
        endISO: new Date(endCursor).toISOString(),
      });
    }
    cursor += stepMs;
  }

  return slots;
}

function roundUpTo(ms: number, stepMs: number): number {
  return Math.ceil(ms / stepMs) * stepMs;
}

function nextBusinessHourStart(
  d: Date,
  bhStart: number,
  bhEnd: number
): number {
  const next = new Date(d);
  if (d.getHours() >= bhEnd) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(bhStart, 0, 0, 0);
  return next.getTime();
}

// ═══════════════════════════════════════════════
// CREATE EVENT
// ═══════════════════════════════════════════════

export interface CreateEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  attendeeEmail?: string;
  attendeeName?: string;
  timeZone?: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}

export interface CreateEventResult {
  eventId: string;
  htmlLink?: string;
  hangoutLink?: string;
}

export async function createEvent(
  accountId: string,
  input: CreateEventInput
): Promise<CreateEventResult> {
  const integ = await prisma.googleCalendarIntegration.findUnique({
    where: { accountId },
    select: { calendarId: true },
  });
  if (!integ) throw new Error(`No Google Calendar integration for ${accountId}`);

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startISO, timeZone: input.timeZone || "America/Sao_Paulo" },
    end: { dateTime: input.endISO, timeZone: input.timeZone || "America/Sao_Paulo" },
  };
  if (input.attendeeEmail) {
    body.attendees = [
      {
        email: input.attendeeEmail,
        displayName: input.attendeeName,
      },
    ];
  }

  const qs = new URLSearchParams({
    sendUpdates: input.sendUpdates || "all",
  });

  const res = await calendarFetch(
    accountId,
    `/calendars/${encodeURIComponent(integ.calendarId)}/events?${qs.toString()}`,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`createEvent failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
  };
  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    hangoutLink: data.hangoutLink,
  };
}

// ═══════════════════════════════════════════════
// STATUS / DISCONNECT
// ═══════════════════════════════════════════════

export async function getIntegrationStatus(accountId: string): Promise<
  | {
      connected: true;
      email: string;
      calendarId: string;
      connectedAt: Date;
    }
  | { connected: false }
> {
  const integ = await prisma.googleCalendarIntegration.findUnique({
    where: { accountId },
    select: { email: true, calendarId: true, createdAt: true },
  });
  if (!integ) return { connected: false };
  return {
    connected: true,
    email: integ.email,
    calendarId: integ.calendarId,
    connectedAt: integ.createdAt,
  };
}

export async function disconnect(accountId: string): Promise<void> {
  const integ = await prisma.googleCalendarIntegration.findUnique({
    where: { accountId },
    select: { refreshToken: true },
  });
  if (integ?.refreshToken) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(integ.refreshToken)}`,
        { method: "POST" }
      );
    } catch {
      // Best-effort revoke; we still wipe locally.
    }
  }
  await prisma.googleCalendarIntegration.deleteMany({ where: { accountId } });
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function requiredEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}
