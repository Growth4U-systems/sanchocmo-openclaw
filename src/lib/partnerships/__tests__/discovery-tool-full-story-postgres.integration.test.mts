import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import type { NextApiRequest, NextApiResponse } from "next";
import postgres from "postgres";
import type { Db } from "@/db/drizzle";
import type { AgentRun } from "@/lib/data/agent-runs";

const databaseUrl =
  process.env.PARTNERSHIPS_FULL_STORY_DATABASE_URL ??
  process.env.PARTNERSHIPS_V2_RECONCILE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

const migrations = [
  "0019_execution_control.sql",
  "0020_execution_tenant_scope.sql",
  "0021_execution_leases.sql",
  "0022_execution_command_fingerprint.sql",
  "0023_execution_drain.sql",
  "0024_execution_tenant_contract.sql",
  "0025_execution_effects.sql",
  "0026_execution_cancellation.sql",
  "0027_execution_terminal_projections.sql",
  "0028_execution_run_blocking.sql",
  "0029_leads_search_projections.sql",
  "0030_execution_utc_timestamps.sql",
  "0031_execution_origin_lookup.sql",
  "0032_execution_origin_tombstones.sql",
  "0033_execution_origin_command_claim.sql",
] as const;

function migrationStatements(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function parentRun(input: {
  id: string;
  slug: string;
  threadId: string;
}): AgentRun {
  const timestamp = new Date().toISOString();
  return {
    id: input.id,
    threadId: input.threadId,
    runtime: "runtime-test",
    agent: "sancho",
    status: "running",
    input: {
      slug: input.slug,
      threadId: input.threadId,
      userId: "mc-admin",
      userName: "Martin",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
      runtimeDispatchMode: "ledger-v1",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function requestBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

async function startRouteServer(
  handler: (
    request: NextApiRequest,
    response: NextApiResponse,
  ) => Promise<unknown>,
): Promise<{ origin: string; close(): Promise<void> }> {
  let routeFailure: unknown;
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/api/runtime/partnerships-discovery") {
        outgoing.statusCode = 404;
        outgoing.end();
        return;
      }
      const request = {
        method: incoming.method,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: incoming.headers,
        body: await requestBody(incoming),
      } as unknown as NextApiRequest;
      const response = {
        setHeader(name: string, value: string | number | readonly string[]) {
          outgoing.setHeader(name, value);
          return this;
        },
        status(statusCode: number) {
          outgoing.statusCode = statusCode;
          return this;
        },
        json(body: unknown) {
          outgoing.setHeader("Content-Type", "application/json");
          outgoing.end(JSON.stringify(body));
          return this;
        },
      } as unknown as NextApiResponse;
      await handler(request, response);
    } catch (error) {
      routeFailure = error;
      outgoing.statusCode = 500;
      outgoing.end(JSON.stringify({ error: "test_route_failure" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else if (routeFailure) reject(routeFailure);
          else resolve();
        });
      }),
  };
}

interface RuntimeDispatchTarget {
  origin: string;
  sharedSecret: string;
  parentAgentRunId: string;
  runtimeToolCapability: string;
  dispatchRunId: string;
  dispatchLeaseToken: string;
}

async function dispatchPartnershipsTool(
  target: RuntimeDispatchTarget,
  plan: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(
    `${target.origin}/api/runtime/partnerships-discovery`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MC-Secret": target.sharedSecret,
        "X-Mission-Control-Run-Id": target.parentAgentRunId,
        "X-Sancho-Run-Capability": target.runtimeToolCapability,
        "X-Sancho-Dispatch-Run-Id": target.dispatchRunId,
        "X-Sancho-Dispatch-Lease-Token": target.dispatchLeaseToken,
      },
      body: JSON.stringify({ plan }),
      redirect: "error",
    },
  );
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: unknown }> })?.content;
  return typeof content?.[0]?.text === "string" ? content[0].text : "";
}

test(
  "runtime tool reaches HTTP, origin claim, Ledger, fixtures, Yalc and chat exactly once",
  { skip: !databaseUrl, timeout: 60_000 },
  async () => {
    const workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "sancho-partnerships-tool-story-"),
    );
    process.env.MC_WORKSPACE = workspace;
    process.env.MC_TASKS_BACKEND = "json";

    const [
      route,
      bridge,
      plugin,
      executionControl,
      admission,
      effects,
      completion,
      createSearch,
      worker,
      store,
      delivery,
      model,
      handler,
    ] = await Promise.all([
      import("@/pages/api/runtime/partnerships-discovery"),
      import("@/lib/runtime/partnerships-discovery-agent-bridge"),
      import("../../../../plugins/mc-chat/src/partnerships-discovery-tool.js"),
      import("@/lib/execution-control/postgres"),
      import("../discovery-admission-v2"),
      import("../discovery-effects-v2"),
      import("../discovery-chat-completion"),
      import("../create-search"),
      import("../discovery-durable-worker"),
      import("../discovery-store"),
      import("@/lib/data/mc-chat-durable-delivery"),
      import("@/lib/calc-creator-core"),
      import("../discovery-handler-v2"),
    ]);

    const schema = `partnerships_tool_story_${crypto.randomUUID().replaceAll("-", "")}`;
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const slug = `partners-story-${suffix}`;
    const threadId = `${slug}:general`;
    const parentAgentRunId = `arun-story-${suffix}`;
    const dispatchRunId = `xrun-dispatch-${suffix}`;
    const dispatchLeaseToken = "l".repeat(48);
    const runtimeToolCapability = "a".repeat(64);
    const sharedSecret = `story-secret-${suffix}`;
    const yalcBaseUrl = "https://yalc.partnerships-story.test";
    const parent = parentRun({ id: parentAgentRunId, slug, threadId });
    const env = {
      PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "1",
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
      PARTNERSHIPS_DISCOVERY_EFFECTS_V2: "canary",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: slug,
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
    };
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    let sql: ReturnType<typeof postgres> | undefined;
    let server: Awaited<ReturnType<typeof startRouteServer>> | undefined;

    try {
      await adminSql.unsafe(`CREATE SCHEMA "${schema}"`);
      sql = postgres(databaseUrl as string, {
        max: 8,
        onnotice: () => {},
        connection: { search_path: `${schema},public` },
      });
      await sql.begin(async (migrationSql) => {
        for (const name of migrations) {
          for (const statement of migrationStatements(name)) {
            await migrationSql.unsafe(statement);
          }
        }
      });

      const repository =
        new executionControl.PostgresExecutionControlRepository(
          drizzle(sql) as unknown as Db,
        );
      const capabilityReceipt = () => ({
        schemaVersion: 1 as const,
        capability: "campaign-leads-assign-v1" as const,
        contractVersion: 1 as const,
        endpoints: {
          assign: "/api/campaigns/:campaignId/leads/assign-v1" as const,
          receipt:
            "/api/campaigns/:campaignId/leads/assign-v1/receipt" as const,
        },
        authentication: { required: true as const, scheme: "bearer" as const },
        idempotency: {
          required: true as const,
          header: "Idempotency-Key" as const,
          requestFingerprintHeader: "Idempotency-Request-Fingerprint" as const,
          requestFingerprint: "sha256_canonical_json_leads_body" as const,
          maxCharacters: 256 as const,
          scope: ["tenant", "campaign", "operation"] as const,
          sameKeySamePayload: "frozen_response" as const,
          sameKeyDifferentPayload: "409_idempotency_conflict" as const,
        },
        execution: {
          atomic: true as const,
          maxBatchSize: 500 as const,
          replayHeader: "Idempotency-Replayed" as const,
          contractFingerprintHeader: "Yalc-Contract-Fingerprint" as const,
          receiptLookup: "read_only" as const,
        },
        contractFingerprint:
          admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
        ready: true as const,
        checks: {
          bearerAuthentication: true as const,
          receiptTable: true as const,
          receiptColumns: true as const,
          uniqueCommandIndex: true as const,
          uniqueCommandIndexColumns: true as const,
        },
      });
      const resolveYalc = (tenant: string) => {
        assert.equal(tenant, slug);
        return { baseUrl: yalcBaseUrl, slug, token: "fake-story-token" };
      };
      let capabilityChecks = 0;
      const verifyYalcCapability = async (
        config: ReturnType<typeof resolveYalc>,
        targetBindingFingerprint: string,
      ) => {
        capabilityChecks += 1;
        assert.equal(config.baseUrl, yalcBaseUrl);
        assert.equal(
          targetBindingFingerprint,
          handler.partnershipsTargetBindingFingerprint(yalcBaseUrl),
        );
        return capabilityReceipt();
      };
      const getModelConfig = async (tenant: string) => {
        assert.equal(tenant, slug);
        return {
          config: JSON.parse(
            JSON.stringify(model.DEFAULT_CREATOR_MODEL_CONFIG),
          ),
          source: "defaults" as const,
          updatedAt: null,
        };
      };
      let campaignCalls = 0;
      let campaignCompletions = 0;
      let releaseCampaign: () => void = () => undefined;
      const campaignGate = new Promise<void>((resolve) => {
        releaseCampaign = resolve;
      });
      const createCampaign = async (
        tenant: string,
        body: unknown,
        idempotencyKey: string,
      ) => {
        campaignCalls += 1;
        assert.equal(tenant, slug);
        assert.ok(body && typeof body === "object");
        assert.match(idempotencyKey, /^partnerships\.discovery:/);
        await campaignGate;
        campaignCompletions += 1;
        return { campaignId: `campaign-${suffix}` };
      };
      const setupDependencies = {
        createCampaign,
        createWorkspace: async () => ({
          projectId: null,
          taskId: null,
          taskSetup: "unavailable" as const,
        }),
        assignTemplates: async () => undefined,
        getModelConfig,
        wakeDiscovery: () => undefined,
        resolveYalcForV2: resolveYalc,
        verifyYalcCapability,
      };
      let authorityChecks = 0;
      let admissionFailure: unknown;
      const routeDependencies = {
        sharedSecret: () => sharedSecret,
        clientExists: (candidate: string) => candidate === slug,
        resolveAgentRun: async () => {
          throw new Error("durable dispatch lease must authorize this request");
        },
        authorizeDispatchLease: async (input: {
          parentAgentRunId: string;
          dispatchRunId: string;
          leaseToken: string;
          runtimeToolCapability: string;
        }) => {
          authorityChecks += 1;
          assert.equal(input.parentAgentRunId, parentAgentRunId);
          assert.equal(input.dispatchRunId, dispatchRunId);
          assert.equal(input.leaseToken, dispatchLeaseToken);
          assert.equal(input.runtimeToolCapability, runtimeToolCapability);
          return { parentRun: parent };
        },
        bridge: {
          repository,
          originCommandRepository: repository,
          env,
          workerBootEnabled: () => true,
          preflightV2: (tenant: string) =>
            admission.preflightPartnershipsDiscoveryV2(tenant, {
              env,
              resolveYalc,
              verifyYalcCapability,
            }),
          createSearch: (
            input: Parameters<typeof createSearch.createDiscoverySearch>[0],
            dependencies: Parameters<
              typeof createSearch.createDiscoverySearch
            >[1],
          ) =>
            createSearch.createDiscoverySearch(
              { ...input, executionIntent: "fixtures" },
              {
                ...dependencies,
                getModelConfig,
                setup: {
                  ...dependencies.setup,
                  ...setupDependencies,
                  inlineTimeoutMs: 0,
                },
              },
            ),
        },
        admit: async (
          context: Parameters<
            typeof bridge.admitPartnershipsDiscoveryFromAgent
          >[0],
          input: unknown,
          dependencies: Parameters<
            typeof bridge.admitPartnershipsDiscoveryFromAgent
          >[2],
        ) => {
          try {
            return await bridge.admitPartnershipsDiscoveryFromAgent(
              context,
              input,
              dependencies,
            );
          } catch (error) {
            admissionFailure = error;
            throw error;
          }
        },
        logError: () => undefined,
      };
      server = await startRouteServer(
        route.createAgentPartnershipsDiscoveryHandler(routeDependencies),
      );
      const target: RuntimeDispatchTarget = {
        origin: server.origin,
        sharedSecret,
        parentAgentRunId,
        runtimeToolCapability,
        dispatchRunId,
        dispatchLeaseToken,
      };
      const plan = {
        title: "Creators capilares España",
        sectors: ["salud capilar"],
        networks: ["instagram"],
        tiers: ["micro"],
        targetVolume: 1,
      };

      const admitted = await dispatchPartnershipsTool(target, plan);
      assert.equal(
        admitted.status,
        202,
        JSON.stringify({
          body: admitted.body,
          admissionFailure:
            admissionFailure instanceof Error
              ? {
                  name: admissionFailure.name,
                  message: admissionFailure.message,
                  cause: admissionFailure.cause,
                }
              : admissionFailure,
        }),
      );
      const admittedDiscovery = admitted.body.discovery as {
        runId?: string;
        setupRunId?: string;
        searchId?: string;
        created?: boolean;
      };
      const setupRunId = admittedDiscovery.setupRunId;
      const searchId = admittedDiscovery.searchId;
      assert.equal(admittedDiscovery.runId, setupRunId);
      assert.equal(admittedDiscovery.created, true);
      assert.match(setupRunId ?? "", /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/);
      assert.match(searchId ?? "", /^ds-[a-f0-9]{20}$/);
      assert.equal(
        campaignCompletions,
        0,
        "HTTP admission must return before the external setup write completes",
      );
      releaseCampaign();

      await worker.processNextCanaryDiscoverySetupRun(slug, {
        repository,
        env,
        workerId: `partnerships-setup-story-${suffix}`,
        setup: setupDependencies,
      });
      let setupRun = await repository.getRunById(setupRunId as string);
      const setupDeadline = Date.now() + 10_000;
      while (
        setupRun &&
        setupRun.status !== "completed" &&
        setupRun.status !== "failed" &&
        setupRun.status !== "partial" &&
        setupRun.status !== "cancelled" &&
        Date.now() < setupDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        setupRun = await repository.getRunById(setupRunId as string);
      }
      assert.equal(
        setupRun?.status,
        "completed",
        JSON.stringify({
          status: setupRun?.status,
          error: setupRun?.error,
          output: setupRun?.output,
          campaignCalls,
        }),
      );
      assert.equal(campaignCalls, 1);
      assert.equal(campaignCompletions, 1);
      const discoveryRunId = (
        setupRun?.output as { discoveryRunId?: string } | undefined
      )?.discoveryRunId;
      assert.match(discoveryRunId ?? "", /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/);

      let fixtureLoads = 0;
      // Injected as version-agnostic dependencies: the worker registry builds
      // the version-bound effects (and the v5 handler its fixture loader).
      const prepareEffectDependencies = {
        loadFixtures: () => {
          fixtureLoads += 1;
          return [
            {
              handle: "@capilar_story_fixture",
              email: "fixture@example.test",
              network: "instagram",
              followers: 48_000,
              engagementRatePct: 5.2,
              signals: { fakeFollowersPct: 0 },
            },
          ];
        },
      };
      let yalcAssignmentCalls = 0;
      const yalcAssignEffectDependencies: Parameters<
        typeof effects.createPartnershipsYalcAssignEffectV5
      >[0] = {
        transport: async (config, requestPath, input) => {
          yalcAssignmentCalls += 1;
          assert.equal(input.method, "POST");
          assert.equal(config.baseUrl, yalcBaseUrl);
          assert.equal(config.slug, slug);
          assert.match(requestPath, /\/leads\/assign-v1$/);
          assert.match(
            input.headers["Idempotency-Key"] ?? "",
            /^partnerships\.discovery:/,
          );
          assert.match(
            input.headers["Idempotency-Request-Fingerprint"] ?? "",
            /^[a-f0-9]{64}$/,
          );
          const assignment = input.body as {
            leads: Array<Record<string, unknown>>;
          };
          assert.equal(assignment.leads.length, 1);
          return {
            status: 201,
            contractFingerprint:
              admission.PARTNERSHIPS_YALC_ASSIGN_CONTRACT_FINGERPRINT,
            body: {
              ok: true,
              campaignId: `campaign-${suffix}`,
              leads: assignment.leads.map((lead) => ({
                ...lead,
                lifecycleStatus: "Sourced",
              })),
              dropped: [],
            },
          };
        },
      };
      const credentialProvider = {
        async resolve(reference: string) {
          assert.equal(reference, `yalc://tenant/${slug}`);
          return {
            slug,
            baseUrl: yalcBaseUrl,
            token: "fake-story-token",
            targetBindingFingerprint:
              handler.partnershipsTargetBindingFingerprint(yalcBaseUrl),
          };
        },
      };
      assert.equal(
        await worker.processNextCanaryDiscoveryRun(slug, {
          repository,
          env,
          workerId: `partnerships-story-${suffix}`,
          prepareEffectDependencies,
          yalcAssignEffectDependencies,
          credentialProvider,
          deliverV2ChatCompletion: (terminalRun) =>
            completion.deliverPartnershipsDiscoveryChatCompletion(terminalRun, {
              resolveOrigin: async (run) => {
                const registration =
                  await repository.getRunTrustedExecutionOrigin({
                    tenantKey: run.tenantKey,
                    runId: run.id,
                  });
                assert.equal(
                  registration?.origin.parentAgentRunId,
                  parentAgentRunId,
                );
                assert.equal(Boolean(registration?.cancellation), false);
                return {
                  origin: registration?.origin,
                  parentRun: parent,
                  tenantSlug: slug,
                  threadId,
                  agent: "sancho",
                } as never;
              },
            }),
        }),
        true,
      );
      assert.equal(
        await worker.processNextCanaryDiscoveryRun(slug, {
          repository,
          env,
          workerId: `partnerships-story-idle-${suffix}`,
          prepareEffectDependencies,
          yalcAssignEffectDependencies,
          credentialProvider,
        }),
        false,
      );
      assert.equal(fixtureLoads, 1);
      assert.equal(yalcAssignmentCalls, 1);

      const projected = store.getSearch(slug, searchId as string);
      assert.equal(projected?.executionControl?.setupRunId, setupRunId);
      assert.equal(projected?.executionControl?.runId, discoveryRunId);
      assert.equal(projected?.runner.status, "done");
      assert.equal(projected?.runner.stats?.inserted, 1);
      const deliveries = delivery.listDurableChatDeliveries(threadId);
      assert.equal(deliveries.length, 1);
      assert.match(deliveries[0]?.text ?? "", /1 lista para outreach/);

      // Thin runtime-adapter assertion: the mc-chat/OpenClaw factory must map
      // to the same generic HTTP contract, but is not the core story driver.
      const tools = plugin.createPartnershipsDiscoveryToolsForContext(
        {
          messageChannel: "mc-chat",
          deliveryContext: {
            channel: "mc-chat",
            to: `channel:mc-chat:${threadId}`,
          },
          requesterSenderId: "mc-admin",
          agentId: "sancho",
        },
        {
          clientExists: (candidate: string) => candidate === slug,
          runAuthorityFor: () => ({
            missionControlRunId: parentAgentRunId,
            runtimeToolCapability,
            dispatchRunId,
            dispatchLeaseToken,
            allowExternalEffects: true,
          }),
          loadConfig: () => ({
            channels: {
              "mc-chat": {
                mcServerUrl: server?.origin,
                sharedSecret,
              },
            },
          }),
        },
      );
      assert.equal(tools?.length, 1);
      assert.equal(tools?.[0]?.name, plugin.PARTNERSHIPS_DISCOVERY_START_TOOL);
      const replay = await tools?.[0]?.execute(
        "tool-call-replay",
        { plan },
        new AbortController().signal,
      );
      const replayDiscovery = (
        replay as { details?: { discovery?: Record<string, unknown> } }
      ).details?.discovery;
      assert.equal(replayDiscovery?.runId, setupRunId);
      assert.equal(replayDiscovery?.setupRunId, setupRunId);
      assert.equal(replayDiscovery?.discoveryRunId, discoveryRunId);
      assert.equal(replayDiscovery?.replayed, true);

      const conflicting = await dispatchPartnershipsTool(target, {
        ...plan,
        title: "Otro plan capilar",
      });
      assert.equal(conflicting.status, 409);
      assert.equal(conflicting.body.error, "execution_command_conflict");
      assert.match(toolText(replay), /partnerships\.discovery/);
      assert.equal(campaignCalls, 1);
      assert.equal(yalcAssignmentCalls, 1);
      assert.equal(authorityChecks, 3);

      const [counts] = await sql<
        Array<{
          setupRuns: number;
          discoveryRuns: number;
          effectCount: number;
          succeededEffects: number;
          originChildren: number;
          commandOperation: string;
        }>
      >`
        SELECT
          (SELECT COUNT(*)::int FROM "execution_runs"
            WHERE "tenant_key" = ${slug}
              AND "operation" = 'partnerships.discovery.setup') AS "setupRuns",
          (SELECT COUNT(*)::int FROM "execution_runs"
            WHERE "tenant_key" = ${slug}
              AND "operation" = 'partnerships.discovery') AS "discoveryRuns",
          (SELECT COUNT(*)::int FROM "execution_effects"
            WHERE "run_id" = ${discoveryRunId as string}) AS "effectCount",
          (SELECT COUNT(*)::int FROM "execution_effects"
            WHERE "run_id" = ${discoveryRunId as string}
              AND "status" = 'succeeded') AS "succeededEffects",
          (SELECT COUNT(*)::int FROM "execution_run_origins"
            WHERE "tenant_key" = ${slug}
              AND "parent_agent_run_id" = ${parentAgentRunId}) AS "originChildren",
          (SELECT "command_operation" FROM "execution_origins"
            WHERE "tenant_key" = ${slug}
              AND "parent_agent_run_id" = ${parentAgentRunId}) AS "commandOperation"
      `;
      // v5 short-step handler: the scrape runs as checkpointed handler steps,
      // so the discovery run records exactly one durable effect (yalc assign).
      assert.deepEqual(counts, {
        setupRuns: 1,
        discoveryRuns: 1,
        effectCount: 1,
        succeededEffects: 1,
        originChildren: 2,
        commandOperation: "partnerships.discovery",
      });
      assert.ok(capabilityChecks >= 2);
    } finally {
      await server?.close();
      await sql?.end({ timeout: 5 });
      await adminSql
        .unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await adminSql.end({ timeout: 5 });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  },
);
