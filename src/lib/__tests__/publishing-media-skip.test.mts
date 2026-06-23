import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { PublishInput, PublishResult } from "../publishing/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "publishing-media-skip-"));
process.env.MC_WORKSPACE = tmp;

const SLUG = "publish-skip-brand";
const PARENT_ID = "P-Content-Semana-01-T01";
const CT_ID = `${PARENT_ID}-C01`;
const IDEA_ID = "idea-2026-06-19-1";
const CHANNEL = "linkedin";

type Handler = typeof import("../../pages/api/publishing/publish").default;
type Metricool = typeof import("../publishing/providers/metricool");
type MfMod = typeof import("../data/markdown-frontmatter");

let handler: Handler;
let metricoolProvider: Metricool["metricoolProvider"];
let writeFrontmatterFile: MfMod["writeFrontmatterFile"];
let publishCalls: PublishInput[];
let originalInspect: Metricool["metricoolProvider"]["inspect"];
let originalPublish: Metricool["metricoolProvider"]["publish"];

function brandDir() {
  return path.join(tmp, "brand", SLUG);
}

function seedWorkspace(mediaStatus?: "pending" | "skipped", media: unknown[] = []) {
  fs.rmSync(brandDir(), { recursive: true, force: true });

  const projDir = path.join(brandDir(), "projects", "P-Content-Semana-01");
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(
    path.join(projDir, "tasks.json"),
    JSON.stringify(
      [
        {
          id: PARENT_ID,
          type: "content",
          content_tasks: [
            {
              id: CT_ID,
              parent_task_id: PARENT_ID,
              idea_id: IDEA_ID,
              name: "Required visual post",
              status: "Ready",
              target_channels: [CHANNEL],
              documents: [],
              media_policy: { [CHANNEL]: "required" },
              media_status: mediaStatus,
              channel_phases: { [CHANNEL]: "approved" },
              created_at: "2026-06-19T00:00:00.000Z",
              updated_at: "2026-06-19T00:00:00.000Z",
            },
          ],
        },
      ],
      null,
      2,
    ),
  );

  writeFrontmatterFile(
    path.join(brandDir(), "content", "drafts", IDEA_ID, `${CHANNEL}.md`),
    {
      idea_id: IDEA_ID,
      content_task_id: CT_ID,
      channel: CHANNEL,
      kind: "channel-draft",
      iteration: 0,
      media,
      created_at: "2026-06-19T00:00:00.000Z",
      updated_at: "2026-06-19T00:00:00.000Z",
    },
    "Body",
  );
}

function createReq(body: Record<string, unknown>): NextApiRequest {
  return {
    method: "POST",
    url: "/api/publishing/publish",
    body,
    query: {},
    headers: {},
  } as NextApiRequest;
}

function createRes() {
  const res: Partial<NextApiResponse> & {
    statusCode?: number;
    body?: unknown;
    headers: Record<string, string | string[]>;
    headersSent: boolean;
  } = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    setHeader(name: string, value: string | string[]) {
      this.headers[name] = value;
      return this as NextApiResponse;
    },
    status(code: number) {
      this.statusCode = code;
      return this as NextApiResponse;
    },
    json(payload: unknown) {
      this.body = payload;
      this.headersSent = true;
      return this as NextApiResponse;
    },
  };
  return res as NextApiResponse & { statusCode: number; body: unknown };
}

async function callPublish(mediaStatus?: "pending" | "skipped", media: unknown[] = []) {
  seedWorkspace(mediaStatus, media);
  const req = createReq({
    slug: SLUG,
    ideaId: IDEA_ID,
    channel: CHANNEL,
    providerId: "metricool",
    schedule: { publishAt: "2026-06-20T10:00:00.000Z" },
  });
  const res = createRes();
  await handler(req, res);
  return res;
}

before(async () => {
  ({ writeFrontmatterFile } = await import("../data/markdown-frontmatter"));
  ({ metricoolProvider } = await import("../publishing/providers/metricool"));
  ({ default: handler } = await import("../../pages/api/publishing/publish"));

  originalInspect = metricoolProvider.inspect;
  originalPublish = metricoolProvider.publish;
});

beforeEach(() => {
  publishCalls = [];
  metricoolProvider.inspect = () => ({ configured: true });
  metricoolProvider.publish = async (input: PublishInput): Promise<PublishResult> => {
    publishCalls.push(input);
    return {
      ok: true,
      externalJobId: "scheduled-1",
      scheduledAt: input.schedule?.publishAt,
    };
  };
});

after(() => {
  metricoolProvider.inspect = originalInspect;
  metricoolProvider.publish = originalPublish;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("publish honors media_status='skipped' and dispatches text-only despite required media", async () => {
  const res = await callPublish("skipped");

  assert.equal(res.statusCode, 200);
  assert.equal(publishCalls.length, 1);
  assert.deepEqual(publishCalls[0].media, []);
  assert.equal((res.body as { ok?: boolean }).ok, true);
});

test("publish still blocks required media when no skipped escape is set", async () => {
  const res = await callPublish();

  assert.equal(res.statusCode, 400);
  assert.equal(publishCalls.length, 0);
  assert.match(
    (res.body as { error?: string }).error ?? "",
    /requires media/,
  );
});

const REAL_PDF = [
  {
    url: "https://cdn.example.com/carousel.pdf",
    type: "application/pdf",
    source: "uploaded",
    created_at: "2026-06-19T00:00:00.000Z",
  },
];

test("publish with real media (no skip) passes the gate and dispatches", async () => {
  // Required + a PDF present satisfies the linkedin per-network sub-check →
  // gate passes regardless of media_status → provider is called.
  const res = await callPublish(undefined, REAL_PDF);

  assert.equal(res.statusCode, 200);
  assert.equal(publishCalls.length, 1);
  assert.equal(publishCalls[0].media.length, 1);
});

test("skip escape bypasses the per-network PDF sub-check too (image-only attached)", async () => {
  // linkedin normally demands a PDF; with the skip escape set, even a non-PDF
  // image must not trip the per-network sub-check. The whole block is bypassed.
  const imageOnly = [
    {
      url: "https://cdn.example.com/slide.png",
      type: "image/png",
      source: "uploaded",
      created_at: "2026-06-19T00:00:00.000Z",
    },
  ];
  const res = await callPublish("skipped", imageOnly);

  assert.equal(res.statusCode, 200);
  assert.equal(publishCalls.length, 1);
  assert.doesNotMatch(
    (res.body as { error?: string }).error ?? "",
    /requires a multi-page PDF/,
  );
});
