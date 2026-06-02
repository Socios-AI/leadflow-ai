// src/i18n/routing.ts
import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["pt", "en", "es", "it"],
  defaultLocale: "pt",
  // EVERY route carries the locale prefix. With "as-needed" the default
  // locale ("pt") was served at `/`, meaning any <Link href="/"> in a
  // non-default locale (like the logo) stripped the prefix; next-intl's
  // middleware then fell back to "pt" and the user lost their language
  // on every navigation. "always" + a NEXT_LOCALE cookie set on switch
  // makes the locale sticky across sessions and refreshes.
  localePrefix: "always",
  // localeDetection lets next-intl read the NEXT_LOCALE cookie we set
  // in the switcher and the Accept-Language header on the very first
  // request. After that the URL prefix is the source of truth.
  localeDetection: true,
});

export const { Link, useRouter, usePathname, redirect } = createNavigation(routing);

export type Locale = (typeof routing.locales)[number];