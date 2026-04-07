import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";

export default function AtalayaPage() {
  const slug = useSlugSync();

  return (
    <DashboardLayout>
      <Head><title>Atalaya — {slug} — Mission Control</title></Head>
      <iframe
        src={`/mc/atalaya/${slug}/`}
        className="w-full border-none block"
        style={{ height: "calc(100vh - 120px)" }}
        title="Atalaya"
      />
    </DashboardLayout>
  );
}
