import type {
  CapabilityCredentialProvider,
  DurableEffectErrorClassification,
} from "@/lib/durable-execution";
import {
  DurableJsonValidationError,
  parseDurableJsonContractValue,
} from "@/lib/durable-execution";
import {
  LEADS_APOLLO_CAPABILITY,
  LEADS_APOLLO_EFFECT_STEP,
  LEADS_SEARCH_MAX_RESULTS,
  leadsApolloPeopleSearchPayloadContractV2,
  leadsApolloPeopleSearchReceiptContractV2,
  parseLeadsSearchPersonV2,
  tenantFromLeadsApolloCredentialRef,
  type LeadsApolloPeopleSearchEffect,
  type LeadsApolloPeopleSearchReceiptV2,
  type LeadsSearchCriteriaV2,
  type LeadsSearchPersonV2,
} from "./search-contract-v2";

export const APOLLO_PEOPLE_SEARCH_URL =
  "https://api.apollo.io/api/v1/mixed_people/api_search" as const;
export const APOLLO_PEOPLE_SEARCH_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface ApolloPeopleSearchTransportInput {
  apiKey: string;
  criteria: LeadsSearchCriteriaV2;
  limit: number;
  page: 1;
  signal: AbortSignal;
}

export type ApolloPeopleSearchTransport = (
  input: ApolloPeopleSearchTransportInput,
) => Promise<unknown>;

export interface LeadsApolloBindingDependencies {
  transport?: ApolloPeopleSearchTransport;
  /** Frozen into the effect policy fingerprint by the worker composition root. */
  timeoutMs?: number;
}

export type LeadsApolloApiKeyResolver = (
  tenantKey: string,
) => string | Promise<string>;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function safeRequestId(value: string | null): string | undefined {
  const parsed = value?.trim() || "";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(parsed) ? parsed : undefined;
}

/** Safe provider error: response bodies and request credentials are never kept. */
export class ApolloProviderError extends Error {
  constructor(
    readonly code: "apollo_http_rejected" | "apollo_response_invalid",
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(
      `Apollo provider request failed (${status || "invalid_response"})${
        requestId ? ` request=${requestId}` : ""
      }`,
    );
    this.name = "ApolloProviderError";
  }
}

export class ApolloBindingError extends Error {
  readonly code = "apollo_binding_invalid" as const;

  constructor() {
    super("Apollo credential binding is unavailable");
    this.name = "ApolloBindingError";
  }
}

function appendArray(
  params: URLSearchParams,
  key: string,
  values: string[] | undefined,
): void {
  for (const value of values ?? []) params.append(`${key}[]`, value);
}

function apolloSearchParams(
  input: ApolloPeopleSearchTransportInput,
): URLSearchParams {
  const params = new URLSearchParams();
  if (input.criteria.query) params.set("q_keywords", input.criteria.query);
  appendArray(params, "person_titles", input.criteria.titles);
  appendArray(params, "person_seniorities", input.criteria.seniorities);
  appendArray(params, "person_locations", input.criteria.personLocations);
  appendArray(
    params,
    "organization_locations",
    input.criteria.organizationLocations,
  );
  appendArray(
    params,
    "q_organization_domains_list",
    input.criteria.organizationDomains,
  );
  appendArray(
    params,
    "organization_num_employees_ranges",
    input.criteria.employeeRanges,
  );
  appendArray(params, "contact_email_status", input.criteria.emailStatuses);
  params.set("page", String(input.page));
  params.set("per_page", String(input.limit));
  return params;
}

async function boundedApolloJsonResponse(
  response: Response,
  requestId?: string,
): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > APOLLO_PEOPLE_SEARCH_MAX_RESPONSE_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new ApolloProviderError(
      "apollo_response_invalid",
      response.status,
      requestId,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApolloProviderError(
      "apollo_response_invalid",
      response.status,
      requestId,
    );
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > APOLLO_PEOPLE_SEARCH_MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ApolloProviderError(
          "apollo_response_invalid",
          response.status,
          requestId,
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch (error) {
    if (error instanceof ApolloProviderError) throw error;
    throw new ApolloProviderError(
      "apollo_response_invalid",
      response.status,
      requestId,
    );
  }
}

export const defaultApolloPeopleSearchTransport: ApolloPeopleSearchTransport =
  async (input) => {
    const response = await fetch(
      `${APOLLO_PEOPLE_SEARCH_URL}?${apolloSearchParams(input).toString()}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "Cache-Control": "no-cache",
          "Content-Type": "application/json",
          "X-Api-Key": input.apiKey,
        },
        redirect: "error",
        signal: input.signal,
      },
    );
    const requestId = safeRequestId(
      response.headers.get("x-request-id") ??
        response.headers.get("request-id"),
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ApolloProviderError(
        "apollo_http_rejected",
        response.status,
        requestId,
      );
    }
    return boundedApolloJsonResponse(response, requestId);
  };

function safeProviderText(
  value: unknown,
  maxBytes: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = value.trim();
  if (!parsed || Buffer.byteLength(parsed, "utf8") > maxBytes) return undefined;
  return parsed;
}

function providerCandidate(value: unknown): LeadsSearchPersonV2 | null {
  const input = record(value);
  if (!input) return null;
  const providerId = safeProviderText(input.id, 64);
  const combinedName = [input.first_name, input.last_name]
    .map((part) => safeProviderText(part, 47))
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const name = safeProviderText(input.name, 96) || combinedName;
  if (!providerId || !name) return null;

  let candidate: LeadsSearchPersonV2;
  try {
    candidate = parseLeadsSearchPersonV2({ providerId, name });
  } catch {
    return null;
  }

  const organization = record(input.organization);
  const account = record(input.account);
  const optionalFields: Array<[keyof LeadsSearchPersonV2, string | undefined]> =
    [
      [
        "title",
        safeProviderText(input.title, 128) ||
          safeProviderText(input.headline, 128),
      ],
      ["linkedinUrl", safeProviderText(input.linkedin_url, 256)],
      [
        "organizationName",
        safeProviderText(organization?.name, 96) ||
          safeProviderText(input.organization_name, 96) ||
          safeProviderText(account?.name, 96),
      ],
      [
        "organizationDomain",
        safeProviderText(organization?.primary_domain, 253) ||
          safeProviderText(account?.primary_domain, 253),
      ],
    ];
  for (const [key, optionalValue] of optionalFields) {
    if (!optionalValue) continue;
    try {
      candidate = parseLeadsSearchPersonV2({
        ...candidate,
        [key]: optionalValue,
      });
    } catch {
      // A malformed optional provider field cannot poison an otherwise stable row.
    }
  }
  return candidate;
}

function safeTotalAvailable(value: unknown, returned: number): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < returned
  ) {
    return null;
  }
  return value;
}

function compactApolloReceipt(
  raw: unknown,
  limit: number,
): LeadsApolloPeopleSearchReceiptV2 {
  const root = record(raw);
  if (!root) {
    throw new ApolloProviderError("apollo_response_invalid", 0);
  }
  const people = Array.isArray(root.people)
    ? root.people
    : Array.isArray(root.contacts)
      ? root.contacts
      : null;
  if (!people) {
    throw new ApolloProviderError("apollo_response_invalid", 0);
  }

  const candidates: LeadsSearchPersonV2[] = [];
  const seen = new Set<string>();
  for (const row of people) {
    const candidate = providerCandidate(row);
    if (!candidate || seen.has(candidate.providerId)) continue;
    seen.add(candidate.providerId);
    candidates.push(candidate);
    if (candidates.length >= Math.min(limit, LEADS_SEARCH_MAX_RESULTS)) break;
  }

  const pagination = record(root.pagination);
  const totalAvailable = safeTotalAvailable(
    pagination?.total_entries,
    candidates.length,
  );
  const providerRowsOnPage = Math.min(people.length, limit);
  const hasMore =
    people.length > limit ||
    (totalAvailable === null
      ? people.length >= limit
      : totalAvailable > providerRowsOnPage);
  const receipt: LeadsApolloPeopleSearchReceiptV2 = {
    provider: "apollo",
    candidates,
    totalAvailable,
    returned: candidates.length,
    page: 1,
    nextPage: hasMore ? 2 : null,
    hasMore,
  };
  return parseDurableJsonContractValue(
    leadsApolloPeopleSearchReceiptContractV2,
    receipt,
    "effect_receipt",
  ).value;
}

function statusFromError(error: unknown): number {
  if (!error || typeof error !== "object" || !("status" in error)) return 0;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) ? status : 0;
}

export function classifyLeadsApolloSearchError(
  error: unknown,
): DurableEffectErrorClassification {
  if (error instanceof ApolloBindingError) {
    return {
      kind: "definitive_rejection",
      code: "apollo_search_binding_invalid",
      retryable: false,
    };
  }
  if (error instanceof DurableJsonValidationError) {
    return {
      kind: "definitive_rejection",
      code: "apollo_search_receipt_invalid",
      retryable: false,
    };
  }
  if (
    error instanceof ApolloProviderError &&
    error.code === "apollo_response_invalid"
  ) {
    return {
      kind: "definitive_rejection",
      code: "apollo_search_response_invalid",
      retryable: true,
    };
  }
  const status = statusFromError(error);
  if (
    status === 408 ||
    status === 424 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  ) {
    return {
      kind: "definitive_rejection",
      code: "apollo_search_provider_unavailable",
      retryable: true,
    };
  }
  if (status >= 400) {
    return {
      kind: "definitive_rejection",
      code: "apollo_search_request_rejected",
      retryable: false,
    };
  }
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    error instanceof TypeError
  ) {
    return {
      kind: "outcome_unknown",
      code: "apollo_search_outcome_unknown",
    };
  }
  return {
    kind: "outcome_unknown",
    code: "apollo_search_outcome_unknown",
  };
}

function requiredApiKey(credentials: Readonly<Record<string, string>>): string {
  const apiKey = credentials.apiKey?.trim();
  if (!apiKey || Buffer.byteLength(apiKey, "utf8") > 16 * 1024) {
    throw new ApolloBindingError();
  }
  return apiKey;
}

function boundedTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? 30_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 120_000
  ) {
    throw new RangeError(
      "Apollo search timeout must be between 1000 and 120000 ms",
    );
  }
  return timeoutMs;
}

export function createLeadsApolloPeopleSearchEffect(
  dependencies: LeadsApolloBindingDependencies = {},
): LeadsApolloPeopleSearchEffect {
  const transport =
    dependencies.transport ?? defaultApolloPeopleSearchTransport;
  const timeoutMs = boundedTimeoutMs(dependencies.timeoutMs);
  return {
    step: LEADS_APOLLO_EFFECT_STEP,
    definitionVersion: 1,
    capability: LEADS_APOLLO_CAPABILITY,
    payload: leadsApolloPeopleSearchPayloadContractV2,
    receipt: leadsApolloPeopleSearchReceiptContractV2,
    safety: { kind: "read_only", retry: "bounded" },
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      jitter: "full",
    },
    timeoutMs,
    async invoke(payload, context) {
      const tenantKey = tenantFromLeadsApolloCredentialRef(
        payload.credentialRef,
      );
      if (tenantKey !== context.tenantKey) throw new ApolloBindingError();
      const credentials = await context.credentials.resolve(
        payload.credentialRef,
      );
      if (credentials.tenantKey && credentials.tenantKey !== tenantKey) {
        throw new ApolloBindingError();
      }
      const raw = await transport({
        apiKey: requiredApiKey(credentials),
        criteria: payload.criteria,
        limit: payload.limit,
        page: 1,
        signal: context.signal,
      });
      return compactApolloReceipt(raw, payload.limit);
    },
    classify: classifyLeadsApolloSearchError,
  };
}

export function createLeadsApolloCredentialProvider(
  resolveApiKey: LeadsApolloApiKeyResolver,
): CapabilityCredentialProvider {
  return {
    async resolve(credentialRef) {
      const tenantKey = tenantFromLeadsApolloCredentialRef(credentialRef);
      let apiKey: string;
      try {
        apiKey = (await resolveApiKey(tenantKey)).trim();
      } catch {
        throw new ApolloBindingError();
      }
      if (!apiKey || Buffer.byteLength(apiKey, "utf8") > 16 * 1024) {
        throw new ApolloBindingError();
      }
      return Object.freeze({ tenantKey, apiKey });
    },
  };
}
