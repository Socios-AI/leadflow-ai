// src/i18n/routing.ts
import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["pt", "en", "es"],
  defaultLocale: "pt",
  localePrefix: "as-needed",  // pt não aparece na URL, só /en e /es
  localeDetection: false,      // não detecta idioma do browser
});

export const { Link, useRouter, usePathname, redirect } = createNavigation(routing);

export type Locale = (typeof routing.locales)[number];