/**
 * context-pack — GROUND a directly-dispatched specialist (SAN-246).
 *
 * When the mc-chat gateway dispatches a thread straight to a specialist
 * (`agent:dulcinea`), nobody injected client context — the agent started
 * blind (instance of SAN-218). This module fetches a bounded context pack
 * from Next over HTTP and turns it into a prompt block that the gateway
 * prepends to the user text just before building `bodyForAgent`.
 *
 * Boundary: this plugin is ESM with `openclaw` as a peerDep and CANNOT import
 * the Next TS (`src/lib/…`). It talks to Next over HTTP only — the assembler
 * lives behind POST /api/chat/context-pack, protected by the same X-MC-Secret
 * shared secret used by the inbound/webhook contract.
 *
 * Pack shape (from src/lib/data/context-pack.ts):
 *   { slug, skill, summary, docPaths: string[], verdict: "ok"|"partial"|"missing" }
 */

/**
 * Fetch the context pack for (slug, skill) from Next. FAIL-SOFT by contract:
 * any non-OK response or thrown error returns null and logs a warning — the
 * caller must NOT block the dispatch on a missing pack (never crash the
 * gateway over grounding).
 *
 * @param {string} slug
 * @param {string|null} skill
 * @param {{ mcServerUrl?: string, secret?: string, logger?: { warn?: Function }, fetchImpl?: Function }} opts
 * @returns {Promise<null | { slug: string, skill: string|null, summary: string, docPaths: string[], verdict: string }>}
 */
export async function fetchContextPack(slug, skill, opts = {}) {
  const mcUrl = opts.mcServerUrl || "http://localhost:3000";
  const secret = opts.secret;
  const logger = opts.logger;
  const doFetch = opts.fetchImpl || fetch;

  if (!slug) return null;

  const url = `${mcUrl}/api/chat/context-pack`;
  const headers = {
    "Content-Type": "application/json",
    ...(secret ? { "X-MC-Secret": secret } : {}),
  };

  try {
    const res = await doFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ slug, skill: skill || undefined }),
    });
    if (!res || !res.ok) {
      logger?.warn?.(
        `[mc-chat] context-pack fetch non-OK (slug=${slug} skill=${skill || "-"}): HTTP ${res?.status}`,
      );
      return null;
    }
    const pack = await res.json();
    if (!pack || typeof pack !== "object") return null;
    return pack;
  } catch (err) {
    logger?.warn?.(
      `[mc-chat] context-pack fetch failed (slug=${slug} skill=${skill || "-"}): ${err?.message || err}`,
    );
    return null;
  }
}

/**
 * Build a bounded client-context block to PREPEND to the user text. Returns
 * "" when there is nothing useful to add (no pack, or empty pack), so the
 * caller can concatenate unconditionally.
 *
 * @param {null | { summary?: string, docPaths?: string[] }} pack
 * @returns {string}
 */
export function buildClientContextBlock(pack) {
  if (!pack) return "";
  const summary = typeof pack.summary === "string" ? pack.summary.trim() : "";
  const docPaths = Array.isArray(pack.docPaths) ? pack.docPaths.filter((p) => typeof p === "string" && p) : [];
  if (!summary && docPaths.length === 0) return "";

  const lines = ["[Client Context]"];
  if (summary) lines.push(summary);
  if (docPaths.length > 0) {
    lines.push("");
    lines.push("Documentos de contexto del cliente (LÉELOS de disco antes de responder):");
    for (const p of docPaths) lines.push(`- ${p}`);
  }
  lines.push("[/Client Context]");
  return lines.join("\n");
}

/**
 * Build a STOP directive for the case where the client has no Foundation
 * (verdict==="missing"). The agent must NOT invent context — it should stop
 * and route the user to kickoff. Prepended in place of the context block.
 *
 * @param {null | { slug?: string }} pack
 * @returns {string}
 */
export function buildFoundationDirective(pack) {
  const slug = pack?.slug ? String(pack.slug) : "este cliente";
  return [
    "[STOP — Foundation missing]",
    `No hay Foundation en disco para ${slug}: te falta el contexto del cliente (company-brief, brand-voice, positioning…).`,
    "NO inventes ni asumas el contexto del cliente. NO generes el entregable.",
    "Indica al usuario que primero hay que completar el kickoff / Foundation de este cliente y detente.",
    "[/STOP]",
  ].join("\n");
}
