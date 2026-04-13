// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const AUTH_PATHS = ["/login", "/register", "/forgot-password"];
const PUBLIC_PATHS = [...AUTH_PATHS, "/pricing"];

/**
 * Detect Supabase session from cookies.
 * Now also checks if the cookie actually has content (not empty/corrupted).
 */
function hasSupabaseSession(req: NextRequest): boolean {
  const allCookies = req.cookies.getAll();
  const authCookies = allCookies.filter(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );

  if (authCookies.length === 0) return false;

  // Check that at least one cookie has a non-empty value
  // and try to verify it's not expired by parsing the base cookie
  const baseCookie = authCookies.find((c) => !c.name.match(/\.\d+$/));
  if (baseCookie) {
    try {
      const parsed = JSON.parse(baseCookie.value);
      // Check if access_token exists and isn't expired
      if (parsed?.access_token && parsed?.expires_at) {
        const expiresAt = parsed.expires_at * 1000; // convert to ms
        if (Date.now() > expiresAt) {
          return false; // Token expired
        }
      }
      return !!parsed?.access_token;
    } catch {
      // If it's chunked, the base cookie won't parse as JSON
      // In that case, just check that cookies exist with content
      return authCookies.some((c) => c.value && c.value.length > 10);
    }
  }

  // Chunked cookies — just verify they have content
  return authCookies.some((c) => c.value && c.value.length > 10);
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip API routes
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Apply intl middleware first
  const intlResponse = intlMiddleware(req);

  // Extract path without locale prefix
  const localeMatch = pathname.match(/^\/(pt|en|es)/);
  const locale = localeMatch?.[1] || "pt";
  const pathWithoutLocale = pathname.replace(/^\/(pt|en|es)/, "") || "/";

  const isAuthPath = AUTH_PATHS.some((p) => pathWithoutLocale.startsWith(p));
  const isPublicPath = PUBLIC_PATHS.some((p) => pathWithoutLocale.startsWith(p));
  const hasSession = hasSupabaseSession(req);

  // Authenticated users on auth pages → dashboard
  if (isAuthPath && hasSession) {
    return NextResponse.redirect(new URL(`/${locale}`, req.url));
  }

  // Unauthenticated users on protected routes → login
  if (!isPublicPath && pathWithoutLocale !== "/" && !hasSession) {
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Root path without session → login
  if (pathWithoutLocale === "/" && !hasSession) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
  }

  return intlResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|.*\\..*$).*)"],
};