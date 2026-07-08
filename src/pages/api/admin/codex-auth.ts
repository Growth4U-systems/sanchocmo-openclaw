import type { NextApiRequest, NextApiResponse } from "next";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE, EXEC_PATH } from "@/lib/data/paths";
import { invalidateCatalogCache } from "@/lib/data/models-catalog";
import { getRuntime } from "@/lib/runtime";

type CodexAuthStatus = "running" | "succeeded" | "failed" | "cancelled";

interface CodexAuthJob {
  id: string;
  status: CodexAuthStatus;
  startedAt: string;
  updatedAt: string;
  output: string;
  exitCode: number | null;
  error: string | null;
  cancelRequested?: boolean;
  child?: ChildProcessWithoutNullStreams;
  restart?: {
    ok: boolean;
    method?: string;
    error?: string;
  };
}

const OPENCLAW_ROOT = process.env.OPENCLAW_HOME || path.join(BASE, "..");
const JOB_TTL_MS = 30 * 60 * 1000;
const OUTPUT_LIMIT = 16 * 1024;
const jobs = new Map<string, CodexAuthJob>();

// OpenClaw auth login requires process.stdin.isTTY. This bridge gives the CLI a
// real PTY while keeping stdin/stdout controllable from the Next.js API process.
const PTY_BRIDGE = String.raw`
import os, pty, select, signal, sys

cmd = sys.argv[1:]
if not cmd:
    sys.exit(2)

pid, fd = pty.fork()
if pid == 0:
    env = os.environ.copy()
    env.setdefault("TERM", "xterm-256color")
    os.execvpe(cmd[0], cmd, env)

def finish_from_wait(status):
    if os.WIFEXITED(status):
        sys.exit(os.WEXITSTATUS(status))
    if os.WIFSIGNALED(status):
        sys.exit(128 + os.WTERMSIG(status))
    sys.exit(1)

def forward(sig, frame):
    try:
        os.kill(pid, sig)
    except OSError:
        pass

signal.signal(signal.SIGTERM, forward)
signal.signal(signal.SIGINT, forward)

stdin_open = True
while True:
    rlist = [fd]
    if stdin_open:
        rlist.append(sys.stdin.fileno())
    try:
        readable, _, _ = select.select(rlist, [], [], 0.2)
    except InterruptedError:
        continue

    if fd in readable:
        try:
            data = os.read(fd, 4096)
        except OSError:
            data = b""
        if data:
            os.write(sys.stdout.fileno(), data)
        else:
            try:
                _, status = os.waitpid(pid, 0)
                finish_from_wait(status)
            except ChildProcessError:
                sys.exit(0)

    if stdin_open and sys.stdin.fileno() in readable:
        data = os.read(sys.stdin.fileno(), 4096)
        if data:
            os.write(fd, data)
        else:
            stdin_open = False

    try:
        ended_pid, status = os.waitpid(pid, os.WNOHANG)
        if ended_pid == pid:
            finish_from_wait(status)
    except ChildProcessError:
        sys.exit(0)
`;

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

function redact(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-…")
    .replace(/\bsk-ant-[A-Za-z0-9_-]{12,}\b/g, "sk-ant-…")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi, "Bearer …")
    .replace(/\b(refresh|access)_token["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1_token: …");
}

function cleanConsoleChunk(value: string): string {
  return redact(stripAnsi(value).replace(/\r/g, "\n"));
}

function appendOutput(job: CodexAuthJob, chunk: string) {
  if (!chunk) return;
  job.output = `${job.output}${cleanConsoleChunk(chunk)}`.slice(-OUTPUT_LIMIT);
  job.updatedAt = new Date().toISOString();
}

function parseAuthFields(output: string) {
  const clean = stripAnsi(output).replace(/\r/g, "\n");
  const urls = Array.from(clean.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map((match) =>
    match[0].replace(/[),.;]+$/g, ""),
  );
  const codeLine =
    clean.match(/\bCode:\s*([A-Z0-9][A-Z0-9-]{5,})\b/i)?.[1] ||
    clean.match(/\bUser code:\s*([A-Z0-9][A-Z0-9-]{5,})\b/i)?.[1] ||
    clean.match(/\b([A-Z0-9]{4,}(?:-[A-Z0-9]{4,}){1,3})\b/)?.[1] ||
    null;
  const expiresText =
    clean.match(/\bCode expires in\s*([^\n.]+(?:minutes?|seconds?)?)\.?/i)?.[1]?.trim() || null;
  return {
    url: urls.find((url) => !/localhost|127\.0\.0\.1/i.test(url)) || urls[0] || null,
    code: codeLine,
    expiresText,
  };
}

function publicJob(job: CodexAuthJob) {
  const fields = parseAuthFields(job.output);
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    output: job.output.trim(),
    exitCode: job.exitCode,
    error: job.error,
    restart: job.restart,
    ...fields,
  };
}

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status === "running") continue;
    if (now - Date.parse(job.updatedAt) > JOB_TTL_MS) jobs.delete(id);
  }
}

function activeJob(): CodexAuthJob | undefined {
  return Array.from(jobs.values()).find((job) => job.status === "running");
}

async function finalizeSuccessfulLogin(job: CodexAuthJob) {
  invalidateCatalogCache();
  try {
    const restart = (await getRuntime().lifecycle.restart()) as {
      ok: boolean;
      method?: string;
      error?: string;
    };
    job.restart = restart;
    appendOutput(
      job,
      restart.ok
        ? "\nGateway reiniciado para aplicar la sesión Codex.\n"
        : `\nCodex autenticado, pero no se pudo reiniciar el gateway: ${restart.error || "timeout"}.\n`,
    );
  } catch (error) {
    job.restart = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    appendOutput(job, `\nCodex autenticado, pero falló el refresco del gateway: ${job.restart.error}.\n`);
  }
}

function startJob(): CodexAuthJob {
  cleanupJobs();
  const existing = activeJob();
  if (existing) return existing;

  const now = new Date().toISOString();
  const job: CodexAuthJob = {
    id: randomUUID(),
    status: "running",
    startedAt: now,
    updatedAt: now,
    output: "",
    exitCode: null,
    error: null,
  };

  const child = spawn(
    "python3",
    [
      "-c",
      PTY_BRIDGE,
      "openclaw",
      "models",
      "auth",
      "login",
      "--provider",
      "openai-codex",
      "--method",
      "device-code",
    ],
    {
      cwd: OPENCLAW_ROOT,
      env: {
        ...process.env,
        PATH: EXEC_PATH,
        TERM: process.env.TERM || "xterm-256color",
        // Force OpenClaw's remote/VPS OAuth branch even in local dev. The UI
        // should be the control surface: show URL + code, don't pop a browser
        // window from the server process.
        REMOTE_CONTAINERS: process.env.REMOTE_CONTAINERS || "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  job.child = child;
  jobs.set(job.id, job);

  child.stdout.on("data", (chunk: Buffer) => appendOutput(job, chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => appendOutput(job, chunk.toString("utf8")));
  child.on("error", (error) => {
    job.status = "failed";
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    job.child = undefined;
    job.exitCode = code;
    job.status = job.cancelRequested ? "cancelled" : code === 0 ? "succeeded" : "failed";
    job.updatedAt = new Date().toISOString();
    if (job.status === "failed" && !job.error) {
      job.error = "No se pudo completar el login de Codex";
    }
    if (job.status === "succeeded") {
      void finalizeSuccessfulLogin(job);
    }
  });

  appendOutput(job, "Iniciando conexión Codex desde Sancho…\n");
  return job;
}

function getJob(id: unknown): CodexAuthJob | undefined {
  if (typeof id === "string" && id.trim()) return jobs.get(id);
  return activeJob() || Array.from(jobs.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  if (req.method === "GET") {
    cleanupJobs();
    const job = getJob(req.query.id);
    return res.status(200).json({ ok: true, job: job ? publicJob(job) : null });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body || {}) as { action?: string; id?: string; input?: string };
  const action = body.action || "start";

  if (action === "start") {
    const job = startJob();
    return res.status(200).json({ ok: true, job: publicJob(job) });
  }

  const job = getJob(body.id);
  if (!job) return res.status(404).json({ error: "Codex auth job not found" });

  if (action === "cancel") {
    job.cancelRequested = true;
    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    job.child?.kill("SIGTERM");
    setTimeout(() => job.child?.kill("SIGKILL"), 2_000).unref?.();
    return res.status(200).json({ ok: true, job: publicJob(job) });
  }

  if (action === "submit") {
    if (job.status !== "running" || !job.child?.stdin.writable) {
      return res.status(409).json({ error: "Codex auth job is not accepting input" });
    }
    const input = typeof body.input === "string" ? body.input.trim() : "";
    if (!input) return res.status(400).json({ error: "Missing input" });
    job.child.stdin.write(input.endsWith("\n") ? input : `${input}\n`);
    appendOutput(job, "\nRedirect enviado desde la UI.\n");
    return res.status(200).json({ ok: true, job: publicJob(job) });
  }

  return res.status(400).json({ error: "Invalid action" });
}

export default compose(withErrorHandler, withAuth)(handler);
