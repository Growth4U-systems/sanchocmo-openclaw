/**
 * Runtime-neutral context-pack helpers.
 *
 * Sancho core owns the context contract. Runtime adapters may use these helpers
 * to fetch a bounded context manifest from Next and prepend it to an agent turn
 * without knowing how the manifest is assembled.
 */

/**
 * Fetch the context pack for (slug, skill) from Next. FAIL-SOFT by contract:
 * any non-OK response or thrown error returns null and logs a warning. Runtime
 * adapters must not block dispatch on a missing pack.
 *
 * @param {string} slug
 * @param {string|null} skill
 * @param {{ contextPackUrl?: string, nextServerUrl?: string, secret?: string, logger?: { warn?: Function }, fetchImpl?: Function }} opts
 * @returns {Promise<null | { slug: string, skill: string|null, summary: string, docPaths: string[], verdict: string }>}
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
 * Build a bounded client-context block to prepend to the user text. Returns an
 * empty string when there is nothing useful to add.
 *
 * @param {null | { summary?: string, docPaths?: string[] }} pack
 * @returns {string}
 */
export function buildClientContextBlock(pack) {
  if (!pack) return "";
  const summary = typeof pack.summary === "string" ? pack.summary.trim() : "";
  const docPaths = Array.isArray(pack.docPaths) ? pack.docPaths.filter((p) => typeof p === "string" && p) : [];
  if (!summary && docPaths.length === 0) return "";

  const lines = ["[Client Context Manifest]"];
  if (summary) lines.push(summary);
  if (docPaths.length > 0) {
    lines.push("");
    lines.push("Documentos de contexto disponibles (lee de forma selectiva, no los cargues completos por defecto):");
    for (const p of docPaths) lines.push(`- ${p}`);
    lines.push("");
    lines.push("Regla de contexto: usa este resumen como base. Si necesitas detalle, inspecciona primero títulos/secciones y lee solo fragmentos relevantes. No vuelques documentos enteros al prompt ni repitas lecturas si ya tienes suficiente evidencia.");
  }
  lines.push("[/Client Context Manifest]");
  return lines.join("\n");
}

/**
 * Build a STOP directive for the case where the client has no Foundation.
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
