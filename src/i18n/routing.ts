// src/i18n/routing.ts
import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["pt", "en", "es", "it"],
  defaultLocale: "pt",
  // pt stays at the root URL; /en, /es and /it get prefixes
  localePrefix: "as-needed",
  localeDetection: false,
});

export const { Link, useRouter, usePathname, redirect } = createNavigation(routing);

export type Locale = (typeof routing.locales)[number];