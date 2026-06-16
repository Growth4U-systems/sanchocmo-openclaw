/**
 * request.ts — Pure resolver for an intake submission request (SAN-17).
 *
 * Verifies the token and validates the body WITHOUT touching the DB or fs.
 * Extracted so it is unit-testable in isolation (no Next/next-auth imports).
 */

import { verifyIntakeToken } from "@/lib/intake-tokens";
import {
  validateIntakeSubmission,
  IntakeValidationError,
  type NewIntakeSubmission,
} from "@/lib/intake/validate";

export interface ResolvedIntakeRequest {
  slug?: string;
  input?: NewIntakeSubmission;
  error?: { status: number; message: string };
}

export function resolveIntakeRequest(
  tokenStr: string | undefined,
  body: unknown,
): ResolvedIntakeRequest {
  if (!tokenStr) return { error: { status: 400, message: "Missing token" } };
  const payload = verifyIntakeToken(tokenStr);
  if (!payload) return { error: { status: 403, message: "Invalid token" } };
  try {
    const input = validateIntakeSubmission(body);
    return { slug: payload.slug, input };
  } catch (err) {
    if (err instanceof IntakeValidationError) {
      return { error: { status: 400, message: err.message } };
    }
    throw err;
  }
}
