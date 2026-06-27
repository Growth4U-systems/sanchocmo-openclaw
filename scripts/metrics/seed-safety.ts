const PRODUCTION_ENV_VALUES = new Set(["prod", "production", "live"]);
const PRODUCTION_DB_RE = /(^|[^a-z0-9])(prod|production|live)([^a-z0-9]|$)/i;

const ENV_KEYS = [
  "NODE_ENV",
  "VERCEL_ENV",
  "APP_ENV",
  "DEPLOY_ENV",
  "ENVIRONMENT",
] as const;

export type MetricSeedSafetyEnv = Partial<
  Record<(typeof ENV_KEYS)[number] | "DATABASE_URL" | "ALLOW_METRIC_SEED_PRODUCTION", string>
>;

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function databaseUrlLooksProduction(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    return PRODUCTION_DB_RE.test([
      url.hostname,
      url.pathname,
      url.username,
      url.search,
    ].join(" "));
  } catch {
    return PRODUCTION_DB_RE.test(databaseUrl);
  }
}

export function metricSeedProductionReasons(
  env: MetricSeedSafetyEnv = process.env,
): string[] {
  const reasons: string[] = [];
  for (const key of ENV_KEYS) {
    const value = normalized(env[key]);
    if (PRODUCTION_ENV_VALUES.has(value)) reasons.push(`${key}=${env[key]}`);
  }
  if (databaseUrlLooksProduction(env.DATABASE_URL)) {
    reasons.push("DATABASE_URL looks production-like");
  }
  return reasons;
}

export function assertMetricSeedTargetSafe(
  scriptName: string,
  env: MetricSeedSafetyEnv = process.env,
): void {
  const reasons = metricSeedProductionReasons(env);
  if (!reasons.length || env.ALLOW_METRIC_SEED_PRODUCTION === "1") return;

  console.error(
    `${scriptName}: refusing to write seed/demo metric rows to a production-like target (${reasons.join(", ")}). ` +
      "Set ALLOW_METRIC_SEED_PRODUCTION=1 only for an intentional emergency repair.",
  );
  process.exit(1);
}
