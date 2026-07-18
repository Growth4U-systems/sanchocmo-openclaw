import type { DiscoveryPlan, RawDiscoveryCandidate } from "./discovery-types";
import { resolvePartnershipsDiscoveryRuntimeContract } from "./discovery-runtime-contract";

const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";
const DEFAULT_TARGET_CANDIDATES = 40;
const MAX_TARGET_CANDIDATES = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 5;
const MAX_SEARCH_PAGES_PER_QUERY = 5;
const SEARCH_POOL_MULTIPLIER = 3;

type JsonRecord = Record<string, unknown>;

class ScrapeCreatorsRequestError extends Error {
  retryable: boolean;
  retryAfterMs: number;

  constructor(message: string, retryable = false, retryAfterMs = 0) {
    super(message);
    this.name = "ScrapeCreatorsRequestError";
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface SearchProfile {
  username?: string;
  full_name?: string;
  follower_count?: number;
}

export interface InstagramProfileUser {
  username?: string;
  full_name?: string;
  biography?: string;
  is_private?: boolean;
  category_name?: string;
  external_url?: string;
  business_email?: string;
  is_business_account?: boolean;
  is_professional_account?: boolean;
  edge_followed_by?: { count?: number };
}

export interface InstagramPost {
  like_count?: number;
  comment_count?: number;
  taken_at?: number | string;
  taken_at_timestamp?: number | string;
  caption?: { text?: string } | string | null;
  code?: string;
  url?: string;
}

export interface LiveDiscoveryQueries {
  profileQueries: string[];
  hashtags: string[];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cursorFromResponse(body: unknown): string | undefined {
  const root = asRecord(body);
  const data = asRecord(root.data);
  const cursor = root.cursor ?? data.cursor;
  if (typeof cursor === "number" && Number.isFinite(cursor))
    return String(cursor);
  return asString(cursor);
}

function profileListFromResponse(body: unknown): SearchProfile[] {
  const root = asRecord(body);
  const data = asRecord(root.data);
  const profiles = asArray(root.profiles).length
    ? asArray(root.profiles)
    : asArray(data.profiles || data.users || root.users);
  return profiles.map((item) => asRecord(item) as SearchProfile);
}

function hashtagProfilesFromResponse(body: unknown): SearchProfile[] {
  const root = asRecord(body);
  const data = asRecord(root.data);
  const posts = asArray(root.posts).length
    ? asArray(root.posts)
    : asArray(data.posts || data.items);
  return posts
    .map((post) => asRecord(asRecord(post).owner))
    .filter((owner) => asString(owner.username))
    .map((owner) => ({
      username: asString(owner.username),
      full_name: asString(owner.full_name),
      follower_count: asNumber(owner.follower_count),
    }));
}

function profileFromResponse(body: unknown): InstagramProfileUser {
  const root = asRecord(body);
  const data = asRecord(root.data);
  return asRecord(
    data.user || root.user || root.profile,
  ) as InstagramProfileUser;
}

function postsFromResponse(body: unknown): InstagramPost[] {
  const root = asRecord(body);
  const data = asRecord(root.data);
  const items = asArray(root.items).length
    ? asArray(root.items)
    : asArray(data.items || data.posts || root.posts);
  return items.map((item) => asRecord(item) as InstagramPost);
}

function tierForFollowers(followers: number | undefined): string | null {
  if (followers === undefined || followers < 0) return null;
  if (followers < 25_000) return "nano";
  if (followers < 100_000) return "micro";
  if (followers < 250_000) return "mid";
  return "macro";
}

export function matchesWantedTier(
  followers: number | undefined,
  wantedTiers: Set<string>,
  allowUnknown = true,
): boolean {
  if (wantedTiers.size === 0) return true;
  const tier = tierForFollowers(followers);
  // Keep unknown follower counts in the search pool: the profile detail call
  // normally fills them and the definitive check happens after enrichment.
  return tier === null ? allowUnknown : wantedTiers.has(tier);
}

function normalizeHashtagTerm(value: string): string {
  return value
    .trim()
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/gi, "")
    .toLowerCase();
}

export function buildLiveDiscoveryQueries(
  plan: DiscoveryPlan,
): LiveDiscoveryQueries {
  const profileQueries = Array.from(
    new Set(plan.sectors.map((sector) => sector.trim()).filter(Boolean)),
  );
  const explicitHashtags = plan.hashtags ?? [];
  const derivedHashtags = plan.sectors.map(normalizeHashtagTerm);
  const hashtags = Array.from(
    new Set(
      [...explicitHashtags, ...derivedHashtags]
        .map(normalizeHashtagTerm)
        .filter(Boolean),
    ),
  );
  return { profileQueries, hashtags };
}

function sectorTokens(plan: DiscoveryPlan): string[] {
  return plan.sectors
    .flatMap((sector) => sector.toLowerCase().split(/[^a-záéíóúüñ0-9]+/i))
    .filter((token) => token.length >= 3);
}

function captionText(post: InstagramPost): string {
  if (typeof post.caption === "string") return post.caption;
  if (post.caption && typeof post.caption === "object")
    return post.caption.text || "";
  return "";
}

function postTimestampMs(post: InstagramPost): number | undefined {
  const raw = post.taken_at ?? post.taken_at_timestamp;
  if (typeof raw === "string" && raw.trim() && !Number.isFinite(Number(raw))) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const numeric = asNumber(raw);
  if (numeric === undefined) return undefined;
  return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
}

function computeCetAlignmentPct(posts: InstagramPost[]): number | undefined {
  const hourFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const hours = posts
    .map(postTimestampMs)
    .filter((value): value is number => value !== undefined)
    .map((value) => Number(hourFormatter.format(new Date(value))))
    .filter(Number.isFinite);
  if (hours.length === 0) return undefined;
  const aligned = hours.filter((hour) => hour >= 7 && hour <= 23).length;
  return Math.round((aligned / hours.length) * 100);
}

function computePostsPerWeek(posts: InstagramPost[]): {
  postsPerWeek?: number;
  longGapsLast6Months?: number;
} {
  const times = posts
    .map(postTimestampMs)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  if (times.length < 2) return {};
  const days = Math.max(1, (times[times.length - 1] - times[0]) / 86_400_000);
  let longGaps = 0;
  for (let i = 1; i < times.length; i += 1) {
    if ((times[i] - times[i - 1]) / 86_400_000 > 14) longGaps += 1;
  }
  return {
    postsPerWeek: Number(((times.length / days) * 7).toFixed(2)),
    longGapsLast6Months: longGaps,
  };
}

export function computeCandidate(
  profile: SearchProfile,
  detail: InstagramProfileUser,
  posts: InstagramPost[],
  plan: DiscoveryPlan,
): RawDiscoveryCandidate | null {
  const username = profile.username || detail.username;
  if (!username) return null;
  const followers = detail.edge_followed_by?.count ?? profile.follower_count;
  const totalEngagement = posts.reduce(
    (sum, post) => sum + (post.like_count || 0) + (post.comment_count || 0),
    0,
  );
  const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;
  const engagementRatePct =
    followers && followers > 0
      ? Number(((avgEngagement / followers) * 100).toFixed(2))
      : undefined;
  const text = [
    detail.biography,
    detail.category_name,
    ...posts.map(captionText),
  ]
    .filter(Boolean)
    .join("\n");
  const tokens = sectorTokens(plan);
  const matchedTokens = tokens.filter((token) =>
    text.toLowerCase().includes(token),
  ).length;
  const verticalMatchShare =
    tokens.length > 0 ? Math.min(1, matchedTokens / tokens.length) : undefined;
  const { postsPerWeek, longGapsLast6Months } = computePostsPerWeek(posts);
  const normalizedUsername = username.replace(/^@/, "");
  const cetAlignmentPct = computeCetAlignmentPct(posts);
  const latestPost = posts[0];
  const customVariables = Object.fromEntries(
    Object.entries({
      nombre_perfil: asString(detail.full_name || profile.full_name),
      categoria: asString(detail.category_name),
      biografia: asString(detail.biography),
      enlace_bio: asString(detail.external_url),
      email_publico: asString(detail.business_email),
      ultimo_post_texto: latestPost
        ? asString(captionText(latestPost))
        : undefined,
      ultimo_post_url: latestPost ? asString(latestPost.url) : undefined,
      sector_plan:
        plan.sectors
          .map((sector) => sector.trim())
          .filter(Boolean)
          .join(" · ") || undefined,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const account = {
    ...(typeof detail.is_business_account === "boolean"
      ? { businessAccount: detail.is_business_account }
      : {}),
    ...(typeof detail.is_professional_account === "boolean"
      ? { professionalAccount: detail.is_professional_account }
      : {}),
  };

  return {
    handle: `@${normalizedUsername}`,
    network: "instagram",
    name: detail.full_name || profile.full_name || normalizedUsername,
    profileUrl: `https://www.instagram.com/${normalizedUsername}/`,
    ...(detail.business_email ? { email: detail.business_email } : {}),
    ...(followers !== undefined ? { followers } : {}),
    ...(engagementRatePct !== undefined ? { engagementRatePct } : {}),
    ...(Object.keys(customVariables).length > 0 ? { customVariables } : {}),
    ...(Object.keys(account).length > 0 ? { account } : {}),
    signals: {
      ...(verticalMatchShare !== undefined ? { verticalMatchShare } : {}),
      adLibraryChecked: false,
      ...(cetAlignmentPct !== undefined ? { cetAlignmentPct } : {}),
      ...(postsPerWeek !== undefined ? { postsPerWeek } : {}),
      ...(longGapsLast6Months !== undefined ? { longGapsLast6Months } : {}),
    },
  };
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] || "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function targetCandidates(plan: DiscoveryPlan): number {
  const envCap = positiveIntFromEnv(
    "PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES",
    MAX_TARGET_CANDIDATES,
  );
  const requested = Number.isFinite(plan.targetVolume)
    ? Math.floor(plan.targetVolume as number)
    : DEFAULT_TARGET_CANDIDATES;
  return Math.max(1, Math.min(requested, envCap, MAX_TARGET_CANDIDATES));
}

function liveDiscoveryDeadline(): number {
  return (
    Date.now() +
    resolvePartnershipsDiscoveryRuntimeContract().liveDiscoveryTimeoutMs
  );
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Discovery live aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

async function abortableDelay(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function scrapeCreatorsJson(
  path: string,
  apiKey: string,
  deadline: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const requestTimeoutMs = positiveIntFromEnv(
    "SCRAPECREATORS_TIMEOUT_MS",
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    throwIfAborted(signal);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error("Discovery live superó el límite global de 5 minutos");
    }
    const controller = new AbortController();
    const requestSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(requestTimeoutMs, remainingMs),
    );
    try {
      const res = await fetch(`${SCRAPECREATORS_BASE}${path}`, {
        headers: { "x-api-key": apiKey },
        signal: requestSignal,
        redirect: "error",
      });
      const body = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        throw new ScrapeCreatorsRequestError(
          "ScrapeCreators clave inválida o sin permisos",
        );
      }
      if (res.status === 402)
        throw new ScrapeCreatorsRequestError("ScrapeCreators sin créditos");
      if (!res.ok) {
        const message =
          asString(asRecord(body).message) || `HTTP ${res.status}`;
        const retryAfterSeconds = Number(res.headers.get("retry-after") || "0");
        lastError = new ScrapeCreatorsRequestError(
          `ScrapeCreators ${message}`,
          res.status === 429 || res.status >= 500,
          Number.isFinite(retryAfterSeconds)
            ? Math.max(0, retryAfterSeconds * 1000)
            : 0,
        );
        throw lastError;
      }
      if (!body || typeof body !== "object") {
        throw new ScrapeCreatorsRequestError(
          "ScrapeCreators devolvió JSON inválido",
          true,
        );
      }
      const record = asRecord(body);
      if (record.success === false) {
        lastError = new ScrapeCreatorsRequestError(
          `ScrapeCreators ${asString(record.message) || "respuesta no exitosa"}`,
        );
        throw lastError;
      }
      return body;
    } catch (err) {
      throwIfAborted(signal);
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        lastError instanceof ScrapeCreatorsRequestError
          ? lastError.retryable
          : lastError.name === "AbortError" || lastError instanceof TypeError;
      if (!retryable || attempt >= 2) throw lastError;
      const retryAfterMs =
        lastError instanceof ScrapeCreatorsRequestError
          ? lastError.retryAfterMs
          : 0;
      const delayMs = Math.min(
        Math.max(retryAfterMs, 250 * attempt),
        Math.max(0, deadline - Date.now()),
      );
      if (delayMs > 0) await abortableDelay(delayMs, signal);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("ScrapeCreators no respondió");
}

function addProfiles(
  destination: Map<string, SearchProfile>,
  profiles: SearchProfile[],
  wantedTiers: Set<string>,
  poolLimit: number,
): void {
  for (const profile of profiles) {
    const username = asString(profile.username)?.replace(/^@/, "");
    if (!username || !matchesWantedTier(profile.follower_count, wantedTiers))
      continue;
    const key = username.toLowerCase();
    if (!destination.has(key)) destination.set(key, { ...profile, username });
    if (destination.size >= poolLimit) return;
  }
}

async function collectSearchProfiles(
  plan: DiscoveryPlan,
  apiKey: string,
  target: number,
  deadline: number,
  signal?: AbortSignal,
): Promise<{ profiles: SearchProfile[]; lastError: Error | null }> {
  const queries = buildLiveDiscoveryQueries(plan);
  const wantedTiers = new Set<string>(plan.tiers || []);
  const poolLimit = Math.min(
    MAX_TARGET_CANDIDATES * SEARCH_POOL_MULTIPLIER,
    Math.max(target + 25, target * SEARCH_POOL_MULTIPLIER),
  );
  const coverageLimit = Math.min(
    MAX_TARGET_CANDIDATES * SEARCH_POOL_MULTIPLIER,
    poolLimit + (queries.profileQueries.length + queries.hashtags.length) * 2,
  );
  const profiles = new Map<string, SearchProfile>();
  let lastError: Error | null = null;

  for (const rawQuery of queries.profileQueries) {
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    for (
      let page = 0;
      page < MAX_SEARCH_PAGES_PER_QUERY &&
      (page === 0 || profiles.size < poolLimit);
      page += 1
    ) {
      const params = new URLSearchParams({ query: rawQuery });
      if (cursor) params.set("cursor", cursor);
      try {
        const body = await scrapeCreatorsJson(
          `/v1/instagram/search/profiles?${params}`,
          apiKey,
          deadline,
          signal,
        );
        addProfiles(
          profiles,
          profileListFromResponse(body),
          wantedTiers,
          page === 0 ? coverageLimit : poolLimit,
        );
        const nextCursor = cursorFromResponse(body);
        if (!nextCursor || seenCursors.has(nextCursor)) break;
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      } catch (err) {
        throwIfAborted(signal);
        lastError = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }
  }

  for (const hashtag of queries.hashtags) {
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    for (
      let page = 0;
      page < MAX_SEARCH_PAGES_PER_QUERY &&
      (page === 0 || profiles.size < poolLimit);
      page += 1
    ) {
      const params = new URLSearchParams({ hashtag, media_type: "all" });
      if (cursor) params.set("cursor", cursor);
      try {
        const body = await scrapeCreatorsJson(
          `/v1/instagram/search/hashtag?${params}`,
          apiKey,
          deadline,
          signal,
        );
        addProfiles(
          profiles,
          hashtagProfilesFromResponse(body),
          wantedTiers,
          page === 0 ? coverageLimit : poolLimit,
        );
        const nextCursor = cursorFromResponse(body);
        if (!nextCursor || seenCursors.has(nextCursor)) break;
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      } catch (err) {
        throwIfAborted(signal);
        lastError = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }
  }

  return { profiles: [...profiles.values()], lastError };
}

export function passesLiveAudienceGate(
  candidate: RawDiscoveryCandidate,
  plan: DiscoveryPlan,
): boolean {
  if (plan.audienceEsMinPct === undefined) return true;
  // El endpoint de Instagram no entrega geografía de audiencia. El requisito
  // operativo existente define este hard gate con la señal concreta de
  // alineación horaria CET calculada a partir de `items[].taken_at`; no se
  // fabrica un porcentaje de audiencia española desde bio/captions.
  const cetAlignmentPct = candidate.signals?.cetAlignmentPct;
  return (
    typeof cetAlignmentPct === "number" &&
    Number.isFinite(cetAlignmentPct) &&
    cetAlignmentPct >= plan.audienceEsMinPct
  );
}

export function unsupportedLiveDiscoveryNetworks(
  plan: DiscoveryPlan,
): string[] {
  return Array.from(
    new Set(plan.networks.filter((network) => network !== "instagram")),
  );
}

export function supportsLiveDiscovery(plan: DiscoveryPlan): boolean {
  return (
    plan.networks.length > 0 &&
    unsupportedLiveDiscoveryNetworks(plan).length === 0
  );
}

export async function scrapeLiveDiscoveryCandidates(
  plan: DiscoveryPlan,
  options: { signal?: AbortSignal; apiKey?: string } = {},
): Promise<RawDiscoveryCandidate[]> {
  throwIfAborted(options.signal);
  const apiKey = options.apiKey ?? process.env.SCRAPECREATORS_API_KEY ?? "";
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY no está configurada");
  const unsupported = unsupportedLiveDiscoveryNetworks(plan);
  if (unsupported.length > 0 || !plan.networks.includes("instagram")) {
    throw new Error(
      `Discovery live server-side solo soporta Instagram; redes no soportadas: ${unsupported.join(", ") || plan.networks.join(", ")}`,
    );
  }

  const target = targetCandidates(plan);
  const deadline = liveDiscoveryDeadline();
  const wantedTiers = new Set<string>(plan.tiers || []);
  const { profiles, lastError: searchError } = await collectSearchProfiles(
    plan,
    apiKey,
    target,
    deadline,
    options.signal,
  );
  if (profiles.length === 0 && searchError) throw searchError;

  const concurrency = Math.min(
    20,
    positiveIntFromEnv(
      "PARTNERSHIPS_LIVE_DISCOVERY_CONCURRENCY",
      DEFAULT_CONCURRENCY,
    ),
  );
  const candidates: RawDiscoveryCandidate[] = [];
  let lastEnrichmentError: Error | null = null;

  for (
    let index = 0;
    index < profiles.length && candidates.length < target;
    index += concurrency
  ) {
    throwIfAborted(options.signal);
    const batch = profiles.slice(index, index + concurrency);
    const enriched = await Promise.all(
      batch.map(async (profile) => {
        const username = profile.username;
        if (!username) return null;
        const handle = encodeURIComponent(username.replace(/^@/, ""));
        try {
          const [detailBody, postsBody] = await Promise.all([
            scrapeCreatorsJson(
              `/v1/instagram/profile?handle=${handle}`,
              apiKey,
              deadline,
              options.signal,
            ),
            scrapeCreatorsJson(
              `/v2/instagram/user/posts?handle=${handle}`,
              apiKey,
              deadline,
              options.signal,
            ),
          ]);
          return computeCandidate(
            profile,
            profileFromResponse(detailBody),
            postsFromResponse(postsBody),
            plan,
          );
        } catch (err) {
          lastEnrichmentError =
            err instanceof Error ? err : new Error(String(err));
          return null;
        }
      }),
    );
    throwIfAborted(options.signal);

    for (const candidate of enriched) {
      if (!candidate) continue;
      if (!matchesWantedTier(candidate.followers, wantedTiers, false)) continue;
      if (!passesLiveAudienceGate(candidate, plan)) continue;
      candidates.push(candidate);
      if (candidates.length >= target) break;
    }
  }

  if (candidates.length === 0 && lastEnrichmentError) throw lastEnrichmentError;
  return candidates.slice(0, target);
}
