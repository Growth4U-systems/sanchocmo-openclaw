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
  const selectedClient = useAppStore((s) => s.selectedClient);
  const setSelectedClient = useAppStore((s) => s.setSelectedClient);

  // URL → store sync. Deps intentionally exclude `selectedClient`: this hook
  // is one-way (URL is the source of truth for the current slug). Re-running
  // on store changes would let the hook race with code that clears
  // selectedClient during a navigation — e.g. the "Todos los clientes"
  // option calls setSelectedClient(null) just before router.push("/dashboard"),
  // and otherwise the old URL slug would be written back into the store
  // before the URL actually changes.
  useEffect(() => {
    if (routerReady && slug) {
      setSelectedClient(slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerReady, slug, setSelectedClient]);

  // Before router is ready, fall back to store value
  if (!routerReady) return selectedClient || "";
  return slug || selectedClient || "";
}
