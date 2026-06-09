/**
 * Decides where the `/dashboard` index route should send a user, based on the
 * role/slug claims carried in their NextAuth JWT.
 *
 * - Admins see the global, all-clients dashboard.
 * - Any non-admin (single-client portal or multi-client collaborator) is
 *   redirected to their own client dashboard at `/dashboard/[slug]`, so they
 *   never land on the global admin shell.
 * - A non-admin with no resolvable client falls through to a "no client
 *   assigned" state instead of the (empty, non-functional) global view.
 *
 * Pure and dependency-free so it can be unit-tested in isolation; the
 * Next.js wiring lives in `getServerSideProps` of the dashboard index page.
 */

export type DashboardLandingToken = {
  role?: string | null;
  clientSlug?: string | null;
  allowedSlugs?: string[] | null;
};

export type DashboardLanding =
  | { kind: "admin" }
  | { kind: "redirect"; slug: string }
  | { kind: "no-client" };

export function resolveDashboardLanding(
  token: DashboardLandingToken | null
): DashboardLanding {
  if (token?.role === "admin") return { kind: "admin" };

  const slug = token?.clientSlug || token?.allowedSlugs?.[0] || null;
  if (slug) return { kind: "redirect", slug };

  return { kind: "no-client" };
}
