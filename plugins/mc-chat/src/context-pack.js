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
 *   {
 *     slug, skill, summary, docPaths: string[],
 *     documents?: Array<{ path, kind, content, truncated }>,
 *     missingRequired?: string[],
 *     brandFound?: boolean,
 *     verdict: "ok"|"partial"|"missing"
 *   }
 */

/**
 * Fetch the context pack for (slug, skill) from Next. FAIL-SOFT by contract:
 * any non-OK response or thrown error returns null and logs a warning — the
 * caller must NOT block the dispatch on a missing pack (never crash the
 * gateway over grounding).
 *
 * @param {string} slug
 * @param {string|null} skill
 * @param {{ contextPackUrl?: string, nextServerUrl?: string, secret?: string, logger?: { warn?: Function }, fetchImpl?: Function }} opts
 * @returns {Promise<null | { slug: string, skill: string|null, summary: string, docPaths: string[], documents?: Array<object>, missingRequired?: string[], brandFound?: boolean, verdict: string }>}
 */
export async function fetchContextPack(slug, skill, opts = {}) {
  const contextPackUrl = resolveContextPackBaseUrl(opts);
  const secret = opts.secret;
  const logger = opts.logger;
  const doFetch = opts.fetchImpl || fetch;

  if (!slug) return null;

  const url = `${contextPackUrl}/api/chat/context-pack`;
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

export function resolveContextPackBaseUrl(opts = {}) {
  const raw =
    opts.contextPackUrl ||
    opts.nextServerUrl ||
    process.env.MC_CONTEXT_PACK_URL ||
    process.env.MC_NEXT_URL ||
    process.env.BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return String(raw).replace(/\/+$/, "");
}

/**
 * Build a bounded client-context block to PREPEND to the user text. Returns
 * "" when there is nothing useful to add (no pack, or empty pack), so the
 * caller can concatenate unconditionally.
 *
 * @param {null | { summary?: string, docPaths?: string[], documents?: Array<{ path?: string, kind?: string, content?: string, truncated?: boolean }>, missingRequired?: string[], verdict?: string }} pack
 * @returns {string}
 */
export function buildClientContextBlock(pack) {
  if (!pack) return "";
  const summary = typeof pack.summary === "string" ? pack.summary.trim() : "";
  const docPaths = Array.isArray(pack.docPaths) ? pack.docPaths.filter((p) => typeof p === "string" && p) : [];
  const documents = Array.isArray(pack.documents)
    ? pack.documents.filter((doc) => doc && typeof doc.content === "string" && doc.content.trim())
    : [];
  const missingRequired = Array.isArray(pack.missingRequired)
    ? pack.missingRequired.filter((p) => typeof p === "string" && p)
    : [];
  if (!summary && docPaths.length === 0 && documents.length === 0 && missingRequired.length === 0) return "";

  const lines = ["[Client Context]"];
  lines.push("Usa este contexto inyectado como fuente primaria. Si una ruta no existe en tu workspace de agente, NO hagas find/list para buscarla ni muestres errores de herramientas: pide el dato faltante con una pregunta corta.");
  if (summary) lines.push(summary);
  if (pack.verdict === "partial") {
    lines.push("Contexto incompleto: puedes avanzar con lo disponible, pero no inventes lo que falte.");
  }
  if (documents.length > 0) {
    lines.push("");
    lines.push("Contexto disponible:");
    for (const doc of documents) {
      const label = typeof doc.path === "string" && doc.path ? doc.path : "contexto";
      const kind = typeof doc.kind === "string" && doc.kind ? doc.kind : "file";
      lines.push("");
      lines.push(`--- ${label} (${kind}${doc.truncated ? ", truncado" : ""}) ---`);
      lines.push(doc.content.trim());
    }
  }
  if (missingRequired.length > 0) {
    lines.push("");
    lines.push("Contexto requerido no disponible en Mission Control:");
    for (const p of missingRequired) lines.push(`- ${p}`);
    lines.push("");
    lines.push("Si el usuario pidió trabajar con ese contexto, responde claramente: \"No están generados estos archivos de contexto inicial\" y lista las rutas. No lo describas como un fallo genérico de runtime.");
  }
  if (docPaths.length > 0) {
    lines.push("");
    lines.push("Rutas canonicas del contexto en el servidor MC (referencia, no requisito para responder):");
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
    `No están generados los archivos iniciales de contexto para ${slug}.`,
    "Falta Foundation / contexto base del cliente, por ejemplo company-brief, ECPs, competidores, posicionamiento o brand voice.",
    "NO inventes ni asumas el contexto del cliente. NO generes el entregable.",
    "Dilo así al usuario, con una explicación corta y accionable: hay que completar/generar Foundation antes de continuar.",
    "[/STOP]",
  ].join("\n");
}
