import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <Head><title>Settings — Mission Control</title></Head>
      <iframe
        src="/settings/"
        className="w-full border-none block"
        style={{ height: "calc(100vh - 120px)" }}
        title="Settings"
      />
    </DashboardLayout>
  );
}
