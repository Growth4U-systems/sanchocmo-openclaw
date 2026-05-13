/**
 * Legacy redirect: /dashboard/[slug]/foundation → /dashboard/[slug]/brand-brain
 *
 * Preserves all query params (?doc=..., etc.) so existing bookmarks survive.
 * Phase 6 will remove this file once external callers have migrated.
 */
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function FoundationRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const { slug, ...rest } = router.query;
    if (!slug || typeof slug !== "string") return;
    router.replace({
      pathname: "/dashboard/[slug]/brand-brain",
      query: { slug, ...rest },
    });
  }, [router]);

  return null;
}
