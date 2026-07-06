import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import type { SubscriptionDetailsResult } from "@/lib/subscription";

export default function PaymentPage() {
  const { status } = useSession();
  const [loading, setLoading] = useState(false);

  const { data: subDetails, isLoading } = useQuery<SubscriptionDetailsResult>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const res = await fetch("/api/polar/subscription");
      if (!res.ok) return { hasSubscription: false };
      return res.json();
    },
    enabled: status === "authenticated",
  });

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

  const sub = subDetails?.subscription;
  const hasActive = subDetails?.hasSubscription && sub?.status === "active";

  return (
    <DashboardLayout>
      <Head>
        <title>Payment — Mission Control</title>
      </Head>

      <h1 className="font-heading text-2xl text-navy mb-1">Payment</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your subscription and billing.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !hasActive ? (
        <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic text-center max-w-md">
          <h2 className="font-heading text-xl text-navy mb-2">
            No Active Subscription
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Subscribe to access premium features.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-6 py-2 bg-rust text-white rounded-lg font-semibold text-sm hover:opacity-90 border-2 border-ink shadow-comic-sm"
          >
            View Plans
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border-[3px] border-ink bg-card p-6 shadow-comic max-w-lg">
          <h2 className="font-heading text-lg text-navy mb-4">
            Subscription Details
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-muted-foreground font-semibold">Status</p>
              <p className="capitalize">{sub!.status}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-semibold">Amount</p>
              <p>
                {sub!.amount / 100} {sub!.currency.toUpperCase()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground font-semibold">
                Billing Interval
              </p>
              <p className="capitalize">{sub!.recurringInterval}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-semibold">
                Current Period End
              </p>
              <p>
                {new Date(sub!.currentPeriodEnd).toLocaleDateString()}
              </p>
            </div>
          </div>

          {sub!.cancelAtPeriodEnd && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-sm text-yellow-800">
              Your subscription will cancel at the end of the current billing
              period.
            </div>
          )}

          <button
            onClick={handleManageSubscription}
            disabled={loading}
            className="px-4 py-2 border-2 border-ink rounded-lg font-semibold text-sm hover:bg-background transition-colors disabled:opacity-50"
          >
            Manage Subscription
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}
