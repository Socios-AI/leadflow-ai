import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["pt", "en", "es"],
  defaultLocale: "pt",
});

export const { Link, useRouter, usePathname, redirect } = createNavigation(routing);

export type Locale = (typeof routing.locales)[number];