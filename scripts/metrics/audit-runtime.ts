import { getMetricsRuntimeAudit } from "@/lib/data/metrics-audit";

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

async function main() {
  const slug = arg("slug");
  if (!slug) {
    console.error("Usage: tsx scripts/metrics/audit-runtime.ts --slug <client> [--range 30d|90d] [--from YYYY-MM-DD --to YYYY-MM-DD]");
    process.exit(1);
  }

  const audit = await getMetricsRuntimeAudit(slug, {
    from: arg("from"),
    range: arg("range"),
    to: arg("to"),
  });
  console.log(JSON.stringify(audit, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
