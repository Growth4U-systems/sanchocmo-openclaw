import crypto from "crypto";

// Slack signs every request to your interactivity/events endpoint.
// Verify per https://api.slack.com/authentication/verifying-requests-from-slack
//
// Slack sends:
//   X-Slack-Request-Timestamp: <unix-timestamp>
//   X-Slack-Signature:         v0=<hex-hmac-sha256>
//
// We HMAC `v0:<timestamp>:<raw body>` with SLACK_SIGNING_SECRET and compare.

const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5; // 5 minutes (Slack recommendation)

export interface SlackSignatureCheck {
  valid: boolean;
  reason?: string;
}

export function verifySlackSignature(params: {
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
}): SlackSignatureCheck {
  const { timestamp, signature, rawBody } = params;
  const secret = process.env.SLACK_SIGNING_SECRET;

  if (!secret) return { valid: false, reason: "SLACK_SIGNING_SECRET not set" };
  if (!timestamp) return { valid: false, reason: "missing timestamp" };
  if (!signature) return { valid: false, reason: "missing signature" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { valid: false, reason: "bad timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { valid: false, reason: "stale request" };
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", secret).update(baseString).digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { valid: false, reason: "length mismatch" };
  if (!crypto.timingSafeEqual(a, b)) return { valid: false, reason: "signature mismatch" };

  return { valid: true };
}
