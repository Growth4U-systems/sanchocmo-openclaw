import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  // Try to read locale from the Zustand persisted store cookie
  let locale: "es" | "en" = "es";

  try {
    const cookieStore = await cookies();
    const stored = cookieStore.get("mc-locale")?.value;
    if (stored === "en" || stored === "es") {
      locale = stored;
    }
  } catch {
    // cookies() not available in Pages Router SSR — fall back to default
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
