import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAppStore } from "@/stores/app";

/**
 * /dashboard/[slug] — auto-selects the client and redirects to dashboard
 */
export default function ClientDashboardRedirect() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const { setSelectedClient } = useAppStore();

  useEffect(() => {
    if (slug) {
      setSelectedClient(slug);
      router.replace("/dashboard");
    }
  }, [slug, setSelectedClient, router]);

  return null;
}
