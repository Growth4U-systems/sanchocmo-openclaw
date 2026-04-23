import type { NextRouter } from "next/router";

/**
 * Navigate to the client-scoped version of the current page.
 *
 * The decision uses the Next.js route template (`router.pathname`) rather
 * than the rendered URL (`router.asPath`), so it is aware of which routes
 * are client-scoped (`/dashboard/[slug]/...`) and which are global or admin
 * (`/dashboard`, `/dashboard/admin/*`, `/dashboard/changelog`, ...).
 *
 * Rules:
 * - `targetSlug = null` → go to the global dashboard (`/dashboard`).
 * - On a `/dashboard/[slug]/<first>/...` template, preserve `<first>` as the
 *   shared "page kind" (foundation, projects, metrics, ...) but drop any
 *   deeper dynamic params — project IDs, doc paths, etc. do not map across
 *   clients and would otherwise land on a stale or missing resource.
 * - On any other template (admin, changelog, bare `/dashboard`), the target
 *   client has no equivalent sub-page, so land on its home (`/dashboard/:slug`).
 */
export function navigateToClient(
  router: NextRouter,
  targetSlug: string | null,
): void {
  if (!targetSlug) {
    router.push("/dashboard");
    return;
  }

  const segments = router.pathname.split("/");
  // Segments for `/dashboard/[slug]/foundation` → ["", "dashboard", "[slug]", "foundation"].
  const isClientScoped =
    segments[1] === "dashboard" && segments[2] === "[slug]";
  const firstSub = isClientScoped ? segments[3] : undefined;

  const target = firstSub
    ? `/dashboard/${targetSlug}/${firstSub}`
    : `/dashboard/${targetSlug}`;
  router.push(target);
}
