"use client";

// /setup — first-run onboarding checklist.
//
// A standalone (no DashboardLayout chrome) page that reads GET /api/setup/status
// and shows what's still needed to use SanchoCMO. Writes reuse existing
// endpoints: the first-brand form posts to /api/clients/create, and the
// "missing" rows deep-link into the admin settings panels. Standalone so it
// renders cleanly on a fresh box and degrades to a sign-in prompt on 403.
import { useState, type ReactNode } from "react";
import Head from "next/head";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { StatusPill } from "@/components/shared/status-pill";

interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  ok: boolean;
  detail?: string;
  action?: { label: string; href: string };
}
interface SetupStatus {
  ready: boolean;
  required: ChecklistItem[];
  optional: ChecklistItem[];
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");

function Row({ item, children }: { item: ChecklistItem; children?: ReactNode }) {
  const status = item.ok ? "completed" : item.required ? "blocked" : "pending";
  const label = item.ok ? "Done" : item.required ? "Needs setup" : "Optional";
  return (
    <div className="flex flex-col gap-2 border-b border-ink/20 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading">{item.label}</p>
          {item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={status} labelOverride={label} />
          {!item.ok && item.action && (
            <Link
              href={item.action.href}
              className="rounded-md border-[2px] border-ink px-3 py-1 text-sm font-heading shadow-comic-sm hover:bg-muted"
            >
              {item.action.label}
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function SetupPage() {
  const qc = useQueryClient();
  const [brandName, setBrandName] = useState("");
  const [brandErr, setBrandErr] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<SetupStatus, Error>({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const res = await fetch("/api/setup/status");
      if (res.status === 403) throw new Error("forbidden");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createBrand = useMutation({
    mutationFn: async (name: string) => {
      const slug = slugify(name);
      if (!slug) throw new Error("Enter a brand name with at least one letter or number.");
      const res = await fetch("/api/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json;
    },
    onSuccess: () => {
      setBrandName("");
      setBrandErr(null);
      qc.invalidateQueries({ queryKey: ["setup-status"] });
    },
    onError: (e: Error) => setBrandErr(e.message),
  });

  const forbidden = error?.message === "forbidden";

  return (
    <>
      <Head>
        <title>Setup — SanchoCMO</title>
      </Head>
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="mb-1 font-heading text-2xl">SanchoCMO setup</h1>
          <p className="mb-6 text-muted-foreground">
            Finish connecting the essentials, then head into Mission Control.
          </p>

          {isLoading && (
            <ComicCard>
              <p className="text-sm text-muted-foreground">Checking your setup…</p>
            </ComicCard>
          )}

          {forbidden && (
            <ComicCard>
              <p className="mb-2 font-heading">Sign in as admin to continue</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Paste the admin access token the setup wizard printed into the
                &ldquo;Access Token&rdquo; field on the sign-in page.
              </p>
              <Link
                href="/auth/signin"
                className="inline-block rounded-md border-[2px] border-ink px-4 py-2 font-heading shadow-comic-sm hover:bg-muted"
              >
                Go to sign in
              </Link>
            </ComicCard>
          )}

          {error && !forbidden && (
            <ComicCard>
              <p className="mb-3 text-sm text-muted-foreground">
                Couldn&rsquo;t load setup status: {error.message}
              </p>
              <button
                onClick={() => refetch()}
                className="rounded-md border-[2px] border-ink px-4 py-2 font-heading shadow-comic-sm hover:bg-muted"
              >
                Retry
              </button>
            </ComicCard>
          )}

          {data && (
            <div className="flex flex-col gap-5">
              <ComicCard>
                {data.ready ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="font-heading text-lg">You&rsquo;re all set 🎉</p>
                    <p className="text-sm text-muted-foreground">
                      Everything required is configured. Optional integrations
                      can be added any time.
                    </p>
                    <Link
                      href="/dashboard"
                      className="rounded-md border-[3px] border-ink bg-rust px-4 py-2 font-heading text-navy shadow-comic hover:brightness-95"
                    >
                      Open Mission Control →
                    </Link>
                  </div>
                ) : (
                  <p className="font-heading">
                    Almost there — finish the required steps below.
                  </p>
                )}
              </ComicCard>

              <ComicCard>
                <h2 className="mb-2 font-heading text-lg">Required</h2>
                {data.required.map((item) => (
                  <Row key={item.id} item={item}>
                    {item.id === "first_brand" && !item.ok && (
                      <form
                        className="mt-1 flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          createBrand.mutate(brandName);
                        }}
                      >
                        <input
                          value={brandName}
                          onChange={(e) => setBrandName(e.target.value)}
                          placeholder="Brand name (e.g. Acme Inc)"
                          className="flex-1 rounded-md border-[2px] border-ink px-3 py-1.5 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={createBrand.isPending || !brandName.trim()}
                          className="rounded-md border-[2px] border-ink px-3 py-1.5 text-sm font-heading shadow-comic-sm hover:bg-muted disabled:opacity-50"
                        >
                          {createBrand.isPending ? "Creating…" : "Create brand"}
                        </button>
                        {brandName.trim() && (
                          <span className="text-xs text-muted-foreground">
                            slug: {slugify(brandName) || "—"}
                          </span>
                        )}
                        {brandErr && (
                          <span className="w-full text-xs text-red-600">{brandErr}</span>
                        )}
                      </form>
                    )}
                  </Row>
                ))}
              </ComicCard>

              <ComicCard>
                <h2 className="mb-2 font-heading text-lg">Optional integrations</h2>
                {data.optional.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </ComicCard>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
