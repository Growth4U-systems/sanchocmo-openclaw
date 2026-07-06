import Head from "next/head";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <>
      <Head>
        <title>404 — Mission Control</title>
      </Head>
      <main className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic text-center">
            <p className="text-5xl mb-3">🧭</p>
            <h1 className="font-heading text-3xl text-navy mb-2">404</h1>
            <p className="font-heading text-xl text-rust mb-2">{t("title")}</p>
            <p className="text-sm text-muted-foreground mb-6">{t("description")}</p>
            <Link
              href="/dashboard"
              className="inline-block w-full px-4 py-2 bg-rust text-white rounded-lg font-semibold text-sm hover:opacity-90"
            >
              {t("backToDashboard")}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
