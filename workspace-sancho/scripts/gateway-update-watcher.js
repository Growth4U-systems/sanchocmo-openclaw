#!/usr/bin/env node
/**
 * gateway-update-watcher.js — Detect npm updates of the `openclaw` package
 * and restart the running gateway so it picks up the new bundle.
 *
 * The bug this fixes:
 *   `npm update -g openclaw` replaces the chunked dist files in
 *   `/opt/homebrew/lib/node_modules/openclaw/dist/` with new content-hashed
 *   filenames. The running gateway has the OLD bundle in memory and tries to
 *   lazy-import chunks by their old hash → ERR_MODULE_NOT_FOUND in a tight
 *   loop, breaking Discord, dispatch, and chat. (Bug #1 from 2026-04-13.)
 *
 * What this does:
 *   1. Reads the mtime of `/opt/homebrew/lib/node_modules/openclaw` (or
 *      whichever path the openclaw CLI resolves to).
 *   2. Reads the start time of the running `openclaw-gateway` process.
 *   3. If the package was modified AFTER the gateway started → the gateway
 *      is running stale code. Calls `openclaw gateway restart` to refresh it.
 *
 * Cadence:
 *   Runs every 5 minutes via launchd. Catches the issue within ~5 min of an
 *   `npm update`, which is acceptable for a non-interactive system.
 *
 * Idempotency:
 *   If the gateway just restarted (so its start time > package mtime), the
 *   script no-ops. Safe to run as often as you want.
 *
 * Logs to `~/.openclaw/logs/gateway-update-watcher.log`.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = os.homedir();
const LOG_FILE = path.join(HOME, ".openclaw", "logs", "gateway-update-watcher.log");
const STATE_FILE = path.join(HOME, ".openclaw", "logs", "gateway-update-watcher-state.json");

const OPENCLAW_BIN = "/opt/homebrew/bin/openclaw";

// Likely locations for the global openclaw npm package. We'll use the first
// one that exists. Override with OPENCLAW_PACKAGE_DIR env if needed.
const OPENCLAW_PACKAGE_CANDIDATES = [
  process.env.OPENCLAW_PACKAGE_DIR,
  "/opt/homebrew/lib/node_modules/openclaw",
  "/usr/local/lib/node_modules/openclaw",
  path.join(HOME, ".npm-global", "lib", "node_modules", "openclaw"),
].filter(Boolean);

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function log(msg) {
  ensureDir(LOG_FILE);
  fs.appendFileSync(LOG_FILE, `[${ts()}] ${msg}\n`);
}

/** Find the openclaw package directory. Returns null if none exist. */
function findPackageDir() {
  for (const candidate of OPENCLAW_PACKAGE_CANDIDATES) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {}
  }
  return null;
}

/**
 * Get the mtime of the openclaw package. We look at the dist/ folder
 * specifically because that's what the running gateway loads — npm update
 * touches dist/ when it replaces chunks. Falls back to the package root if
 * dist/ doesn't exist.
 */
function getPackageMtimeMs(packageDir) {
  try {
    const distDir = path.join(packageDir, "dist");
    if (fs.existsSync(distDir)) {
      return fs.statSync(distDir).mtimeMs;
    }
    return fs.statSync(packageDir).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Get the start time (epoch ms) of the running openclaw-gateway process.
 * Returns null if no gateway is running.
 *
 * Uses `ps -o etime=` (elapsed time since process start) instead of lstart
 * because lstart is locale-dependent (Date.parse can't handle Spanish month
 * abbreviations like "abr."). etime is always `[[dd-]hh:]mm:ss`.
 */
function getGatewayStartMs() {
  // First find the PID
  const psResult = spawnSync("/bin/ps", ["-axo", "pid,comm"], { encoding: "utf-8" });
  if (psResult.status !== 0) return null;
  const lines = psResult.stdout.split("\n");
  let gatewayPid = null;
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (m && /openclaw-gateway/.test(m[2])) {
      gatewayPid = m[1];
      break;
    }
  }
  if (!gatewayPid) return null;

  // Get elapsed time in `[[dd-]hh:]mm:ss` format.
  const etimeResult = spawnSync("/bin/ps", ["-p", gatewayPid, "-o", "etime="], { encoding: "utf-8" });
  if (etimeResult.status !== 0) return null;
  const etime = etimeResult.stdout.trim();
  if (!etime) return null;

  const elapsedSec = parseElapsedTime(etime);
  if (elapsedSec === null) {
    log(`could not parse etime: ${etime}`);
    return null;
  }
  return Date.now() - elapsedSec * 1000;
}

/**
 * Parse `ps -o etime=` output (`[[dd-]hh:]mm:ss`) into seconds.
 *   "12:34"           → 12*60 + 34 = 754
 *   "01:02:03"        → 1*3600 + 2*60 + 3 = 3723
 *   "2-03:04:05"      → 2*86400 + 3*3600 + 4*60 + 5 = 183845
 */
function parseElapsedTime(str) {
  let days = 0;
  let rest = str;
  const dayMatch = rest.match(/^(\d+)-(.+)$/);
  if (dayMatch) {
    days = parseInt(dayMatch[1], 10);
    rest = dayMatch[2];
  }
  const parts = rest.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return null;
  let hours = 0,
    minutes = 0,
    seconds = 0;
  if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else if (parts.length === 1) {
    seconds = parts[0];
  } else {
    return null;
  }
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Trigger the gateway restart. Logs the result.
 */
function restartGateway(reason) {
  log(`triggering gateway restart — reason: ${reason}`);
  const result = spawnSync(OPENCLAW_BIN, ["gateway", "restart"], {
    encoding: "utf-8",
    timeout: 30 * 1000,
    env: process.env,
  });
  if (result.status === 0) {
    log(`gateway restart OK: ${result.stdout.trim()}`);
    return true;
  }
  log(`gateway restart FAILED (exit=${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return false;
}

// -- Main -------------------------------------------------------------------

function main() {
  const packageDir = findPackageDir();
  if (!packageDir) {
    log("no openclaw package directory found, aborting");
    process.exit(0);
  }

  const packageMtimeMs = getPackageMtimeMs(packageDir);
  const gatewayStartMs = getGatewayStartMs();

  if (gatewayStartMs === null) {
    log("no openclaw-gateway process found — gateway may be down, leaving alone");
    process.exit(0);
  }

  const driftMs = packageMtimeMs - gatewayStartMs;
  const driftS = Math.round(driftMs / 1000);

  log(
    `check: package_mtime=${new Date(packageMtimeMs).toISOString()} ` +
      `gateway_start=${new Date(gatewayStartMs).toISOString()} ` +
      `drift=${driftS}s`
  );

  if (packageMtimeMs > gatewayStartMs) {
    // Sanity check: only restart if the drift is at least 60 seconds. Filesystem
    // mtime resolution + races could otherwise trigger spurious restarts right
    // after a fresh restart.
    if (driftMs < 60 * 1000) {
      log(`drift positive but tiny (<60s), skipping restart to avoid race`);
      process.exit(0);
    }

    // Persist the last restart attempt so we don't loop on a failing restart
    let prev = {};
    try {
      if (fs.existsSync(STATE_FILE)) prev = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    } catch {}

    if (prev.lastRestartAttemptMtimeMs === packageMtimeMs && prev.lastRestartFailed) {
      log(`already attempted restart for this mtime and it failed, skipping (manual intervention needed)`);
      process.exit(1);
    }

    const ok = restartGateway(
      `package updated ${driftS}s after gateway start (${new Date(packageMtimeMs).toISOString()})`
    );
    ensureDir(STATE_FILE);
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          lastCheckAt: ts(),
          lastRestartAttemptMtimeMs: packageMtimeMs,
          lastRestartFailed: !ok,
        },
        null,
        2
      )
    );
    process.exit(ok ? 0 : 1);
  }

  log(`no drift detected, gateway is current`);
  process.exit(0);
}

main();
