import { useRouter } from "next/router";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function AtalayaPage() {
  const router = useRouter();
  const slug = router.query.slug as string;

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
