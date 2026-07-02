// GET /api/setup/status — first-run readiness checklist.
//
// Aggregates "what's still unconfigured" from the same signals the boot
// preflight (docker/entrypoint.sh section 0c) and the health check use, so the
// in-app /setup page can show a graphical version of it. Read-only: the page
// writes through the existing endpoints (POST /api/env, POST /api/clients/create)
// and the admin settings panels — this route never mutates anything.
//
// Admin-gated (compose(withErrorHandler, withAuth) + req.ctx.isAdmin). On a
// fresh box the admin logs in with the token the wizard printed; in local dev
// LOCAL_DASHBOARD_BYPASS grants admin on localhost. The pre-boot, pre-admin
// graphical installer is handled separately by SANCHO_SETUP_MODE (SAN-388 3b).
import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { hasAnthropicApiKey, hasAnthropicSubscriptionToken } from "@/lib/data/openclaw-config";
import { getServiceEnv, isServiceCredentialPresent } from "@/lib/health-check";
import { loadClients, loadClientsData } from "@/lib/data/clients";

interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  ok: boolean;
  detail?: string;
  action?: { label: string; href: string };
}

// Runtime value of KEY, preferring the live process.env over the parsed .env.
function envVal(key: string, fileEnv: Record<string, string>): string {
  return (process.env[key] || fileEnv[key] || "").trim();
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!req.ctx?.isAdmin) return res.status(403).json({ error: "Admin only" });

  const env = getServiceEnv();

  // --- Required: the app can't be USED without these -----------------------
  const anthropic = hasAnthropicApiKey() || hasAnthropicSubscriptionToken();
  const openai = isServiceCredentialPresent("openai", env) === true;
  const fireworks = isServiceCredentialPresent("fireworks", env) === true;
  const providers: string[] = [];
  if (anthropic) providers.push(hasAnthropicSubscriptionToken() ? "Anthropic (subscription)" : "Anthropic (API key)");
  if (openai) providers.push("OpenAI");
  if (fireworks) providers.push("Fireworks");

  const clientsData = loadClientsData();
  const brands = loadClients();
  const adminOk = !!(
    clientsData.adminToken ||
    (clientsData.adminEmails && clientsData.adminEmails.length > 0) ||
    envVal("ADMIN_EMAIL_DOMAIN", env)
  );

  const required: ChecklistItem[] = [
    {
      id: "model_credential",
      label: "Model provider connected",
      required: true,
      ok: anthropic || openai || fireworks,
      detail: providers.length ? providers.join(", ") : "No provider credential found",
      action: { label: "Add a provider key", href: "/dashboard/admin/settings?tab=apis" },
    },
    {
      id: "admin_access",
      label: "Admin access configured",
      required: true,
      ok: adminOk,
      detail: adminOk ? "Admin token / domain is set" : "No admin token, admin email or domain",
      action: { label: "Manage admins", href: "/dashboard/admin/users" },
    },
    {
      id: "first_brand",
      label: "First brand created",
      required: true,
      ok: brands.length > 0,
      detail: brands.length ? `${brands.length} brand(s): ${brands.map((b) => b.slug).join(", ")}` : "No brands yet",
    },
    {
      id: "core_secrets",
      label: "Core secrets generated",
      required: true,
      ok: !!process.env.NEXTAUTH_SECRET && !!process.env.ENCRYPTION_KEY,
      detail: "NEXTAUTH_SECRET + ENCRYPTION_KEY",
    },
  ];

  // --- Optional: nice-to-have integrations (never block "ready") -----------
  const optional: ChecklistItem[] = [
    {
      id: "google_login",
      label: "Google login",
      required: false,
      ok: !!(envVal("GOOGLE_CLIENT_ID", env) && envVal("GOOGLE_CLIENT_SECRET", env)),
      detail: "Sign in with Google (otherwise use the admin token)",
    },
    {
      id: "slack",
      label: "Slack",
      required: false,
      ok: isServiceCredentialPresent("slack", env) === true,
      detail: "Publish crons / notifications to Slack",
      action: { label: "Connect", href: "/dashboard/admin/settings?tab=apis" },
    },
    {
      id: "open_design",
      label: "Open Design",
      required: false,
      ok: !!envVal("OD_API_TOKEN", env),
      detail: "Agentic visual editor overlay (./sancho install --od)",
    },
    {
      id: "outreach_yalc",
      label: "Outreach (YALC)",
      required: false,
      ok: !!envVal("YALC_API_TOKEN", env),
      detail: "Cold outbound overlay (./sancho install --yalc)",
    },
  ];

  const ready = required.every((i) => i.ok);
  return res.status(200).json({ ready, required, optional });
}

export default compose(withErrorHandler, withAuth)(handler);
