import { getRequestConfig } from "next-intl/server";

const locales = ["pt", "en", "es"] as const;
const defaultLocale = "pt";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && locales.includes(requested as typeof locales[number])
    ? requested
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});