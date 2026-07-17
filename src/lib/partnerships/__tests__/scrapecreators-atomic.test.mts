import assert from "node:assert/strict";
import test from "node:test";
import {
  ScrapeCreatorsAtomicError,
  createScrapeCreatorsAtomicClient,
} from "../scrapecreators-atomic";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("cada método hace un único fetch y usa los endpoints oficiales", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path === "/v1/instagram/search/profiles") {
      return json({ profiles: [{ username: "doctora_capilar" }] });
    }
    if (path === "/v1/instagram/profile") {
      return json({ data: { user: { username: "doctora_capilar" } } });
    }
    return json({ items: [] });
  }) as typeof fetch;
  const client = createScrapeCreatorsAtomicClient({
    apiKey: "test-secret-key",
    fetchImpl,
  });

  await client.searchProfilesOnce("salud capilar");
  await client.getProfileOnce("@doctora_capilar");
  await client.getPostsOnce("doctora_capilar");

  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map(({ url }) => new URL(url).pathname),
    [
      "/v1/instagram/search/profiles",
      "/v1/instagram/profile",
      "/v2/instagram/user/posts",
    ],
  );
  assert.ok(
    calls.every(({ url }) => url.startsWith("https://api.scrapecreators.com/")),
  );
  assert.ok(calls.every(({ init }) => init?.redirect === "error"));
  assert.ok(
    calls.every(
      ({ init }) =>
        (init?.headers as Record<string, string>)["x-api-key"] ===
        "test-secret-key",
    ),
  );
  assert.equal(
    new URL(calls[0].url).searchParams.get("query"),
    "salud capilar",
  );
});

test("searchProfilesOnce normaliza, deduplica y limita el resultado persistible", async () => {
  let calls = 0;
  const noisyProfiles = [
    {
      username: "clinica_a",
      full_name: "  Clínica   A  ",
      follower_count: "50000",
      raw_private_payload: "must-not-escape",
    },
    { username: "@CLINICA_A", full_name: "duplicada" },
    { handle: "doctor.b", name: "Doctor B", followers: 81_000 },
    { username: "invalid handle" },
    ...Array.from({ length: 30 }, (_, index) => ({
      username: `extra_${index}`,
    })),
  ];
  const client = createScrapeCreatorsAtomicClient({
    apiKey: "key",
    baseUrl: "http://127.0.0.1:9999/",
    fetchImpl: (async () => {
      calls += 1;
      return json({ success: true, data: { profiles: noisyProfiles } });
    }) as typeof fetch,
  });

  const profiles = await client.searchProfilesOnce("  salud capilar  ");

  assert.equal(calls, 1);
  assert.equal(profiles.length, 20);
  assert.deepEqual(profiles[0], {
    handle: "@clinica_a",
    name: "Clínica A",
    followers: 50_000,
  });
  assert.deepEqual(profiles[1], {
    handle: "@doctor.b",
    name: "Doctor B",
    followers: 81_000,
  });
  assert.equal(JSON.stringify(profiles).includes("must-not-escape"), false);
});

test("getProfileOnce devuelve sólo el perfil compacto normalizado", async () => {
  let requestedUrl = "";
  const client = createScrapeCreatorsAtomicClient({
    apiKey: "key",
    baseUrl: "https://provider.test",
    fetchImpl: (async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return json({
        data: {
          user: {
            username: "doctora_capilar",
            full_name: " Doctora   Capilar ",
            biography: " Salud   capilar para mujeres ",
            edge_followed_by: { count: 72_500 },
            category_name: "Health/Beauty",
            external_url: "https://doctora.example",
            business_email: "hola@doctora.example",
            session_token: "must-not-escape",
          },
        },
      });
    }) as typeof fetch,
  });

  const profile = await client.getProfileOnce("@doctora_capilar");

  assert.equal(
    new URL(requestedUrl).searchParams.get("handle"),
    "doctora_capilar",
  );
  assert.deepEqual(profile, {
    handle: "@doctora_capilar",
    name: "Doctora Capilar",
    biography: "Salud capilar para mujeres",
    followers: 72_500,
    category: "Health/Beauty",
    externalUrl: "https://doctora.example",
    email: "hola@doctora.example",
    profileUrl: "https://www.instagram.com/doctora_capilar/",
  });
  assert.equal(JSON.stringify(profile).includes("session_token"), false);
});

test("getPostsOnce compacta seis posts y normaliza métricas, caption y fecha", async () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    code: `post-${index}`,
    caption: { text: ` Post   ${index} para mujeres ` },
    like_count: String(100 + index),
    comment_count: index,
    taken_at: 1_783_000_000 + index,
    owner: { private_raw_data: "must-not-escape" },
  }));
  const client = createScrapeCreatorsAtomicClient({
    apiKey: "key",
    baseUrl: "https://provider.test",
    fetchImpl: (async () => json({ success: true, items })) as typeof fetch,
  });

  const posts = await client.getPostsOnce("@doctora_capilar");

  assert.equal(posts.length, 6);
  assert.deepEqual(posts[0], {
    id: "post-0",
    caption: "Post 0 para mujeres",
    url: "https://www.instagram.com/p/post-0/",
    likes: 100,
    comments: 0,
    publishedAt: new Date(1_783_000_000_000).toISOString(),
  });
  assert.equal(JSON.stringify(posts).includes("must-not-escape"), false);
});

test("un fallo HTTP no reintenta y nunca expone body ni api key", async () => {
  let calls = 0;
  const secret = "super-secret-key";
  const providerBodySecret = "private-provider-detail";
  const client = createScrapeCreatorsAtomicClient({
    apiKey: secret,
    baseUrl: "https://provider.test",
    fetchImpl: (async () => {
      calls += 1;
      return json({ message: providerBodySecret }, 503);
    }) as typeof fetch,
  });

  await assert.rejects(
    client.searchProfilesOnce("salud capilar"),
    (error: unknown) => {
      assert.ok(error instanceof ScrapeCreatorsAtomicError);
      assert.equal(error.code, "provider_error");
      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.message.includes(providerBodySecret), false);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("el timeout aborta el único fetch sin retry", async () => {
  let calls = 0;
  const client = createScrapeCreatorsAtomicClient({
    apiKey: "key",
    timeoutMs: 15,
    baseUrl: "http://localhost:9999",
    fetchImpl: ((_: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    }) as typeof fetch,
  });

  await assert.rejects(client.getPostsOnce("clinic_a"), (error: unknown) => {
    assert.ok(error instanceof ScrapeCreatorsAtomicError);
    assert.equal(error.code, "timeout");
    assert.equal(error.retryable, true);
    return true;
  });
  assert.equal(calls, 1);
});

test("rechaza input inválido antes de llamar al provider", async () => {
  let calls = 0;
  const client = createScrapeCreatorsAtomicClient({
    apiKey: "key",
    fetchImpl: (async () => {
      calls += 1;
      return json({});
    }) as typeof fetch,
  });

  await assert.rejects(client.searchProfilesOnce("   "), /query/);
  await assert.rejects(client.getProfileOnce("invalid handle"), /handle/);
  assert.equal(calls, 0);
  assert.throws(
    () =>
      createScrapeCreatorsAtomicClient({
        apiKey: "key",
        baseUrl: "http://provider.example",
      }),
    /HTTPS/,
  );
});
