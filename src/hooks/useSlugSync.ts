import { useRouter } from "next/router";
import { useAppStore } from "@/stores/app";

/**
 * Read the active client slug for the current page.
 *
 * Returns the URL slug when the router is ready, falling back to the last
 * known value from the store to avoid an empty flash on the first render.
 * This is a pure selector — the URL → store sync is centralised in
 * `useClientUrlSync` (wired into DashboardLayout), so there is no effect
 * here and no race between URL changes and store mutations.
 */
export function useSlugSync(): string {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;
  const selectedClient = useAppStore((s) => s.selectedClient);
  return slug || selectedClient || "";
}
