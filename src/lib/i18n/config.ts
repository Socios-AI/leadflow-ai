export const locales = ["pt", "en", "es", "it"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "pt";

export const localeNames: Record<Locale, string> = {
  pt: "Portugues",
  en: "English",
  es: "Espanol",
  it: "Italiano",
};

// ISO codes used by the locale picker. Flag emojis are intentionally not
// rendered anywhere user-facing per the brand guideline; if a picker needs
// a visual cue, use a country abbreviation instead.
export const localeCountryCode: Record<Locale, string> = {
  pt: "BR",
  en: "US",
  es: "ES",
  it: "IT",
};
