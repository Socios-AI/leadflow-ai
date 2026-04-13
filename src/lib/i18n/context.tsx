"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Locale, defaultLocale, locales } from "./config";
import { getDictionary, Dictionary } from "./dictionaries";

interface I18nContextType {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("locale") as Locale;
      if (saved && locales.includes(saved)) {
        return saved;
      }
      const browserLang = navigator.language.split("-")[0] as Locale;
      if (locales.includes(browserLang)) {
        return browserLang;
      }
    }
    return defaultLocale;
  });

  const dictionary = getDictionary(locale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== "undefined") {
      localStorage.setItem("locale", newLocale);
      document.documentElement.lang = newLocale;
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const keys = key.split(".");
      let value: unknown = dictionary;

      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          console.warn(`Translation key not found: ${key}`);
          return key;
        }
      }

      if (typeof value !== "string") {
        console.warn(`Translation key is not a string: ${key}`);
        return key;
      }

      if (params) {
        return value.replace(/{(\w+)}/g, (_, paramKey) => {
          return params[paramKey]?.toString() ?? `{${paramKey}}`;
        });
      }

      return value;
    },
    [dictionary]
  );

  return (
    <I18nContext.Provider value={{ locale, dictionary, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useTranslation() {
  const { t, locale, setLocale } = useI18n();
  return { t, locale, setLocale };
}