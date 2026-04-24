import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAppStore } from "@/stores/app";

/**
 * Mirror the active client from the URL into the Zustand store.
 *
 * The URL is the single source of truth for which client the user is
 * working with. This hook is the one place that writes that into the
 * store, so consumers (sidebar, nav widgets, etc.) can just read
 * `selectedClient` reactively.
 *
 * Behaviour by route template:
 * - `/dashboard`                 → clear selectedClient (global view).
 * - `/dashboard/[slug]/...`      → set selectedClient to the URL slug.
 * - everything else under        → preserve the last known client
 *   `/dashboard` (admin, guides)   (so the selector still shows the
 *                                   client you were working with).
 *
 * Call this exactly once per dashboard page — wired into DashboardLayout.
 */
export function useClientUrlSync(): void {
  const router = useRouter();
  const setSelectedClient = useAppStore((s) => s.setSelectedClient);

  useEffect(() => {
    if (!router.isReady) return;
    const slug = router.query.slug as string | undefined;

    if (router.pathname === "/dashboard") {
      setSelectedClient(null);
    } else if (slug) {
      setSelectedClient(slug);
    }
    // Other routes: preserve the current value.
  }, [router.isReady, router.pathname, router.query.slug, setSelectedClient]);
}
