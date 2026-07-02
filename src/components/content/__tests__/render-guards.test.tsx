/**
 * SAN-385 — Content Creation render-guard regression.
 *
 * The prod/staging symptom was a client render exception (browser pulls the
 * Next `_error` chunk) when a Content Creation payload came back partial or
 * non-array. PR #1054 normalized the calendar/state hooks; the completeness
 * audit then found the remaining unguarded paths — hooks #1054 did NOT
 * normalize (useContentTask, useDraft) feeding:
 *   - MediaGallery: `target_channels` (missing/non-array on disk) and
 *     `draft.meta.media` (legacy/hand-edited frontmatter → non-array).
 *   - PostMetricsBadge: `engagement_pct` non-numeric → `.toFixed` throws.
 *
 * Each case renders the component with a malformed payload and asserts it does
 * NOT throw (pre-fix these threw a TypeError during render). Rendered with
 * renderToStaticMarkup under `tsx --tsconfig tsconfig.tsx-tests.json --test`.
 * Run: `npm run test:content`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Draft, PostMetricsSnapshot } from "@/lib/data/drafts";
import { MediaGallery } from "../MediaGallery";
import { PostMetricsBadge } from "../PostMetricsBadge";

function renderWithClient(
  el: ReactElement,
  seed?: (qc: QueryClient) => void,
): string {
  const qc = new QueryClient({
    // Hermetic: no retries, and any query we don't seed stays pending (no real
    // fetch is awaited by renderToStaticMarkup).
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  seed?.(qc);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, el),
  );
}

test("MediaGallery: does not throw when target_channels is missing", () => {
  assert.doesNotThrow(() => {
    renderWithClient(
      createElement(MediaGallery, {
        slug: "growth4u",
        ideaId: "IDEA-1",
        contentTaskId: "CT-1",
        // Prod condition: a ContentTask persisted without a target_channels
        // array (agent/MCP write, or pre-approval). Typed string[], undefined
        // at runtime.
        targetChannels: undefined as unknown as string[],
      }),
      // activeChannel falls back to "linkedin"; seed that draft as absent.
      (qc) => qc.setQueryData(["draft", "growth4u", "IDEA-1", "linkedin"], null),
    );
  });
});

test("MediaGallery: does not throw when draft.meta.media is a non-array", () => {
  // Legacy/hand-edited frontmatter: `media` is a single object, not an array.
  const legacyDraft = {
    meta: { media: { url: "x.png", role: "header" } },
  } as unknown as Draft;

  assert.doesNotThrow(() => {
    renderWithClient(
      createElement(MediaGallery, {
        slug: "growth4u",
        ideaId: "IDEA-1",
        contentTaskId: "CT-1",
        targetChannels: ["linkedin"],
      }),
      (qc) =>
        qc.setQueryData(["draft", "growth4u", "IDEA-1", "linkedin"], legacyDraft),
    );
  });
});

test("PostMetricsBadge: renders a dash instead of throwing on non-numeric engagement", () => {
  const html = renderWithClient(
    createElement(PostMetricsBadge, {
      slug: "growth4u",
      externalUrl: "https://example.com/post/1",
      // Frontmatter metrics present, but engagement_pct is not a number
      // (legacy/hand-edited draft). Pre-fix: `.toFixed(1)` threw.
      metrics: {
        impressions: 10,
        likes: 2,
        clicks: 1,
        engagement_pct: null,
        measured_at: "2026-07-01",
      } as unknown as PostMetricsSnapshot,
    }),
  );
  assert.match(html, /—/);
});
