/**
 * Tests del cliente SSE del Trust Score Analyzer (SAN-194).
 *
 * client.ts hace fetch a un analyzer y consume un stream SSE de frames
 * `data: {JSON}\n\n`. Aquí mockeamos globalThis.fetch para devolver una
 * Response cuyo body es un ReadableStream que emite Uint8Array, troceando
 * los frames a voluntad para simular el chunking de red.
 *
 * Cubre: parseo normal, frame partido entre chunks, flush del último frame
 * sin "\n\n" de cierre, evento "error", stream sin evento terminal, mapeo
 * de discover (website->url, name->name, máximo 4) y timeout.
 *
 * Corre con: npx tsx --test src/lib/__tests__/trust-score-client.test.mts
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";

type Mod = typeof import("../trust-score/client");
let mod: Mod;
let runCompare: Mod["runCompare"];
let discoverCompetitors: Mod["discoverCompetitors"];

const origFetch = globalThis.fetch;

before(async () => {
  mod = await import("../trust-score/client");
  runCompare = mod.runCompare;
  discoverCompetitors = mod.discoverCompetitors;
});
after(() => {
  globalThis.fetch = origFetch;
});
afterEach(() => {
  globalThis.fetch = origFetch;
});

const enc = new TextEncoder();

/** Construye una mock Response cuyo body emite los chunks dados (strings -> bytes). */
function streamResponse(chunks: string[], init: { ok?: boolean; status?: number } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body,
  } as unknown as Response;
}

/** Instala un fetch mock que devuelve una Response fija. */
function mockFetch(resp: Response): void {
  globalThis.fetch = (async () => resp) as unknown as typeof fetch;
}

/** Frame SSE bien formado (con cierre "\n\n"). */
function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// ---------------------------------------------------------------------------
// runCompare
// ---------------------------------------------------------------------------

test("1. runCompare parsea un 'result' en un frame normal terminado en \\n\\n", async () => {
  const payload = {
    primary: { url: "https://acme.com", trust_score: 72 },
    competitors: [{ url: "https://rival.com", trust_score: 65 }],
    comparison: { verdict: "acme lidera" },
  };
  mockFetch(streamResponse([frame({ type: "result", data: payload })]));

  const res = await runCompare("https://acme.com", [{ url: "https://rival.com" }]);
  assert.deepEqual(res, payload);
  assert.equal(res.primary.trust_score, 72);
  assert.equal(res.competitors[0].url, "https://rival.com");
  assert.equal(res.comparison.verdict, "acme lidera");
});

test("2. un frame partido entre DOS chunks (JSON cortado a la mitad) se reensambla y parsea", async () => {
  const payload = {
    primary: { url: "https://acme.com", trust_score: 80 },
    competitors: [],
    comparison: { verdict: "ok" },
  };
  const full = frame({ type: "result", data: payload });
  // Cortamos en medio del JSON (no en un límite de frame).
  const mid = Math.floor(full.length / 2);
  mockFetch(streamResponse([full.slice(0, mid), full.slice(mid)]));

  const res = await runCompare("https://acme.com", []);
  assert.deepEqual(res, payload);
  assert.equal(res.primary.trust_score, 80);
});

test("3. FLUSH final: un frame terminal SIN '\\n\\n' de cierre IGUAL se parsea", async () => {
  const payload = {
    primary: { url: "https://acme.com", trust_score: 91 },
    competitors: [],
    comparison: { verdict: "flush ok" },
  };
  // Sin "\n\n" de cierre: simula un proxy que entrega el último frame sin terminador.
  mockFetch(streamResponse([`data: ${JSON.stringify({ type: "result", data: payload })}`]));

  const res = await runCompare("https://acme.com", []);
  assert.deepEqual(res, payload);
  assert.equal(res.comparison.verdict, "flush ok");
});

test("4. un evento type:'error' hace que runCompare lance con el mensaje del evento", async () => {
  mockFetch(streamResponse([frame({ type: "error", message: "analyzer reventó" })]));

  await assert.rejects(
    () => runCompare("https://acme.com", []),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /analyzer reventó/);
      return true;
    },
  );
});

test("4b. evento 'error' sin message lanza el fallback genérico", async () => {
  mockFetch(streamResponse([frame({ type: "error" })]));

  await assert.rejects(
    () => runCompare("https://acme.com", []),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /error en el stream/);
      return true;
    },
  );
});

test("5. un stream que termina sin 'result' lanza Error con 'terminó sin evento result'", async () => {
  // Solo frames de progreso, ningún 'result'.
  mockFetch(
    streamResponse([
      frame({ type: "progress", step: "scoring primary" }),
      frame({ type: "progress", step: "scoring competitor" }),
    ]),
  );

  await assert.rejects(
    () => runCompare("https://acme.com", []),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /terminó sin evento result/);
      return true;
    },
  );
});

test("5b. runCompare lanza con el status en HTTP no-ok", async () => {
  mockFetch(streamResponse([], { ok: false, status: 503 }));

  await assert.rejects(
    () => runCompare("https://acme.com", []),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /HTTP 503/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// discoverCompetitors
// ---------------------------------------------------------------------------

test("6. discoverCompetitors mapea website->url, name->name y toma máximo 4", async () => {
  const data = [
    { website: "uno.com", name: "Uno", relevance_score: 0.9 },
    { website: "dos.com", name: "Dos" },
    { website: "tres.com", name: "Tres" },
    { website: "cuatro.com", name: "Cuatro" },
    { website: "cinco.com", name: "Cinco" }, // este debe quedar fuera (tope 4)
  ];
  mockFetch(streamResponse([frame({ type: "competitors", data })]));

  const res = await discoverCompetitors("https://acme.com");
  assert.equal(res.length, 4);
  assert.deepEqual(res, [
    { url: "uno.com", name: "Uno" },
    { url: "dos.com", name: "Dos" },
    { url: "tres.com", name: "Tres" },
    { url: "cuatro.com", name: "Cuatro" },
  ]);
});

test("6b. discover filtra entradas sin website y respeta limit explícito", async () => {
  const data = [
    { website: "uno.com", name: "Uno" },
    { website: "", name: "SinWeb" }, // filtrada (website vacío)
    { name: "SinCampo" }, // filtrada (sin website)
    { website: "dos.com", name: "Dos" },
    { website: "tres.com", name: "Tres" },
  ];
  mockFetch(streamResponse([frame({ type: "competitors", data })]));

  const res = await discoverCompetitors("https://acme.com", { limit: 2 });
  assert.deepEqual(res, [
    { url: "uno.com", name: "Uno" },
    { url: "dos.com", name: "Dos" },
  ]);
});

test("7. discover sin evento 'competitors' LANZA 'terminó sin evento competitors' (no devuelve [] silenciosamente)", async () => {
  // El stream se corta antes del evento terminal (server caído / kill de Vercel).
  mockFetch(
    streamResponse([
      frame({ type: "progress", step: "buscando con Gemini" }),
      frame({ type: "progress", step: "buscando con Perplexity" }),
    ]),
  );

  await assert.rejects(
    () => discoverCompetitors("https://acme.com"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /terminó sin evento competitors/);
      return true;
    },
  );
});

test("7b. discover propaga evento 'error' del stream", async () => {
  mockFetch(streamResponse([frame({ type: "error", message: "discover falló" })]));

  await assert.rejects(
    () => discoverCompetitors("https://acme.com"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /discover falló/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// timeout
// ---------------------------------------------------------------------------

/**
 * fetch que "cuelga": nunca resuelve por su cuenta, pero respeta el AbortSignal
 * que le pasa el cliente (AbortSignal.timeout). Cuando el signal dispara, rechaza
 * con el TimeoutError real (signal.reason), igual que el fetch nativo. Así el
 * catch de runCompare/discover lo traduce a "...: timeout tras Nms".
 */
function hangingFetchThatHonorsAbort(): typeof fetch {
  return ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return; // sin signal no abortaría nunca; el cliente siempre pasa uno
      // El timer interno de AbortSignal.timeout va unref'd: si la única tarea
      // pendiente es esta promesa, el loop se considera drenado antes de que
      // dispare. Un timer ref'd mantiene vivo el loop hasta que aborte.
      const keepAlive = setTimeout(() => {}, 60_000);
      const onAbort = () => {
        clearTimeout(keepAlive);
        const reason = (signal as AbortSignal & { reason?: unknown }).reason;
        if (reason instanceof Error) reject(reason);
        else {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        }
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    })) as unknown as typeof fetch;
}

test("8. un fetch que cuelga + timeoutMs chico produce un error con 'timeout'", async () => {
  globalThis.fetch = hangingFetchThatHonorsAbort();

  await assert.rejects(
    () => runCompare("https://acme.com", [], { timeoutMs: 20 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /timeout/);
      return true;
    },
  );
});

test("8b. discoverCompetitors traduce el timeout a 'timeout'", async () => {
  globalThis.fetch = hangingFetchThatHonorsAbort();

  await assert.rejects(
    () => discoverCompetitors("https://acme.com", { timeoutMs: 20 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /timeout/);
      return true;
    },
  );
});
