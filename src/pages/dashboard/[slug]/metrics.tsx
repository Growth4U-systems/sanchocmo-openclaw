import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MockupMetricsDashboard } from "@/components/dashboard/metrics-v2/MockupMetricsDashboard";
import { useSlugSync } from "@/hooks/useSlugSync";

function MetricsPage() {
  const slug = useSlugSync();
  return <MetricsPageInner key={slug || "__none__"} slug={slug} />;
}

export default MetricsPage;

function MetricsPageInner({ slug }: { slug: string }) {
  return (
    <DashboardLayout fullBleed>
      <Head>
        <title>{`Métricas — ${slug} — Mission Control`}</title>
      </Head>
      <MockupMetricsDashboard slug={slug} />
    </DashboardLayout>
  );
}
