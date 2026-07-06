import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app";

import esMessages from "@/messages/es.json";
import enMessages from "@/messages/en.json";

const messages = { es: esMessages, en: enMessages } as const;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppInner({ Component, pageProps }: AppProps) {
  const { theme, locale } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages[locale]}
      timeZone="Europe/Madrid"
    >
      <Component {...pageProps} />
    </NextIntlClientProvider>
  );
}

export default function App(props: AppProps) {
  return (
    <SessionProvider session={props.pageProps.session}>
      <QueryClientProvider client={queryClient}>
        <AppInner {...props} />
      </QueryClientProvider>
    </SessionProvider>
  );
}
