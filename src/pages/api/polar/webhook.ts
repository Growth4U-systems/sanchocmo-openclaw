import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/db/drizzle";
import { subscription } from "@/db/schema";

/**
 * POST /api/polar/webhook
 * Handles Polar subscription lifecycle webhooks.
 * Verify via POLAR_WEBHOOK_SECRET.
 */

export const config = {
  api: { bodyParser: true },
};

function safeParseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify webhook secret via header
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers["x-polar-signature"] as string;
    if (!signature || signature !== webhookSecret) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  }

  const { type, data } = req.body;

  const subscriptionEvents = [
    "subscription.created",
    "subscription.active",
    "subscription.canceled",
    "subscription.revoked",
    "subscription.uncanceled",
    "subscription.updated",
  ];

  if (!subscriptionEvents.includes(type)) {
    // Acknowledge but don't process
    return res.json({ received: true });
  }

  try {
    const userId = data.customer?.externalId || null;

    const subscriptionData = {
      id: data.id,
      createdAt: new Date(data.createdAt),
      modifiedAt: safeParseDate(data.modifiedAt),
      amount: data.amount,
      currency: data.currency,
      recurringInterval: data.recurringInterval,
      status: data.status,
      currentPeriodStart: safeParseDate(data.currentPeriodStart) || new Date(),
      currentPeriodEnd: safeParseDate(data.currentPeriodEnd) || new Date(),
      cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
      canceledAt: safeParseDate(data.canceledAt),
      startedAt: safeParseDate(data.startedAt) || new Date(),
      endsAt: safeParseDate(data.endsAt),
      endedAt: safeParseDate(data.endedAt),
      customerId: data.customerId,
      productId: data.productId,
      discountId: data.discountId || null,
      checkoutId: data.checkoutId || "",
      customerCancellationReason: data.customerCancellationReason || null,
      customerCancellationComment: data.customerCancellationComment || null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      customFieldData: data.customFieldData
        ? JSON.stringify(data.customFieldData)
        : null,
      userId: userId as string | null,
    };

    await db
      .insert(subscription)
      .values(subscriptionData)
      .onConflictDoUpdate({
        target: subscription.id,
        set: {
          modifiedAt: subscriptionData.modifiedAt || new Date(),
          amount: subscriptionData.amount,
          currency: subscriptionData.currency,
          recurringInterval: subscriptionData.recurringInterval,
          status: subscriptionData.status,
          currentPeriodStart: subscriptionData.currentPeriodStart,
          currentPeriodEnd: subscriptionData.currentPeriodEnd,
          cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
          canceledAt: subscriptionData.canceledAt,
          startedAt: subscriptionData.startedAt,
          endsAt: subscriptionData.endsAt,
          endedAt: subscriptionData.endedAt,
          customerId: subscriptionData.customerId,
          productId: subscriptionData.productId,
          discountId: subscriptionData.discountId,
          checkoutId: subscriptionData.checkoutId,
          customerCancellationReason:
            subscriptionData.customerCancellationReason,
          customerCancellationComment:
            subscriptionData.customerCancellationComment,
          metadata: subscriptionData.metadata,
          customFieldData: subscriptionData.customFieldData,
          userId: subscriptionData.userId,
        },
      });

    console.log(`[Polar Webhook] Upserted subscription ${data.id} (${type})`);
    return res.json({ received: true });
  } catch (error) {
    console.error("[Polar Webhook] Error:", error);
    // Return 200 to avoid retries
    return res.json({ received: true, error: "Processing failed" });
  }
}
