import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAppStore } from "@/stores/app";

/**
 * Syncs the URL slug parameter to the Zustand selectedClient store.
 * Use in every [slug] page to keep sidebar in sync with the URL.
 */
export function useSlugSync(): string {
  const router = useRouter();
  const routerReady = router.isReady;
  const slug = router.query.slug as string;
  const { selectedClient, setSelectedClient } = useAppStore();

  useEffect(() => {
    if (routerReady && slug && slug !== selectedClient) {
      setSelectedClient(slug);
    }
  }, [routerReady, slug, selectedClient, setSelectedClient]);

  // Before router is ready, fall back to store value
  if (!routerReady) return selectedClient || "";
  return slug || selectedClient || "";
}
