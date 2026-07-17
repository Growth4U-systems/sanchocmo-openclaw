const OFFICIAL_SCRAPECREATORS_BASE_URL = "https://api.scrapecreators.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_SEARCH_RESULTS = 20;
const MAX_POSTS = 6;
const MAX_NAME_LENGTH = 160;
const MAX_BIOGRAPHY_LENGTH = 600;
const MAX_CAPTION_LENGTH = 600;

type JsonRecord = Record<string, unknown>;

export type ScrapeCreatorsAtomicErrorCode =
  | "unauthorized"
  | "payment_required"
  | "rate_limited"
  | "provider_error"
  | "invalid_response"
  | "timeout"
  | "network_error";

export class ScrapeCreatorsAtomicError extends Error {
  readonly code: ScrapeCreatorsAtomicErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: ScrapeCreatorsAtomicErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ScrapeCreatorsAtomicError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export interface AtomicSearchProfile {
  handle: string;
  name?: string;
  followers?: number;
}

export interface AtomicInstagramProfile {
  handle: string;
  name?: string;
  biography?: string;
  followers?: number;
  category?: string;
  externalUrl?: string;
  email?: string;
  profileUrl: string;
}

export interface AtomicInstagramPost {
  id?: string;
  caption?: string;
  url?: string;
  likes?: number;
  comments?: number;
  publishedAt?: string;
}

export interface ScrapeCreatorsAtomicClient {
  searchProfilesOnce(query: string): Promise<AtomicSearchProfile[]>;
  searchHashtagOnce(hashtag: string): Promise<AtomicSearchProfile[]>;
  getProfileOnce(handle: string): Promise<AtomicInstagramProfile>;
  getPostsOnce(handle: string): Promise<AtomicInstagramPost[]>;
}

export interface CreateScrapeCreatorsAtomicClientOptions {
  apiKey: string;
  timeoutMs?: number;
  /** Explicit test seam. Production callers should use the official default. */
  baseUrl?: string;
  /** Explicit test seam. */
  fetchImpl?: typeof fetch;
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  return compact.slice(0, maxLength);
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstDefinedNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function normalizedHandle(value: unknown): string | undefined {
  const handle = compactString(value, 100)?.replace(/^@+/, "");
  if (!handle || !/^[a-zA-Z0-9._]+$/.test(handle)) return undefined;
  return `@${handle}`;
}

function requiredInput(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} no puede estar vacío`);
  if (normalized.length > 200) {
    throw new TypeError(`${label} supera el máximo de 200 caracteres`);
  }
  return normalized;
}

function withoutAt(handle: string): string {
  const normalized = normalizedHandle(requiredInput(handle, "handle"));
  if (!normalized) throw new TypeError("handle de Instagram inválido");
  return normalized.slice(1);
}

function nestedFollowers(record: JsonRecord): number | undefined {
  const edge = asRecord(record.edge_followed_by);
  return firstDefinedNumber(
    record.follower_count,
    record.followers,
    record.followerCount,
    edge.count,
  );
}

function profileArray(body: unknown): unknown[] {
  const root = asRecord(body);
  const data = asRecord(root.data);
  if (Array.isArray(root.profiles)) return root.profiles;
  if (Array.isArray(data.profiles)) return data.profiles;
  if (Array.isArray(data.users)) return data.users;
  return asArray(root.users);
}

function profileRecord(body: unknown): JsonRecord {
  const root = asRecord(body);
  const data = asRecord(root.data);
  return asRecord(data.user ?? data.profile ?? root.user ?? root.profile);
}

function postArray(body: unknown): unknown[] {
  const root = asRecord(body);
  const data = asRecord(root.data);
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.posts)) return data.posts;
  return asArray(root.posts);
}

function captionFromPost(post: JsonRecord): string | undefined {
  const caption = post.caption;
  if (typeof caption === "string") {
    return compactString(caption, MAX_CAPTION_LENGTH);
  }
  return compactString(asRecord(caption).text, MAX_CAPTION_LENGTH);
}

function publishedAt(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    const numeric = finiteNumber(value);
    if (numeric === undefined) {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : undefined;
    }
    value = numeric;
  }
  const numeric = finiteNumber(value);
  if (numeric === undefined) return undefined;
  const milliseconds = numeric < 100_000_000_000 ? numeric * 1_000 : numeric;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function errorForStatus(status: number): ScrapeCreatorsAtomicError {
  if (status === 401 || status === 403) {
    return new ScrapeCreatorsAtomicError(
      "unauthorized",
      "ScrapeCreators rechazó las credenciales",
      { status },
    );
  }
  if (status === 402) {
    return new ScrapeCreatorsAtomicError(
      "payment_required",
      "ScrapeCreators no tiene créditos disponibles",
      { status },
    );
  }
  if (status === 429) {
    return new ScrapeCreatorsAtomicError(
      "rate_limited",
      "ScrapeCreators limitó la solicitud",
      { status, retryable: true },
    );
  }
  return new ScrapeCreatorsAtomicError(
    "provider_error",
    `ScrapeCreators respondió HTTP ${status}`,
    { status, retryable: status >= 500 },
  );
}

function normalizeBaseUrl(value: string | undefined): string {
  const raw = (value ?? OFFICIAL_SCRAPECREATORS_BASE_URL).replace(/\/+$/, "");
  const url = new URL(raw);
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname,
  );
  if (url.protocol !== "https:" && !isLoopback) {
    throw new TypeError("baseUrl debe usar HTTPS (o loopback en tests)");
  }
  return url.toString().replace(/\/+$/, "");
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError("timeoutMs debe ser positivo");
  }
  return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
}

export function createScrapeCreatorsAtomicClient(
  options: CreateScrapeCreatorsAtomicClientOptions,
): ScrapeCreatorsAtomicClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new TypeError("apiKey es obligatoria");
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function fetchJsonOnce(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Exactly one provider invocation belongs to each durable workflow step.
      const response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { "x-api-key": apiKey },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw errorForStatus(response.status);

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new ScrapeCreatorsAtomicError(
          "invalid_response",
          "ScrapeCreators devolvió JSON inválido",
        );
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw new ScrapeCreatorsAtomicError(
          "invalid_response",
          "ScrapeCreators devolvió una respuesta inválida",
        );
      }
      if (asRecord(body).success === false) {
        throw new ScrapeCreatorsAtomicError(
          "provider_error",
          "ScrapeCreators indicó que la solicitud no fue exitosa",
        );
      }
      return body;
    } catch (error) {
      if (error instanceof ScrapeCreatorsAtomicError) throw error;
      if (controller.signal.aborted) {
        throw new ScrapeCreatorsAtomicError(
          "timeout",
          `ScrapeCreators superó el timeout de ${timeoutMs} ms`,
          { retryable: true },
        );
      }
      throw new ScrapeCreatorsAtomicError(
        "network_error",
        "No se pudo conectar con ScrapeCreators",
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async searchProfilesOnce(query) {
      const normalizedQuery = requiredInput(query, "query");
      const params = new URLSearchParams({ query: normalizedQuery });
      const body = await fetchJsonOnce(
        `/v1/instagram/search/profiles?${params.toString()}`,
      );
      const seen = new Set<string>();
      const profiles: AtomicSearchProfile[] = [];
      for (const value of profileArray(body)) {
        const item = asRecord(value);
        const nestedUser = asRecord(item.user);
        const handle = normalizedHandle(
          item.username ?? item.handle ?? nestedUser.username,
        );
        if (!handle) continue;
        const key = handle.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const name = compactString(
          item.full_name ?? item.fullName ?? item.name ?? nestedUser.full_name,
          MAX_NAME_LENGTH,
        );
        const followers = nestedFollowers({ ...item, ...nestedUser });
        profiles.push({
          handle,
          ...(name ? { name } : {}),
          ...(followers !== undefined ? { followers } : {}),
        });
        if (profiles.length >= MAX_SEARCH_RESULTS) break;
      }
      return profiles;
    },

    async searchHashtagOnce(hashtag) {
      const normalized = requiredInput(hashtag, "hashtag")
        .replace(/^#+/, "")
        .toLowerCase();
      if (!/^[a-z0-9_]+$/.test(normalized)) {
        throw new TypeError("hashtag de Instagram inválido");
      }
      const params = new URLSearchParams({
        hashtag: normalized,
        media_type: "all",
      });
      const body = await fetchJsonOnce(
        `/v1/instagram/search/hashtag?${params.toString()}`,
      );
      const seen = new Set<string>();
      const profiles: AtomicSearchProfile[] = [];
      for (const value of postArray(body)) {
        const owner = asRecord(asRecord(value).owner);
        const handle = normalizedHandle(owner.username);
        if (!handle) continue;
        const key = handle.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const name = compactString(owner.full_name, MAX_NAME_LENGTH);
        const followers = nestedFollowers(owner);
        profiles.push({
          handle,
          ...(name ? { name } : {}),
          ...(followers !== undefined ? { followers } : {}),
        });
        if (profiles.length >= MAX_SEARCH_RESULTS) break;
      }
      return profiles;
    },

    async getProfileOnce(handle) {
      const username = withoutAt(handle);
      const params = new URLSearchParams({ handle: username });
      const body = await fetchJsonOnce(
        `/v1/instagram/profile?${params.toString()}`,
      );
      const item = profileRecord(body);
      if (Object.keys(item).length === 0) {
        throw new ScrapeCreatorsAtomicError(
          "invalid_response",
          "ScrapeCreators no devolvió el perfil solicitado",
        );
      }
      const normalized = normalizedHandle(item.username) ?? `@${username}`;
      const name = compactString(
        item.full_name ?? item.fullName ?? item.name,
        MAX_NAME_LENGTH,
      );
      const biography = compactString(
        item.biography ?? item.bio,
        MAX_BIOGRAPHY_LENGTH,
      );
      const followers = nestedFollowers(item);
      const category = compactString(
        item.category_name ?? item.category,
        MAX_NAME_LENGTH,
      );
      const externalUrl = compactString(
        item.external_url ?? item.externalUrl,
        500,
      );
      const email = compactString(item.business_email ?? item.email, 320);
      return {
        handle: normalized,
        ...(name ? { name } : {}),
        ...(biography ? { biography } : {}),
        ...(followers !== undefined ? { followers } : {}),
        ...(category ? { category } : {}),
        ...(externalUrl ? { externalUrl } : {}),
        ...(email ? { email } : {}),
        profileUrl: `https://www.instagram.com/${normalized.slice(1)}/`,
      };
    },

    async getPostsOnce(handle) {
      const username = withoutAt(handle);
      const params = new URLSearchParams({ handle: username });
      const body = await fetchJsonOnce(
        `/v2/instagram/user/posts?${params.toString()}`,
      );
      return postArray(body)
        .slice(0, MAX_POSTS)
        .map((value) => {
          const item = asRecord(value);
          const id = compactString(item.code ?? item.shortcode ?? item.id, 160);
          const caption = captionFromPost(item);
          const explicitUrl = compactString(item.url ?? item.post_url, 500);
          const url =
            explicitUrl ??
            (id
              ? `https://www.instagram.com/p/${encodeURIComponent(id)}/`
              : undefined);
          const likes = firstDefinedNumber(
            item.like_count,
            item.likes,
            item.likeCount,
          );
          const comments = firstDefinedNumber(
            item.comment_count,
            item.comments,
            item.commentCount,
          );
          const normalizedPublishedAt = publishedAt(
            item.taken_at ?? item.taken_at_timestamp ?? item.timestamp,
          );
          return {
            ...(id ? { id } : {}),
            ...(caption ? { caption } : {}),
            ...(url ? { url } : {}),
            ...(likes !== undefined ? { likes } : {}),
            ...(comments !== undefined ? { comments } : {}),
            ...(normalizedPublishedAt
              ? { publishedAt: normalizedPublishedAt }
              : {}),
          };
        });
    },
  };
}
