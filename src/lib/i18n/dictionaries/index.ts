import { pt } from "./pt";
import { en } from "./en";
import { es } from "./es";
import type { Locale } from "../config";

const dictionaries = {
  pt,
  en,
  es,
} as const;

export function getDictionary(locale: Locale) {
  return dictionaries[locale] || dictionaries.pt;
}

export type { Dictionary } from "./pt";