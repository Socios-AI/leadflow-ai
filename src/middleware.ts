// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const AUTH_PATHS = ["/login", "/register", "/forgot-password"];
const PUBLIC_PATHS = [...AUTH_PATHS, "/pricing"];

/**
 * Detect a Supabase session from cookies — PRESENCE-BASED ONLY.
 *
 * We deliberately do NOT parse the cookie or check the access-token expiry
 * here. With @supabase/ssr 0.10 the cookie value is base64-encoded and often
 * chunked (sb-<ref>-auth-token.0/.1), so JSON.parse always failed and the old
 * expiry branch produced false negatives that bounced users with a still-valid
 * (refreshable) session straight back to /login. The real validity check is
 * getUser() in the dashboard layout (which also refreshes expired tokens);
 * the middleware only needs to know whether auth cookies are present at all.
 */
function hasSupabaseSession(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("-auth-token") &&
        !!c.value &&
        c.value.length > 10
    );
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

  // Apply intl middleware first. With localePrefix: "always" this will
  // redirect `/` to `/<locale>` based on the NEXT_LOCALE cookie or the
  // Accept-Language header.
  const intlResponse = intlMiddleware(req);

  // Extract path without locale prefix. When the URL has no prefix yet
  // (the intl middleware hasn't redirected), fall back to the cookie set
  // by the language switcher so our auth redirects don't downgrade an
  // English user to Portuguese.
  const localeMatch = pathname.match(/^\/(pt|en|es|it)/);
  const cookieLocale = req.cookies.get("NEXT_LOCALE")?.value;
  const locale =
    localeMatch?.[1] ||
    (cookieLocale && ["pt", "en", "es", "it"].includes(cookieLocale) ? cookieLocale : "pt");
  const pathWithoutLocale = pathname.replace(/^\/(pt|en|es|it)/, "") || "/";

  const isPublicPath = PUBLIC_PATHS.some((p) => pathWithoutLocale.startsWith(p));
  const hasSession = hasSupabaseSession(req);

  // NOTE: we intentionally do NOT redirect "auth page + has-cookie" to the
  // dashboard here. That rule, combined with the layout redirecting back to
  // /login whenever getSession() returns null, created an infinite ping-pong
  // ("login reloads back to login") for users whose cookies are present but
  // whose token can't be resolved. Letting the login page render breaks the
  // loop; a genuinely logged-in user simply re-enters from there.

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