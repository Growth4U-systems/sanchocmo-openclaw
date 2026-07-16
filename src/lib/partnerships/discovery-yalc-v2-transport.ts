import { YalcClientError, type YalcRuntimeConfig } from "@/lib/yalc/client";
import { canonicalPartnershipsTargetOrigin } from "./discovery-handler-v2";

export const PARTNERSHIPS_YALC_ASSIGN_V2_PATH_PREFIX =
  "/api/campaigns" as const;

export interface PartnershipsYalcV2Response {
  status: number;
  contractFingerprint: string;
  body: unknown;
}

/**
 * Target-bound JSON transport for contract-v2 Partnerships capabilities.
 * Redirects are errors: following one would move credentials/effects outside
 * the origin whose fingerprint was frozen at admission.
 */
export async function partnershipsYalcV2Fetch(
  config: YalcRuntimeConfig,
  path: string,
  init: {
    method: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    signal: AbortSignal;
    expectedContractFingerprint: string;
  },
): Promise<PartnershipsYalcV2Response> {
  const origin = canonicalPartnershipsTargetOrigin(config.baseUrl);
  if (!path.startsWith("/api/")) throw new Error("invalid Yalc v2 path");
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("cross-origin Yalc v2 request");
  if (config.slug) url.searchParams.set("tenant", config.slug);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init.headers,
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    redirect: "error",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  const contractFingerprint =
    response.headers.get("Yalc-Contract-Fingerprint")?.trim() ?? "";
  if (contractFingerprint !== init.expectedContractFingerprint) {
    throw new YalcClientError(
      "Yalc contract fingerprint does not match the admitted capability",
      502,
      { code: "YALC_CONTRACT_FINGERPRINT_MISMATCH" },
    );
  }
  if (!response.ok) {
    const record =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record.error === "string"
          ? record.error
          : `YALC ${response.status} ${response.statusText}`;
    throw new YalcClientError(message, response.status, payload);
  }
  return {
    status: response.status,
    contractFingerprint,
    body: payload,
  };
}
