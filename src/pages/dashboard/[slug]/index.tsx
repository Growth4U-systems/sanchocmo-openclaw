import Head from "next/head";
import { useRouter } from "next/router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ClientDashboardV2 } from "@/components/dashboard/client-dashboard";

/**
 * /dashboard/[slug] — client-scoped dashboard.
 * The URL slug is the single source of truth; no state-based redirect.
 */
export default function ClientDashboardPage() {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;

  if (!slug) {
    // First render before router hydrates.
    return <DashboardLayout fullBleed>{null}</DashboardLayout>;
  }

  return (
    <DashboardLayout fullBleed>
      <Head>
        <title>{slug} — Mission Control</title>
      </Head>
      <ClientDashboardV2 slug={slug} />
    </DashboardLayout>
  );
}
