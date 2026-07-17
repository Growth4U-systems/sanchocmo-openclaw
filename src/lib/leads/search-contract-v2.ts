import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  type DurableEffectDefinition,
  type DurableEffectMap,
  type DurableExecutionHandlerV2,
  type DurableExecutionTerminalProjectionContext,
  type DurableJson,
  type DurableJsonBounds,
  type DurableJsonContract,
  type DurableJsonObject,
} from "@/lib/durable-execution";
import type { ExecutionRun } from "@/lib/execution-control";

export const LEADS_SEARCH_OPERATION = "leads.search" as const;
export const LEADS_SEARCH_HANDLER_VERSION = 1 as const;
export const LEADS_SEARCH_AGGREGATE_TYPE = "lead_search" as const;
export const LEADS_SEARCH_MAX_RESULTS = 10 as const;
export const LEADS_APOLLO_EFFECT_STEP = "apollo.people.search" as const;
export const LEADS_APOLLO_CAPABILITY = "apollo.people.search" as const;
export const LEADS_APOLLO_CREDENTIAL_REF_PATTERN =
  /^apollo:\/\/tenant\/[a-z0-9][a-z0-9-]{0,119}$/;

const COMMAND_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 8 * 1024,
  maxDepth: 5,
  maxNodes: 128,
  maxStringBytes: 500,
  maxArrayItems: 10,
  maxObjectKeys: 10,
});

/** The persisted provider receipt must remain below Ledger's 16 KiB ceiling. */
const RECEIPT_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 16 * 1024,
  maxDepth: 5,
  maxNodes: 96,
  maxStringBytes: 512,
  maxArrayItems: LEADS_SEARCH_MAX_RESULTS,
  maxObjectKeys: 10,
});

const CRITERIA_KEYS = [
  "query",
  "titles",
  "seniorities",
  "personLocations",
  "organizationLocations",
  "organizationDomains",
  "employeeRanges",
  "emailStatuses",
] as const;

const RECEIPT_KEYS = [
  "provider",
  "candidates",
  "totalAvailable",
  "returned",
  "page",
  "nextPage",
  "hasMore",
] as const;

const CANDIDATE_KEYS = [
  "providerId",
  "name",
  "title",
  "linkedinUrl",
  "organizationName",
  "organizationDomain",
] as const;

const APOLLO_PERSON_SENIORITIES = new Set([
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
]);

const APOLLO_EMAIL_STATUSES = new Set([
  "verified",
  "unverified",
  "likely to engage",
  "unavailable",
]);

export type LeadsSearchCriteriaV2 = DurableJsonObject & {
  query?: string;
  titles?: string[];
  seniorities?: string[];
  personLocations?: string[];
  organizationLocations?: string[];
  organizationDomains?: string[];
  employeeRanges?: string[];
  emailStatuses?: string[];
};

export interface LeadsSearchCommandV2 extends DurableJsonObject {
  schemaVersion: 1;
  slug: string;
  credentialRef: string;
  criteria: LeadsSearchCriteriaV2;
  limit: number;
}

export interface LeadsApolloPeopleSearchPayloadV2 extends DurableJsonObject {
  credentialRef: string;
  criteria: LeadsSearchCriteriaV2;
  limit: number;
  page: 1;
}

export type LeadsSearchPersonV2 = DurableJsonObject & {
  providerId: string;
  name: string;
  title?: string;
  linkedinUrl?: string;
  organizationName?: string;
  organizationDomain?: string;
};

export interface LeadsApolloPeopleSearchReceiptV2 extends DurableJsonObject {
  provider: "apollo";
  candidates: LeadsSearchPersonV2[];
  totalAvailable: number | null;
  returned: number;
  page: 1;
  nextPage: 2 | null;
  hasMore: boolean;
}

export interface LeadsSearchCheckpointV2 extends DurableJsonObject {
  stage: "search_completed";
  receipt: LeadsApolloPeopleSearchReceiptV2;
}

export interface LeadsSearchResultV2 extends DurableJsonObject {
  completionBoundary: "search_completed";
  provider: "apollo";
  candidates: LeadsSearchPersonV2[];
  totalAvailable: number | null;
  returned: number;
  page: 1;
  nextPage: 2 | null;
  hasMore: boolean;
}

export type LeadsApolloPeopleSearchEffect = DurableEffectDefinition<
  LeadsApolloPeopleSearchPayloadV2,
  LeadsApolloPeopleSearchReceiptV2
>;

type LeadsSearchEffectsV2 = DurableEffectMap & {
  [LEADS_APOLLO_EFFECT_STEP]: LeadsApolloPeopleSearchEffect;
};

export type LeadsSearchTerminalProjector = (
  run: ExecutionRun,
  command: LeadsSearchCommandV2,
  context: DurableExecutionTerminalProjectionContext,
) => Promise<void> | void;

export interface LeadsSearchHandlerDependencies {
  projectTerminal?: LeadsSearchTerminalProjector;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("object required");
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowlist = new Set(allowed);
  if (Object.keys(input).some((key) => !allowlist.has(key))) {
    throw new Error("unknown property");
  }
}

function assertExactKeys(
  input: Record<string, unknown>,
  expected: readonly string[],
): void {
  const expectedKeys = new Set(expected);
  const actual = Object.keys(input);
  if (
    actual.length !== expected.length ||
    actual.some((key) => !expectedKeys.has(key))
  ) {
    throw new Error("unexpected object shape");
  }
}

function boundedText(
  value: unknown,
  options: { maxBytes: number; pattern?: RegExp },
): string {
  if (typeof value !== "string") throw new Error("string required");
  const parsed = value.trim();
  if (
    !parsed ||
    Buffer.byteLength(parsed, "utf8") > options.maxBytes ||
    /[\u0000-\u001f\u007f]/.test(parsed) ||
    (options.pattern && !options.pattern.test(parsed))
  ) {
    throw new Error("invalid string");
  }
  return parsed;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error("invalid integer");
  }
  return value;
}

function canonicalDomain(value: unknown): string {
  const domain = boundedText(value, { maxBytes: 253 })
    .toLowerCase()
    .replace(/\.$/, "");
  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    throw new Error("invalid domain");
  }
  return domain;
}

function canonicalLinkedinUrl(value: unknown): string {
  const raw = boundedText(value, { maxBytes: 256 });
  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com"))
  ) {
    throw new Error("invalid LinkedIn URL");
  }
  url.hostname = hostname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function boundedUniqueList(
  value: unknown,
  options: {
    maxBytes: number;
    normalize?: (item: unknown) => string;
  },
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > LEADS_SEARCH_MAX_RESULTS
  ) {
    throw new Error("bounded string list required");
  }
  const result = value.map((item) => {
    const parsed = options.normalize
      ? options.normalize(item)
      : boundedText(item, { maxBytes: options.maxBytes });
    return parsed;
  });
  const identities = result.map((item) => item.toLowerCase());
  if (new Set(identities).size !== identities.length) {
    throw new Error("unique string list required");
  }
  return result;
}

function canonicalEmployeeRange(value: unknown): string {
  const raw = boundedText(value, {
    maxBytes: 32,
    pattern: /^\d{1,8},\d{1,8}$/,
  });
  const [minimum, maximum] = raw.split(",").map(Number);
  if (
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    minimum < 0 ||
    maximum < 1 ||
    minimum > maximum
  ) {
    throw new Error("invalid employee range");
  }
  return `${minimum},${maximum}`;
}

function canonicalApolloEnum(
  value: unknown,
  allowed: ReadonlySet<string>,
): string {
  const parsed = boundedText(value, { maxBytes: 48 }).toLowerCase();
  if (!allowed.has(parsed)) throw new Error("unsupported Apollo filter value");
  return parsed;
}

export function parseLeadsSearchCriteriaV2(
  value: unknown,
): LeadsSearchCriteriaV2 {
  const input = record(value);
  assertOnlyKeys(input, CRITERIA_KEYS);
  const output: LeadsSearchCriteriaV2 = {};

  if (input.query !== undefined) {
    output.query = boundedText(input.query, { maxBytes: 500 });
  }
  if (input.titles !== undefined) {
    output.titles = boundedUniqueList(input.titles, { maxBytes: 160 });
  }
  if (input.seniorities !== undefined) {
    output.seniorities = boundedUniqueList(input.seniorities, {
      maxBytes: 48,
      normalize: (value) =>
        canonicalApolloEnum(value, APOLLO_PERSON_SENIORITIES),
    });
  }
  if (input.personLocations !== undefined) {
    output.personLocations = boundedUniqueList(input.personLocations, {
      maxBytes: 160,
    });
  }
  if (input.organizationLocations !== undefined) {
    output.organizationLocations = boundedUniqueList(
      input.organizationLocations,
      { maxBytes: 160 },
    );
  }
  if (input.organizationDomains !== undefined) {
    output.organizationDomains = boundedUniqueList(input.organizationDomains, {
      maxBytes: 253,
      normalize: canonicalDomain,
    });
  }
  if (input.employeeRanges !== undefined) {
    output.employeeRanges = boundedUniqueList(input.employeeRanges, {
      maxBytes: 32,
      normalize: canonicalEmployeeRange,
    });
  }
  if (input.emailStatuses !== undefined) {
    output.emailStatuses = boundedUniqueList(input.emailStatuses, {
      maxBytes: 48,
      normalize: (value) => canonicalApolloEnum(value, APOLLO_EMAIL_STATUSES),
    });
  }
  if (Object.keys(output).length === 0) {
    throw new Error("at least one search criterion is required");
  }
  return output;
}

function parseCredentialRef(value: unknown): string {
  return boundedText(value, {
    maxBytes: 160,
    pattern: LEADS_APOLLO_CREDENTIAL_REF_PATTERN,
  });
}

export function tenantFromLeadsApolloCredentialRef(
  credentialRef: string,
): string {
  const parsed = parseCredentialRef(credentialRef);
  return parsed.slice("apollo://tenant/".length);
}

export function parseLeadsSearchCommandV2(
  value: unknown,
): LeadsSearchCommandV2 {
  const input = record(value);
  assertExactKeys(input, [
    "schemaVersion",
    "slug",
    "credentialRef",
    "criteria",
    "limit",
  ]);
  if (input.schemaVersion !== 1) {
    throw new Error("unsupported search command schema");
  }
  const slug = boundedText(input.slug, {
    maxBytes: 120,
    pattern: /^[a-z0-9][a-z0-9-]{0,119}$/,
  });
  const credentialRef = parseCredentialRef(input.credentialRef);
  if (credentialRef !== `apollo://tenant/${slug}`) {
    throw new Error("cross-tenant credential reference");
  }
  return {
    schemaVersion: 1,
    slug,
    credentialRef,
    criteria: parseLeadsSearchCriteriaV2(input.criteria),
    limit: boundedInteger(input.limit, 1, LEADS_SEARCH_MAX_RESULTS),
  };
}

export function parseLeadsApolloPeopleSearchPayloadV2(
  value: unknown,
): LeadsApolloPeopleSearchPayloadV2 {
  const input = record(value);
  assertExactKeys(input, ["credentialRef", "criteria", "limit", "page"]);
  if (input.page !== 1)
    throw new Error("only the first Apollo page is allowed");
  return {
    credentialRef: parseCredentialRef(input.credentialRef),
    criteria: parseLeadsSearchCriteriaV2(input.criteria),
    limit: boundedInteger(input.limit, 1, LEADS_SEARCH_MAX_RESULTS),
    page: 1,
  };
}

export function parseLeadsSearchPersonV2(value: unknown): LeadsSearchPersonV2 {
  const input = record(value);
  assertOnlyKeys(input, CANDIDATE_KEYS);
  const output: LeadsSearchPersonV2 = {
    providerId: boundedText(input.providerId, {
      maxBytes: 64,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/,
    }),
    name: boundedText(input.name, { maxBytes: 96 }),
  };
  if (input.title !== undefined) {
    output.title = boundedText(input.title, { maxBytes: 128 });
  }
  if (input.linkedinUrl !== undefined) {
    output.linkedinUrl = canonicalLinkedinUrl(input.linkedinUrl);
  }
  if (input.organizationName !== undefined) {
    output.organizationName = boundedText(input.organizationName, {
      maxBytes: 96,
    });
  }
  if (input.organizationDomain !== undefined) {
    output.organizationDomain = canonicalDomain(input.organizationDomain);
  }
  return output;
}

export function parseLeadsApolloPeopleSearchReceiptV2(
  value: unknown,
): LeadsApolloPeopleSearchReceiptV2 {
  const input = record(value);
  assertExactKeys(input, RECEIPT_KEYS);
  if (input.provider !== "apollo" || input.page !== 1) {
    throw new Error("invalid Apollo search receipt");
  }
  if (
    !Array.isArray(input.candidates) ||
    input.candidates.length > LEADS_SEARCH_MAX_RESULTS
  ) {
    throw new Error("invalid Apollo candidates");
  }
  const candidates = input.candidates.map(parseLeadsSearchPersonV2);
  const returned = boundedInteger(input.returned, 0, LEADS_SEARCH_MAX_RESULTS);
  if (returned !== candidates.length) {
    throw new Error("Apollo returned count does not match candidates");
  }
  const totalAvailable =
    input.totalAvailable === null
      ? null
      : boundedInteger(input.totalAvailable, returned, Number.MAX_SAFE_INTEGER);
  if (typeof input.hasMore !== "boolean") {
    throw new Error("invalid Apollo pagination state");
  }
  const nextPage =
    input.nextPage === null ? null : boundedInteger(input.nextPage, 2, 2);
  if (
    (input.hasMore && nextPage !== 2) ||
    (!input.hasMore && nextPage !== null)
  ) {
    throw new Error("incoherent Apollo pagination state");
  }
  const providerIds = candidates.map((candidate) => candidate.providerId);
  if (new Set(providerIds).size !== providerIds.length) {
    throw new Error("duplicate Apollo provider id");
  }
  return {
    provider: "apollo",
    candidates,
    totalAvailable,
    returned,
    page: 1,
    nextPage: nextPage as 2 | null,
    hasMore: input.hasMore,
  };
}

function parseCheckpoint(value: unknown): LeadsSearchCheckpointV2 {
  const input = record(value);
  assertExactKeys(input, ["stage", "receipt"]);
  if (input.stage !== "search_completed") {
    throw new Error("invalid Leads search checkpoint");
  }
  return {
    stage: "search_completed",
    receipt: parseLeadsApolloPeopleSearchReceiptV2(input.receipt),
  };
}

export function parseLeadsSearchResultV2(value: unknown): LeadsSearchResultV2 {
  const input = record(value);
  assertExactKeys(input, ["completionBoundary", ...RECEIPT_KEYS]);
  if (input.completionBoundary !== "search_completed") {
    throw new Error("invalid Leads search result");
  }
  const receipt = parseLeadsApolloPeopleSearchReceiptV2(
    Object.fromEntries(RECEIPT_KEYS.map((key) => [key, input[key]])),
  );
  return {
    completionBoundary: "search_completed",
    ...receipt,
  };
}

function objectContract<T extends DurableJson>(
  schemaVersion: number,
  bounds: DurableJsonBounds,
  parse: (value: unknown) => T,
  credentialRefs = false,
): DurableJsonContract<T> {
  return {
    schemaVersion,
    bounds,
    secrets: {
      mode: "reject",
      ...(credentialRefs
        ? { credentialRefPattern: LEADS_APOLLO_CREDENTIAL_REF_PATTERN }
        : {}),
    },
    parse,
  };
}

export const leadsSearchCommandContractV2 = objectContract(
  1,
  COMMAND_BOUNDS,
  parseLeadsSearchCommandV2,
  true,
);

export const leadsApolloPeopleSearchPayloadContractV2 = objectContract(
  1,
  COMMAND_BOUNDS,
  parseLeadsApolloPeopleSearchPayloadV2,
  true,
);

export const leadsApolloPeopleSearchReceiptContractV2 = objectContract(
  1,
  RECEIPT_BOUNDS,
  parseLeadsApolloPeopleSearchReceiptV2,
);

export const leadsSearchCheckpointContractV2 = objectContract(
  1,
  RECEIPT_BOUNDS,
  parseCheckpoint,
);

export const leadsSearchResultContractV2 = objectContract(
  1,
  RECEIPT_BOUNDS,
  parseLeadsSearchResultV2,
);

export function createLeadsSearchHandlerV2(
  apolloPeopleSearch: LeadsApolloPeopleSearchEffect,
  dependencies: LeadsSearchHandlerDependencies = {},
): DurableExecutionHandlerV2<
  LeadsSearchCommandV2,
  LeadsSearchCheckpointV2,
  LeadsSearchResultV2,
  LeadsSearchEffectsV2
> {
  const effects = {
    [LEADS_APOLLO_EFFECT_STEP]: apolloPeopleSearch,
  } as unknown as LeadsSearchEffectsV2;
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    operation: LEADS_SEARCH_OPERATION,
    version: LEADS_SEARCH_HANDLER_VERSION,
    command: leadsSearchCommandContractV2,
    checkpoint: leadsSearchCheckpointContractV2,
    result: leadsSearchResultContractV2,
    effects,
    async execute(command, context) {
      const receipt = await context.effect(LEADS_APOLLO_EFFECT_STEP, {
        credentialRef: command.credentialRef,
        criteria: command.criteria,
        limit: command.limit,
        page: 1,
      });
      return {
        status: "completed",
        currentStep: "search_completed",
        output: {
          completionBoundary: "search_completed",
          ...receipt,
        },
        eventType: "leads.search.completed",
        eventData: {
          provider: "apollo",
          returned: receipt.returned,
          hasMore: receipt.hasMore,
        },
      };
    },
    classifyPureError() {
      return {
        code: "leads_search_v2_contract_invalid",
        retryable: false,
        message: "Leads search failed closed at a pure boundary",
      };
    },
    projectTerminal(run, command, context) {
      return dependencies.projectTerminal?.(run, command, context);
    },
  };
}
