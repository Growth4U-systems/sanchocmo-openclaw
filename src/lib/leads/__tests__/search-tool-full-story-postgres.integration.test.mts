import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import type { NextApiRequest, NextApiResponse } from "next";
import postgres from "postgres";
import type { Db } from "@/db/drizzle";
import type { AgentRun } from "@/lib/data/agent-runs";
import { PostgresExecutionControlRepository } from "@/lib/execution-control/postgres";
import {
  createAgentLeadsSearchHandler,
  type AgentLeadsSearchRouteDependencies,
} from "@/pages/api/runtime/leads-search";
import {
  createLeadsSearchToolsForContext,
  LEADS_SEARCH_START_TOOL,
} from "../../../../plugins/mc-chat/src/leads-search-tool.js";
import { createLeadsApolloPeopleSearchEffect } from "../search-apollo-binding";
import { formatLeadsSearchChatCompletion } from "../search-chat-completion";
import {
  admitLeadsSearch,
  getLeadsSearchStatus,
  processNextLeadsSearchRun,
  type LeadsSearchEnvironment,
} from "../search-durable-worker";
import { PostgresLeadsSearchProjectionRepository } from "../search-projection-postgres";

const databaseUrl =
  process.env.LEADS_SEARCH_FULL_STORY_DATABASE_URL ??
  process.env.LEADS_SEARCH_POSTGRES_TEST_DATABASE_URL ??
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
    runtime: "openclaw",
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
  handler: ReturnType<typeof createAgentLeadsSearchHandler>,
): Promise<{ origin: string; close(): Promise<void> }> {
  let routeFailure: unknown;
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/api/runtime/leads-search") {
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

function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: unknown }> })?.content;
  return typeof content?.[0]?.text === "string" ? content[0].text : "";
}

test(
  "plugin tool reaches HTTP, Ledger, provider, projection and chat exactly once",
  { skip: !databaseUrl, timeout: 60_000 },
  async () => {
    const schema = `leads_tool_story_${crypto.randomUUID().replaceAll("-", "")}`;
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const slug = `leads-story-${suffix}`;
    const threadId = `${slug}:general`;
    const parentAgentRunId = `arun-story-${suffix}`;
    const dispatchRunId = `xrun-dispatch-${suffix}`;
    const dispatchLeaseToken = "l".repeat(48);
    const runtimeToolCapability = "a".repeat(64);
    const sharedSecret = `story-secret-${suffix}`;
    const apiKey = `apollo-story-key-${suffix}`;
    const parent = parentRun({ id: parentAgentRunId, slug, threadId });
    const sql = postgres(databaseUrl as string, { max: 1, onnotice: () => {} });
    const projectionSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    let server: Awaited<ReturnType<typeof startRouteServer>> | undefined;

    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await sql.unsafe(`SET search_path TO "${schema}", public`);
      for (const name of migrations) {
        for (const statement of migrationStatements(name)) {
          await sql.unsafe(statement);
        }
      }
      await projectionSql.unsafe(`SET search_path TO "${schema}", public`);

      const executionDatabase = drizzle(sql) as unknown as Db;
      const projectionDatabase = drizzle(projectionSql) as unknown as Db;
      const repository = new PostgresExecutionControlRepository(
        executionDatabase,
      );
      const productProjectionRepository =
        new PostgresLeadsSearchProjectionRepository(projectionDatabase);
      const enabledEnv: LeadsSearchEnvironment = {
        LEADS_SEARCH_EXECUTION_V2: "canary",
        LEADS_SEARCH_V2_SLUGS: slug,
      };
      const drainEnv: LeadsSearchEnvironment = {
        LEADS_SEARCH_EXECUTION_V2: "off",
        LEADS_SEARCH_V2_SLUGS: "",
      };
      let providerCalls = 0;
      const deliveries: Parameters<
        NonNullable<AgentLeadsSearchRouteDependencies["deliverChat"]>
      >[0][] = [];
      const apolloPeopleSearchEffect = createLeadsApolloPeopleSearchEffect({
        timeoutMs: 5_000,
        transport: async (input) => {
          providerCalls += 1;
          assert.equal(input.apiKey, apiKey);
          assert.deepEqual(input.criteria.titles, ["Marketing Director"]);
          assert.equal(input.limit, 2);
          return {
            people: [
              {
                id: "apollo-story-person-1",
                name: "Ada Lovelace",
                title: "Marketing Director",
                linkedin_url: "https://www.linkedin.com/in/ada-story",
                organization: {
                  name: "Analytical Engines",
                  primary_domain: "analytical.example",
                },
              },
            ],
            pagination: { total_entries: 1 },
          };
        },
      });
      const routeDependencies: AgentLeadsSearchRouteDependencies = {
        sharedSecret: () => sharedSecret,
        clientExists: (candidate) => candidate === slug,
        resolveAgentRun: async () => {
          throw new Error("durable dispatch lease must authorize this request");
        },
        authorizeDispatchLease: async (input) => {
          assert.equal(input.parentAgentRunId, parentAgentRunId);
          assert.equal(input.dispatchRunId, dispatchRunId);
          assert.equal(input.leaseToken, dispatchLeaseToken);
          assert.equal(input.runtimeToolCapability, runtimeToolCapability);
          return { parentRun: parent };
        },
        repository,
        originCommandRepository: repository,
        env: enabledEnv,
        apolloPeopleSearchEffect,
        productProjectionRepository,
        deliverChat: async (delivery) => {
          deliveries.push(delivery);
        },
        wake: () => undefined,
        logError: () => undefined,
        admit: (input, bridgeDependencies) =>
          admitLeadsSearch(input, {
            repository,
            env: enabledEnv,
            apolloPeopleSearchEffect,
            productProjectionRepository,
            deliverChat: async (delivery) => {
              deliveries.push(delivery);
            },
            wake: () => undefined,
            ...bridgeDependencies,
          }),
      };
      server = await startRouteServer(
        createAgentLeadsSearchHandler(routeDependencies),
      );

      const httpEvidence: Array<{ status: number; body: string }> = [];
      const tools = createLeadsSearchToolsForContext(
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
            allowedExternalEffects: ["leads_search_start"],
          }),
          loadConfig: () => ({
            channels: {
              "mc-chat": {
                mcServerUrl: server?.origin,
                sharedSecret,
              },
            },
          }),
          fetchImpl: async (url: string | URL, init?: RequestInit) => {
            const response = await fetch(url, init);
            httpEvidence.push({
              status: response.status,
              body: await response.clone().text(),
            });
            return response;
          },
        },
      );
      assert.equal(tools?.length, 1);
      assert.equal(tools?.[0]?.name, LEADS_SEARCH_START_TOOL);

      const command = {
        criteria: {
          titles: ["Marketing Director"],
          organizationLocations: ["Spain"],
        },
        limit: 2,
      };
      const admitted = await tools?.[0]?.execute(
        "tool-call-1",
        command,
        new AbortController().signal,
      );
      const admittedDetails = (
        admitted as {
          details?: { status?: string; search?: { runId?: string } };
        }
      ).details;
      assert.equal(
        admittedDetails?.status,
        "completed",
        JSON.stringify({ admitted, httpEvidence }),
      );
      const runId = admittedDetails?.search?.runId;
      assert.match(runId ?? "", /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/);
      assert.equal(providerCalls, 0, "HTTP admission cannot call the provider");

      const [claim] = await sql<
        { operation: string; childCount: number }[]
      >`
        SELECT
          origin."command_operation" AS "operation",
          COUNT(child."run_id")::int AS "childCount"
        FROM "execution_origins" origin
        LEFT JOIN "execution_run_origins" child
          ON child."tenant_key" = origin."tenant_key"
         AND child."kind" = origin."kind"
         AND child."parent_agent_run_id" = origin."parent_agent_run_id"
        WHERE origin."tenant_key" = ${slug}
          AND origin."parent_agent_run_id" = ${parentAgentRunId}
        GROUP BY origin."command_operation"
      `;
      assert.equal(claim?.operation, "leads.search");
      assert.equal(claim?.childCount, 1);

      assert.equal(
        await processNextLeadsSearchRun(slug, {
          repository,
          env: drainEnv,
          workerId: `leads-full-story-${suffix}`,
          apolloPeopleSearchEffect,
          productProjectionRepository,
          resolveApolloApiKey: async (tenantKey) => {
            assert.equal(tenantKey, slug);
            return apiKey;
          },
          deliverChat: async (delivery) => {
            deliveries.push(delivery);
          },
        }),
        true,
      );
      assert.equal(providerCalls, 1);
      assert.equal(deliveries.length, 1);
      assert.match(
        formatLeadsSearchChatCompletion(deliveries[0]),
        /Ada Lovelace/,
      );

      const completed = await getLeadsSearchStatus(
        { slug, runId: runId as string },
        { repository },
      );
      assert.equal(completed?.status, "completed");
      assert.equal(completed?.result?.returned, 1);
      assert.equal(
        completed?.result?.candidates[0]?.providerId,
        "apollo-story-person-1",
      );

      const replay = await tools?.[0]?.execute(
        "tool-call-2",
        command,
        new AbortController().signal,
      );
      assert.equal(
        (replay as { details?: { search?: { runId?: string } } }).details
          ?.search?.runId,
        runId,
      );
      assert.equal(providerCalls, 1);

      const conflicting = await tools?.[0]?.execute(
        "tool-call-3",
        { criteria: { titles: ["Sales Director"] }, limit: 2 },
        new AbortController().signal,
      );
      assert.equal(
        (conflicting as { details?: { code?: string } }).details?.code,
        "execution_command_conflict",
      );
      assert.equal(providerCalls, 1);
      assert.match(toolText(conflicting), /no inicié una segunda búsqueda/i);

      const [counts] = await sql<
        { runCount: number; effectCount: number; projectionCount: number }[]
      >`
        SELECT
          (SELECT COUNT(*)::int FROM "execution_runs"
            WHERE "tenant_key" = ${slug} AND "operation" = 'leads.search')
            AS "runCount",
          (SELECT COUNT(*)::int FROM "execution_effects"
            WHERE "run_id" = ${runId as string}) AS "effectCount",
          (SELECT COUNT(*)::int FROM "leads_search_projections"
            WHERE "tenant_key" = ${slug}) AS "projectionCount"
      `;
      assert.deepEqual(counts, {
        runCount: 1,
        effectCount: 1,
        projectionCount: 1,
      });
    } finally {
      await server?.close();
      await projectionSql.end({ timeout: 5 });
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(
        () => undefined,
      );
      await sql.end({ timeout: 5 });
    }
  },
);
