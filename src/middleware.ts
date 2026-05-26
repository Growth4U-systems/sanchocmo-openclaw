import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Clients (single-client portal or multi-client member) never see the
    // global "all clients" dashboard — send them to their own client. This
    // also contains the global cost/integration/activity cards from leaking
    // cross-client data to non-admins.
    if (token?.role === "client" && pathname === "/dashboard") {
      const allowed = token?.allowedSlugs as string[] | null | undefined;
      const homeSlug =
        (token?.clientSlug as string | null | undefined) ||
        (allowed && allowed.length ? allowed[0] : null);
      if (homeSlug) {
        return NextResponse.redirect(new URL(`/dashboard/${homeSlug}`, req.url));
      }
    }

    // Admin-only routes (activity log)
    // Settings is accessible to all authenticated users in local deployment
    if (pathname.startsWith("/dashboard/admin/activity") && token?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Client portal: can only access their own slug
    if (token?.role === "client" && token?.clientSlug) {
      const slugMatch = pathname.match(/^\/dashboard\/([^/]+)/);
      if (slugMatch && slugMatch[1] !== "admin" && slugMatch[1] !== token.clientSlug) {
        return NextResponse.redirect(
          new URL(`/dashboard/${token.clientSlug}`, req.url)
        );
      }
    }

    // Multi-client team member: can only access slugs in their allowed list
    const allowed = token?.allowedSlugs as string[] | null | undefined;
    if (token?.role === "client" && allowed && allowed.length) {
      const slugMatch = pathname.match(/^\/dashboard\/([^/]+)/);
      if (slugMatch && slugMatch[1] !== "admin" && !allowed.includes(slugMatch[1])) {
        return NextResponse.redirect(
          new URL(`/dashboard/${allowed[0]}`, req.url)
        );
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
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

export const config = {
  matcher: ["/dashboard/:path*"],
};
