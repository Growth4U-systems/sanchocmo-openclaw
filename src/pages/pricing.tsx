import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SubscriptionDetailsResult } from "@/lib/subscription";

export default function PricingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);

  const { data: subDetails } = useQuery<SubscriptionDetailsResult>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const res = await fetch("/api/polar/subscription");
      if (!res.ok) return { hasSubscription: false };
      return res.json();
    },
    enabled: status === "authenticated",
  });

  const STARTER_TIER = process.env.NEXT_PUBLIC_STARTER_TIER || "";
  const isCurrentPlan =
    subDetails?.hasSubscription &&
    subDetails.subscription?.productId === STARTER_TIER &&
    subDetails.subscription?.status === "active";

  async function handleCheckout() {
    if (status !== "authenticated") {
      router.push("/auth/signin?returnTo=/pricing");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/polar/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: STARTER_TIER }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleManageSubscription() {
    setLoading(true);
    try {
      const res = await fetch("/api/polar/portal", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Pricing — Mission Control</title>
      </Head>
      <main className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <h1 className="font-heading text-4xl text-navy mb-4">
            SanchoCMO Plans
          </h1>
          <p className="text-lg text-muted-foreground">
            Choose the plan that fits your business.
          </p>
        </div>

        <div className="max-w-md w-full">
          <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic relative">
            {isCurrentPlan && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full border border-green-300">
                Current Plan
              </span>
            )}

            <h2 className="font-heading text-2xl text-navy mb-1">Starter</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Perfect for getting started
            </p>
            <div className="mb-6">
              <span className="text-4xl font-bold text-rust">$1,000</span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <ul className="space-y-2 mb-6 text-sm">
              {["5 Projects", "10GB Storage", "1 Team Member", "Email Support"].map(
                (f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-green-500">&#10003;</span> {f}
                  </li>
                )
              )}
            </ul>

            {isCurrentPlan ? (
              <div className="space-y-2">
                <button
                  onClick={handleManageSubscription}
                  disabled={loading}
                  className="w-full px-4 py-2 border-2 border-ink rounded-lg font-semibold text-sm hover:bg-background transition-colors disabled:opacity-50"
                >
                  Manage Subscription
                </button>
                {subDetails?.subscription && (
                  <p className="text-xs text-muted-foreground text-center">
                    {subDetails.subscription.cancelAtPeriodEnd
                      ? `Expires ${new Date(subDetails.subscription.currentPeriodEnd).toLocaleDateString()}`
                      : `Renews ${new Date(subDetails.subscription.currentPeriodEnd).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full px-4 py-3 bg-rust text-white rounded-lg font-semibold text-sm hover:opacity-90 border-2 border-ink shadow-comic-sm disabled:opacity-50"
              >
                {status !== "authenticated"
                  ? "Sign In to Get Started"
                  : "Get Started"}
              </button>
            )}
          </div>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Need a custom plan?{" "}
          <Link href="mailto:hello@growth4u.io" className="text-rust hover:underline">
            Contact us
          </Link>
        </p>
      </main>
    </>
  );
}
