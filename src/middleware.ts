import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

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
