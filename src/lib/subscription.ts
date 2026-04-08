import { db } from "@/db/drizzle";
import { subscription } from "@/db/schema";
import { eq } from "drizzle-orm";

export type SubscriptionDetails = {
  id: string;
  productId: string;
  status: string;
  amount: number;
  currency: string;
  recurringInterval: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
};

export type SubscriptionDetailsResult = {
  hasSubscription: boolean;
  subscription?: SubscriptionDetails;
  error?: string;
  errorType?: "CANCELED" | "EXPIRED" | "GENERAL";
};

/**
 * Get subscription details for a given userId.
 * Designed for Pages Router — caller passes userId explicitly.
 */
export async function getSubscriptionDetails(
  userId: string
): Promise<SubscriptionDetailsResult> {
  try {
    const userSubscriptions = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId));

    if (!userSubscriptions.length) {
      return { hasSubscription: false };
    }

    const activeSubscription = userSubscriptions
      .filter((sub) => sub.status === "active")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

    if (!activeSubscription) {
      const latestSubscription = userSubscriptions.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      if (latestSubscription) {
        const now = new Date();
        const isExpired =
          new Date(latestSubscription.currentPeriodEnd) < now;
        const isCanceled = latestSubscription.status === "canceled";

        return {
          hasSubscription: true,
          subscription: {
            id: latestSubscription.id,
            productId: latestSubscription.productId,
            status: latestSubscription.status,
            amount: latestSubscription.amount,
            currency: latestSubscription.currency,
            recurringInterval: latestSubscription.recurringInterval,
            currentPeriodStart: latestSubscription.currentPeriodStart,
            currentPeriodEnd: latestSubscription.currentPeriodEnd,
            cancelAtPeriodEnd: latestSubscription.cancelAtPeriodEnd,
            canceledAt: latestSubscription.canceledAt,
          },
          error: isCanceled
            ? "Subscription has been canceled"
            : isExpired
              ? "Subscription has expired"
              : "Subscription is not active",
          errorType: isCanceled ? "CANCELED" : isExpired ? "EXPIRED" : "GENERAL",
        };
      }

      return { hasSubscription: false };
    }

    return {
      hasSubscription: true,
      subscription: {
        id: activeSubscription.id,
        productId: activeSubscription.productId,
        status: activeSubscription.status,
        amount: activeSubscription.amount,
        currency: activeSubscription.currency,
        recurringInterval: activeSubscription.recurringInterval,
        currentPeriodStart: activeSubscription.currentPeriodStart,
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
        canceledAt: activeSubscription.canceledAt,
      },
    };
  } catch (error) {
    console.error("Error fetching subscription details:", error);
    return {
      hasSubscription: false,
      error: "Failed to load subscription details",
      errorType: "GENERAL",
    };
  }
}

export async function isUserSubscribed(userId: string): Promise<boolean> {
  const result = await getSubscriptionDetails(userId);
  return result.hasSubscription && result.subscription?.status === "active";
}

export async function getUserSubscriptionStatus(
  userId: string
): Promise<"active" | "canceled" | "expired" | "none"> {
  const result = await getSubscriptionDetails(userId);

  if (!result.hasSubscription) return "none";
  if (result.subscription?.status === "active") return "active";
  if (result.errorType === "CANCELED") return "canceled";
  if (result.errorType === "EXPIRED") return "expired";
  return "none";
}
