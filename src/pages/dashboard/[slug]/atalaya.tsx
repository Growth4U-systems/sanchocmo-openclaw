import { useState, useEffect } from "react";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";

export default function AtalayaPage() {
  const slug = useSlugSync();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system/mc-admin-token")
      .then((r) => {
        if (!r.ok) throw new Error("No admin access");
        return r.json();
      })
      .then((data) => setAdminToken(data.token))
      .catch(() => setError("No se pudo obtener acceso de administrador."));
  }, []);

  return (
    <DashboardLayout>
      <Head><title>Atalaya — {slug} — Mission Control</title></Head>
      {error ? (
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">{error}</div>
      ) : !adminToken ? (
        <div className="flex items-center justify-center h-[60vh] text-muted-foreground">Cargando...</div>
      ) : (
        <iframe
          src={`/mc/admin/${adminToken}/atalaya/${slug}/`}
          className="w-full border-none block"
          style={{ height: "calc(100vh - 120px)" }}
          title="Atalaya"
        />
      )}
    </DashboardLayout>
  );
}
