import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    if (isLocalDashboardBypass(req.nextUrl.hostname)) {
      return NextResponse.next();
    }

    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const isAdmin = token?.role === "admin";
    const clientSlug = token?.clientSlug as string | null | undefined;
    const allowed = token?.allowedSlugs as string[] | null | undefined;
    // Where to send a non-admin who lands somewhere they shouldn't.
    const homeSlug = clientSlug || (allowed && allowed.length ? allowed[0] : null);
    const homeUrl = homeSlug ? `/dashboard/${homeSlug}` : "/dashboard";

    // Admin-only sections (users, clients, activity, ...). Non-admins are
    // redirected away rather than shown an empty page. Settings stays open to
    // all authenticated users (per local deployment).
    if (
      pathname.startsWith("/dashboard/admin") &&
      !pathname.startsWith("/dashboard/admin/settings") &&
      !isAdmin
    ) {
      return NextResponse.redirect(new URL(homeUrl, req.url));
    }

    // Clients (single-client portal or multi-client member) never see the
    // global "all clients" dashboard — send them to their own client. This
    // also contains the global cost/integration/activity cards from leaking
    // cross-client data to non-admins.
    if (token?.role === "client" && pathname === "/dashboard" && homeSlug) {
      return NextResponse.redirect(new URL(`/dashboard/${homeSlug}`, req.url));
    }

    // Client portal: can only access their own slug
    if (token?.role === "client" && clientSlug) {
      const slugMatch = pathname.match(/^\/dashboard\/([^/]+)/);
      if (slugMatch && slugMatch[1] !== "admin" && slugMatch[1] !== clientSlug) {
        return NextResponse.redirect(new URL(`/dashboard/${clientSlug}`, req.url));
      }
    }

    // Multi-client team member: can only access slugs in their allowed list
    if (token?.role === "client" && allowed && allowed.length) {
      const slugMatch = pathname.match(/^\/dashboard\/([^/]+)/);
      if (slugMatch && slugMatch[1] !== "admin" && !allowed.includes(slugMatch[1])) {
        return NextResponse.redirect(new URL(`/dashboard/${allowed[0]}`, req.url));
      }
    }

    return NextResponse.next();
  },
  {
    secret: process.env.NEXTAUTH_SECRET || "mc-dev-secret-change-me",
    callbacks: {
      authorized: ({ token, req }) => {
        if (isLocalDashboardBypass(req.nextUrl.hostname)) return true;
        // Allow API routes without session (they use their own auth)
        if (req.nextUrl.pathname.startsWith("/api/")) return true;
        // Allow auth pages
        if (req.nextUrl.pathname.startsWith("/auth/")) return true;
        // Allow home page
        if (req.nextUrl.pathname === "/") return true;
        // Require auth for dashboard
        if (req.nextUrl.pathname.startsWith("/dashboard")) return !!token;
        // Allow everything else (legacy rewrites)
        return true;
      },
    },
  }
);

function isLocalDashboardBypass(hostname: string): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_DASHBOARD_BYPASS === "1" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  );
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
