// src/app/page.tsx
//
// Root entry. Middleware handles auth + locale routing for nearly every
// case (unauthenticated -> /<locale>/login, authenticated -> /<locale>),
// but Next still needs a page component for the literal "/" path so the
// router has something to render when middleware passes through. We just
// redirect to the default locale and let the locale-aware tree take it
// from there.

import { redirect } from "next/navigation";
import { defaultLocale } from "@/lib/i18n/config";

export default function RootRedirect() {
  redirect(`/${defaultLocale}`);
}
