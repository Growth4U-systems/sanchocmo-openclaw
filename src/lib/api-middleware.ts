import type { NextApiRequest, NextApiResponse } from "next";

// ============================================================
// API Middleware — Auth, validation, error handling
// Coexistence: supports both NextAuth sessions AND legacy tokens
// ============================================================

export type ApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void> | void;

export interface RequestContext {
  isAdmin: boolean;
  clientSlug: string | null;
  // Slugs a multi-client team member is restricted to. null = no restriction
  // (admin, or a single-client portal user scoped by `clientSlug`).
  allowedSlugs: string[] | null;
  adminToken: string | null;
  portalClient: { slug: string; name: string } | null;
}

/**
 * Whether the request's auth context is allowed to act on a given client slug.
 *
 * - admin → all
 * - multi-client member → only slugs in allowedSlugs
 * - single-client portal → only their clientSlug
 */
export function canAccessSlug(ctx: RequestContext | undefined, slug: string): boolean {
  if (!ctx) return false;
  if (ctx.isAdmin) return true;
  if (ctx.allowedSlugs) return ctx.allowedSlugs.includes(slug);
  if (ctx.clientSlug) return ctx.clientSlug === slug;
  return false;
}

// Attach context to request
declare module "next" {
  interface NextApiRequest {
    ctx?: RequestContext;
  }
}

/**
 * Method filter — returns 405 for disallowed methods
 */
export function withMethod(methods: string[], handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    if (!methods.includes(req.method || "")) {
      res.setHeader("Allow", methods.join(", "));
      res.status(405).json({ error: `Method ${req.method} not allowed` });
      return;
    }
    return handler(req, res);
  };
}

/**
 * Error handler wrapper — catches unhandled errors
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error(`[API Error] ${req.method} ${req.url}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  };
}

/**
 * Auth middleware — validates legacy tokens (admin or portal)
 * In Phase 2, this will also check NextAuth sessions
 */
export function withAuth(handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    const ctx = await resolveAuth(req, res);
    req.ctx = ctx;

    if (!ctx.isAdmin && !ctx.clientSlug && !(ctx.allowedSlugs && ctx.allowedSlugs.length)) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    return handler(req, res);
  };
}

/**
 * Auth middleware that also requires a specific slug.
 * The slug must be one the caller can access (own slug, allowed list, or admin).
 */
export function withSlugAuth(handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    const ctx = await resolveAuth(req, res);
    req.ctx = ctx;

    if (!ctx.isAdmin && !ctx.clientSlug && !(ctx.allowedSlugs && ctx.allowedSlugs.length)) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    // Get slug from query or body
    const slug =
      (req.query.slug as string) ||
      (req.method === "GET" ? null : req.body?.slug);

    if (!slug) {
      res.status(400).json({ error: "Missing slug" });
      return;
    }

    // Caller may only access slugs they are scoped to
    if (!canAccessSlug(ctx, slug)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    return handler(req, res);
  };
}

/**
 * Resolve auth from request headers/query
 * Supports:
 * - Authorization: Bearer <token>
 * - ?token=<token> (legacy)
 * - x-admin-token header
 */
async function resolveAuth(req: NextApiRequest, res: NextApiResponse): Promise<RequestContext> {
  const { loadClientsData } = await import("@/lib/data/clients");
  const data = loadClientsData();
  const adminToken = data.adminToken || process.env.MC_ADMIN_TOKEN || null;
  const clients = data.clients || [];

  // Extract token from various sources
  let token: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  token = token || (req.headers["x-admin-token"] as string) || (req.query.token as string) || null;

  // Check admin
  if (token && adminToken && token === adminToken) {
    return {
      isAdmin: true,
      clientSlug: null,
      allowedSlugs: null,
      adminToken: token,
      portalClient: null,
    };
  }

  // Check portal client
  if (token && token.length >= 16) {
    const client = clients.find(
      (c: { mcToken?: string; slug: string; name: string }) => c.mcToken === token
    );
    if (client) {
      return {
        isAdmin: false,
        clientSlug: client.slug,
        allowedSlugs: null,
        adminToken: null,
        portalClient: { slug: client.slug, name: client.name },
      };
    }
  }

  // Check NextAuth session (for browser requests with cookies)
  try {
    const { getServerSession } = await import("next-auth/next");
    const { authOptions } = await import("@/pages/api/auth/[...nextauth]");
    const session = await getServerSession(req, res, authOptions);
    if (session?.user) {
      const role = (session.user as { role?: string }).role;
      const clientSlug = (session.user as { clientSlug?: string | null }).clientSlug;
      const allowed = (session.user as { allowedSlugs?: string[] | null }).allowedSlugs;
      return {
        isAdmin: role === "admin",
        clientSlug: clientSlug || null,
        allowedSlugs: allowed && allowed.length ? allowed : null,
        adminToken: null,
        portalClient: clientSlug ? { slug: clientSlug, name: session.user.name || "" } : null,
      };
    }
  } catch {
    // NextAuth not available or session check failed — continue without
  }

  // No auth
  return {
    isAdmin: false,
    clientSlug: null,
    allowedSlugs: null,
    adminToken: null,
    portalClient: null,
  };
}

/**
 * Compose multiple middleware wrappers
 */
export function compose(...wrappers: ((h: ApiHandler) => ApiHandler)[]) {
  return (handler: ApiHandler): ApiHandler => {
    return wrappers.reduceRight((h, wrapper) => wrapper(h), handler);
  };
}

/**
 * Helper to get slug from request (query param, body, or portal context)
 */
export function getSlug(req: NextApiRequest): string | null {
  return (
    (req.query.slug as string) ||
    req.body?.slug ||
    req.ctx?.clientSlug ||
    null
  );
}
