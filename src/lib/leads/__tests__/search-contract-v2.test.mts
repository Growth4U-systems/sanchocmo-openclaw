import assert from "node:assert/strict";
import { test } from "node:test";
import { DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 } from "@/lib/durable-execution/contract";
import { parseDurableJsonContractValue } from "@/lib/durable-execution/json-contract";
import type { ExecutionRun } from "@/lib/execution-control";
import {
  LEADS_APOLLO_CAPABILITY,
  LEADS_APOLLO_EFFECT_STEP,
  LEADS_SEARCH_AGGREGATE_TYPE,
  LEADS_SEARCH_HANDLER_VERSION,
  LEADS_SEARCH_MAX_RESULTS,
  LEADS_SEARCH_OPERATION,
  createLeadsSearchHandlerV2,
  leadsApolloPeopleSearchPayloadContractV2,
  leadsApolloPeopleSearchReceiptContractV2,
  leadsSearchCommandContractV2,
  leadsSearchResultContractV2,
  type LeadsApolloPeopleSearchEffect,
  type LeadsApolloPeopleSearchReceiptV2,
  type LeadsSearchCommandV2,
} from "../search-contract-v2";

const command: LeadsSearchCommandV2 = {
  schemaVersion: 1,
  slug: "hospital-capilar",
  credentialRef: "apollo://tenant/hospital-capilar",
  criteria: {
    query: "clínicas capilares",
    titles: ["Marketing Director"],
    seniorities: ["Director"],
    organizationDomains: ["example.com"],
    employeeRanges: ["1,50"],
  },
  limit: 5,
};

const receipt: LeadsApolloPeopleSearchReceiptV2 = {
  provider: "apollo",
  candidates: [
    {
      providerId: "apollo-person-1",
      name: "Marta Prueba",
      title: "Marketing Director",
      linkedinUrl: "https://www.linkedin.com/in/marta-prueba/",
      organizationName: "Hospital Capilar",
      organizationDomain: "hospitalcapilar.com",
    },
  ],
  totalAvailable: 41,
  returned: 1,
  page: 1,
  nextPage: 2,
  hasMore: true,
};

function inertEffect(): LeadsApolloPeopleSearchEffect {
  return {
    step: LEADS_APOLLO_EFFECT_STEP,
    definitionVersion: 1,
    capability: LEADS_APOLLO_CAPABILITY,
    payload: leadsApolloPeopleSearchPayloadContractV2,
    receipt: leadsApolloPeopleSearchReceiptContractV2,
    safety: { kind: "read_only", retry: "bounded" },
    retry: {
      maxAttempts: 1,
      baseDelayMs: 1,
      maxDelayMs: 1,
      jitter: "full",
    },
    timeoutMs: 1_000,
    invoke: async () => receipt,
    classify: () => ({
      kind: "definitive_rejection",
      code: "test_rejected",
      retryable: false,
    }),
  };
}

test("the native search command is closed, canonical and tenant-bound", () => {
  const parsed = parseDurableJsonContractValue(
    leadsSearchCommandContractV2,
    {
      ...command,
      criteria: {
        ...command.criteria,
        seniorities: [" Director "],
        organizationDomains: ["Example.COM."],
        employeeRanges: ["01,050"],
      },
    },
    "command",
  ).value;

  assert.equal(LEADS_SEARCH_OPERATION, "leads.search");
  assert.equal(LEADS_SEARCH_AGGREGATE_TYPE, "lead_search");
  assert.deepEqual(parsed.criteria.seniorities, ["director"]);
  assert.deepEqual(parsed.criteria.organizationDomains, ["example.com"]);
  assert.deepEqual(parsed.criteria.employeeRanges, ["1,50"]);
  assert.equal(parsed.credentialRef, `apollo://tenant/${parsed.slug}`);
});

test("command validation fails before I/O for drift, empty intent and oversized limits", () => {
  for (const invalid of [
    { ...command, unexpected: true },
    { ...command, credentialRef: "apollo://tenant/another-tenant" },
    { ...command, criteria: {} },
    { ...command, limit: LEADS_SEARCH_MAX_RESULTS + 1 },
    { ...command, criteria: { query: "valid", apiKey: "raw-secret" } },
    { ...command, criteria: { seniorities: ["chief wizard"] } },
    { ...command, criteria: { emailStatuses: ["bounced"] } },
  ]) {
    assert.throws(() =>
      parseDurableJsonContractValue(
        leadsSearchCommandContractV2,
        invalid,
        "command",
      ),
    );
  }
});

test("Apollo payloads are first-page-only and reject unsupported criteria", () => {
  assert.throws(() =>
    leadsApolloPeopleSearchPayloadContractV2.parse({
      credentialRef: command.credentialRef,
      criteria: command.criteria,
      limit: command.limit,
      page: 2,
    }),
  );
  assert.throws(() =>
    leadsApolloPeopleSearchPayloadContractV2.parse({
      credentialRef: command.credentialRef,
      criteria: { query: "clinics", industries: ["health"] },
      limit: command.limit,
      page: 1,
    }),
  );
});

test("the compact receipt is closed, internally coherent and capped below 16 KiB", () => {
  const parsed = parseDurableJsonContractValue(
    leadsApolloPeopleSearchReceiptContractV2,
    receipt,
    "effect_receipt",
  );
  assert.deepEqual(parsed.value, receipt);
  assert.ok(parsed.bytes < 16 * 1024);
  assert.equal(
    leadsApolloPeopleSearchReceiptContractV2.bounds.maxBytes,
    16 * 1024,
  );
  assert.equal(
    leadsApolloPeopleSearchReceiptContractV2.bounds.maxArrayItems,
    LEADS_SEARCH_MAX_RESULTS,
  );

  for (const invalid of [
    { ...receipt, returned: 2 },
    { ...receipt, hasMore: false },
    {
      ...receipt,
      candidates: [{ ...receipt.candidates[0], rawProviderBody: true }],
    },
    {
      ...receipt,
      candidates: [receipt.candidates[0], receipt.candidates[0]],
      returned: 2,
    },
  ]) {
    assert.throws(() =>
      parseDurableJsonContractValue(
        leadsApolloPeopleSearchReceiptContractV2,
        invalid,
        "effect_receipt",
      ),
    );
  }
});

test("the v2 handler executes exactly one Apollo effect and completes with its compact rows", async () => {
  const effect = inertEffect();
  const projected: Array<{ run: ExecutionRun; command: LeadsSearchCommandV2 }> =
    [];
  const handler = createLeadsSearchHandlerV2(effect, {
    projectTerminal: (run, projectedCommand) => {
      projected.push({ run, command: projectedCommand });
    },
  });
  const calls: Array<{ step: string; payload: unknown }> = [];
  const context = {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    delivery: "at_least_once_attempts" as const,
    run: { id: "xrun-search-1" },
    scope: {
      tenantKey: command.slug,
      operation: LEADS_SEARCH_OPERATION,
      mode: "execute" as const,
    },
    signal: new AbortController().signal,
    deadlineAt: "2026-07-16T10:00:30.000Z",
    effect: async (step: string, payload: unknown) => {
      calls.push({ step, payload });
      return receipt;
    },
    checkpoint: async () => undefined,
    assertLease: async () => undefined,
    isCancellationRequested: async () => false,
    now: () => new Date("2026-07-16T10:00:00.000Z"),
  } as unknown as Parameters<typeof handler.execute>[1];

  const result = await handler.execute(command, context);
  assert.equal(handler.contractVersion, 2);
  assert.equal(handler.operation, LEADS_SEARCH_OPERATION);
  assert.equal(handler.version, LEADS_SEARCH_HANDLER_VERSION);
  assert.equal(handler.effects[LEADS_APOLLO_EFFECT_STEP], effect);
  assert.deepEqual(calls, [
    {
      step: LEADS_APOLLO_EFFECT_STEP,
      payload: {
        credentialRef: command.credentialRef,
        criteria: command.criteria,
        limit: command.limit,
        page: 1,
      },
    },
  ]);
  assert.deepEqual(result, {
    status: "completed",
    currentStep: "search_completed",
    output: { completionBoundary: "search_completed", ...receipt },
    eventType: "leads.search.completed",
    eventData: { provider: "apollo", returned: 1, hasMore: true },
  });
  assert.deepEqual(
    leadsSearchResultContractV2.parse(result.output),
    result.output,
  );

  const terminalRun = {
    id: "xrun-search-1",
    status: "completed",
    output: result.output,
  } as ExecutionRun;
  await handler.projectTerminal(
    terminalRun,
    command,
    {} as Parameters<typeof handler.projectTerminal>[2],
  );
  assert.deepEqual(projected, [{ run: terminalRun, command }]);
});
