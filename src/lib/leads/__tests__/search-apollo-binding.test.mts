import assert from "node:assert/strict";
import { test } from "node:test";
import type { DurableEffectInvocationContext } from "@/lib/durable-execution";
import { validateDurableEffectDefinition } from "@/lib/durable-execution/effect-contract";
import {
  LEADS_APOLLO_CAPABILITY,
  LEADS_APOLLO_EFFECT_STEP,
  leadsApolloPeopleSearchReceiptContractV2,
  type LeadsApolloPeopleSearchPayloadV2,
} from "../search-contract-v2";
import {
  APOLLO_PEOPLE_SEARCH_MAX_RESPONSE_BYTES,
  APOLLO_PEOPLE_SEARCH_URL,
  ApolloBindingError,
  ApolloProviderError,
  classifyLeadsApolloSearchError,
  createLeadsApolloCredentialProvider,
  createLeadsApolloPeopleSearchEffect,
} from "../search-apollo-binding";

const tenantKey = "hospital-capilar";
const credentialRef = `apollo://tenant/${tenantKey}`;
const payload: LeadsApolloPeopleSearchPayloadV2 = {
  credentialRef,
  criteria: {
    query: "clínicas capilares",
    titles: ["Marketing Director"],
    seniorities: ["director"],
    personLocations: ["Madrid, Spain"],
    organizationLocations: ["Spain"],
    organizationDomains: ["hospitalcapilar.com"],
    employeeRanges: ["1,50"],
    emailStatuses: ["verified"],
  },
  limit: 10,
  page: 1,
};

function invocationContext(
  overrides: Partial<DurableEffectInvocationContext> = {},
): DurableEffectInvocationContext {
  return {
    effectKey: "leads.search:xrun-1:apollo.people.search:v1",
    signal: new AbortController().signal,
    deadlineAt: "2026-07-16T10:00:30.000Z",
    tenantKey,
    credentials: {
      resolve: async () => ({ tenantKey, apiKey: "apollo-unit-test-key" }),
    },
    ...overrides,
  };
}

test("the default binding performs one real Apollo People Search request and drops raw fields", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return new Response(
      JSON.stringify({
        people: [
          {
            id: "person-1",
            name: "Marta Prueba",
            title: "Marketing Director",
            linkedin_url:
              "https://www.linkedin.com/in/marta-prueba/?trk=secret",
            email: "marta@example.com",
            api_key: "must-never-be-persisted",
            organization: {
              name: "Hospital Capilar",
              primary_domain: "HospitalCapilar.com",
            },
          },
        ],
        pagination: { total_entries: 51 },
        providerSecret: "raw-provider-secret",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const effect = createLeadsApolloPeopleSearchEffect();
    const result = await effect.invoke(payload, invocationContext());
    assert.equal(calls.length, 1);
    assert.equal(
      `${calls[0].url.origin}${calls[0].url.pathname}`,
      APOLLO_PEOPLE_SEARCH_URL,
    );
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.redirect, "error");
    assert.equal(
      calls[0].url.searchParams.get("q_keywords"),
      "clínicas capilares",
    );
    assert.deepEqual(calls[0].url.searchParams.getAll("person_titles[]"), [
      "Marketing Director",
    ]);
    assert.deepEqual(
      calls[0].url.searchParams.getAll("q_organization_domains_list[]"),
      ["hospitalcapilar.com"],
    );
    assert.equal(calls[0].url.searchParams.get("page"), "1");
    assert.equal(calls[0].url.searchParams.get("per_page"), "10");
    assert.equal(
      (calls[0].init?.headers as Record<string, string>)["X-Api-Key"],
      "apollo-unit-test-key",
    );
    assert.deepEqual(result, {
      provider: "apollo",
      candidates: [
        {
          providerId: "person-1",
          name: "Marta Prueba",
          title: "Marketing Director",
          linkedinUrl: "https://www.linkedin.com/in/marta-prueba/",
          organizationName: "Hospital Capilar",
          organizationDomain: "hospitalcapilar.com",
        },
      ],
      totalAvailable: 51,
      returned: 1,
      page: 1,
      nextPage: 2,
      hasMore: true,
    });
    assert.doesNotMatch(
      JSON.stringify(result),
      /email|api_key|providerSecret|raw-provider-secret/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the effect is read-only, bounded and invokes an injected transport only once", async () => {
  const signals: AbortSignal[] = [];
  let calls = 0;
  const effect = createLeadsApolloPeopleSearchEffect({
    timeoutMs: 45_000,
    transport: async (input) => {
      calls += 1;
      signals.push(input.signal);
      assert.equal(input.apiKey, "apollo-unit-test-key");
      assert.equal(input.page, 1);
      assert.equal(input.limit, 10);
      return {
        people: Array.from({ length: 15 }, (_, index) => ({
          id: `person-${index + 1}`,
          name: `Person ${index + 1}`,
        })),
        pagination: { total_entries: 15 },
      };
    },
  });
  const context = invocationContext();
  const result = await effect.invoke(payload, context);

  assert.equal(effect.step, LEADS_APOLLO_EFFECT_STEP);
  assert.equal(effect.capability, LEADS_APOLLO_CAPABILITY);
  assert.doesNotThrow(() =>
    validateDurableEffectDefinition(effect, LEADS_APOLLO_EFFECT_STEP),
  );
  assert.deepEqual(effect.safety, { kind: "read_only", retry: "bounded" });
  assert.equal(effect.retry.maxAttempts, 3);
  assert.equal(effect.timeoutMs, 45_000);
  assert.equal(calls, 1);
  assert.deepEqual(signals, [context.signal]);
  assert.equal(result.candidates.length, 10);
  assert.equal(result.returned, 10);
  assert.equal(result.nextPage, 2);
  const validated = leadsApolloPeopleSearchReceiptContractV2.parse(result);
  assert.ok(Buffer.byteLength(JSON.stringify(validated), "utf8") < 16 * 1024);
});

test("the worker-provided timeout is bounded before the effect can be registered", () => {
  assert.equal(createLeadsApolloPeopleSearchEffect().timeoutMs, 30_000);
  for (const timeoutMs of [999, 120_001, 1.5, Number.NaN]) {
    assert.throws(
      () => createLeadsApolloPeopleSearchEffect({ timeoutMs }),
      /between 1000 and 120000 ms/,
    );
  }
});

test("tenant mismatch fails before credential resolution or provider I/O", async () => {
  let credentialsCalled = false;
  let transportCalled = false;
  const effect = createLeadsApolloPeopleSearchEffect({
    transport: async () => {
      transportCalled = true;
      return { people: [], pagination: { total_entries: 0 } };
    },
  });
  await assert.rejects(
    effect.invoke(
      payload,
      invocationContext({
        tenantKey: "another-tenant",
        credentials: {
          resolve: async () => {
            credentialsCalled = true;
            return { apiKey: "must-not-be-read" };
          },
        },
      }),
    ),
    ApolloBindingError,
  );
  assert.equal(credentialsCalled, false);
  assert.equal(transportCalled, false);
});

test("the injected credential provider resolves only the exact opaque tenant reference", async () => {
  const tenants: string[] = [];
  const provider = createLeadsApolloCredentialProvider(async (slug) => {
    tenants.push(slug);
    return "apollo-resolved-key";
  });
  assert.deepEqual(await provider.resolve(credentialRef), {
    tenantKey,
    apiKey: "apollo-resolved-key",
  });
  assert.deepEqual(tenants, [tenantKey]);
  await assert.rejects(
    provider.resolve("apollo://tenant/INVALID"),
    /invalid string/,
  );
});

test("provider classification retries only bounded transient failures", () => {
  assert.deepEqual(
    classifyLeadsApolloSearchError(
      new ApolloProviderError("apollo_http_rejected", 429, "request-1"),
    ),
    {
      kind: "definitive_rejection",
      code: "apollo_search_provider_unavailable",
      retryable: true,
    },
  );
  assert.deepEqual(
    classifyLeadsApolloSearchError(
      new ApolloProviderError("apollo_http_rejected", 401),
    ),
    {
      kind: "definitive_rejection",
      code: "apollo_search_request_rejected",
      retryable: false,
    },
  );
  assert.deepEqual(
    classifyLeadsApolloSearchError(new TypeError("network failed")),
    {
      kind: "outcome_unknown",
      code: "apollo_search_outcome_unknown",
    },
  );
  assert.deepEqual(classifyLeadsApolloSearchError(new ApolloBindingError()), {
    kind: "definitive_rejection",
    code: "apollo_search_binding_invalid",
    retryable: false,
  });
});

test("failed provider bodies and unsafe request ids never enter the error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        email: "private@example.com",
        apiKey: "secret-provider-value",
      }),
      {
        status: 429,
        headers: { "x-request-id": "unsafe request id with spaces" },
      },
    )) as typeof fetch;
  try {
    const effect = createLeadsApolloPeopleSearchEffect();
    let failure: unknown;
    try {
      await effect.invoke(payload, invocationContext());
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof ApolloProviderError);
    assert.equal(failure.status, 429);
    assert.equal(failure.requestId, undefined);
    assert.doesNotMatch(
      failure.message,
      /private@example.com|secret-provider-value|unsafe request/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("oversized Apollo responses are rejected without retaining provider data", async () => {
  const originalFetch = globalThis.fetch;
  const privateNeedle = "private-provider-response-body";
  const cases: Array<{ name: string; response: () => Response }> = [
    {
      name: "declared content length",
      response: () =>
        new Response(privateNeedle, {
          status: 200,
          headers: {
            "content-length": String(
              APOLLO_PEOPLE_SEARCH_MAX_RESPONSE_BYTES + 1,
            ),
          },
        }),
    },
    {
      name: "streamed body",
      response: () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new Uint8Array(APOLLO_PEOPLE_SEARCH_MAX_RESPONSE_BYTES + 1),
              );
              controller.close();
            },
          }),
          { status: 200 },
        ),
    },
  ];
  try {
    for (const scenario of cases) {
      globalThis.fetch = (async () => scenario.response()) as typeof fetch;
      let failure: unknown;
      try {
        await createLeadsApolloPeopleSearchEffect().invoke(
          payload,
          invocationContext(),
        );
      } catch (error) {
        failure = error;
      }
      assert.ok(failure instanceof ApolloProviderError, scenario.name);
      assert.equal(failure.code, "apollo_response_invalid", scenario.name);
      assert.doesNotMatch(
        failure.message,
        new RegExp(privateNeedle),
        scenario.name,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing credentials and malformed provider envelopes fail closed", async () => {
  const missingCredentialEffect = createLeadsApolloPeopleSearchEffect({
    transport: async () => {
      throw new Error("transport must not run");
    },
  });
  await assert.rejects(
    missingCredentialEffect.invoke(
      payload,
      invocationContext({ credentials: { resolve: async () => ({}) } }),
    ),
    ApolloBindingError,
  );

  const malformedEffect = createLeadsApolloPeopleSearchEffect({
    transport: async () => ({ pagination: { total_entries: 1 } }),
  });
  let malformed: unknown;
  try {
    await malformedEffect.invoke(payload, invocationContext());
  } catch (error) {
    malformed = error;
  }
  assert.ok(malformed instanceof ApolloProviderError);
  assert.deepEqual(classifyLeadsApolloSearchError(malformed), {
    kind: "definitive_rejection",
    code: "apollo_search_response_invalid",
    retryable: true,
  });
});
