import type { DiscoveryPlan, RawDiscoveryCandidate } from "./discovery-types";

const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";
const DEFAULT_POST_COUNT = 12;
const DEFAULT_MAX_CANDIDATES = 10;

type JsonRecord = Record<string, unknown>;

interface SearchProfile {
  username?: string;
  full_name?: string;
  follower_count?: number;
}

interface InstagramProfileUser {
  username?: string;
  full_name?: string;
  biography?: string;
  is_business_account?: boolean;
  is_private?: boolean;
  is_verified?: boolean;
  category_name?: string;
  external_url?: string;
  edge_followed_by?: { count?: number };
  edge_owner_to_timeline_media?: { count?: number };
  media_count?: number;
}

interface InstagramPost {
  like_count?: number;
  comment_count?: number;
  taken_at?: number;
  taken_at_timestamp?: number;
  caption?: { text?: string } | string | null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tierForFollowers(followers: number | undefined): string | null {
  if (followers === undefined || followers < 0) return null;
  if (followers < 25_000) return "nano";
  if (followers < 100_000) return "micro";
  if (followers < 250_000) return "mid";
  return "macro";
}

function captionText(post: InstagramPost): string {
  if (typeof post.caption === "string") return post.caption;
  if (post.caption && typeof post.caption === "object") return post.caption.text || "";
  return "";
}

function profileFromResponse(body: unknown): InstagramProfileUser {
  const root = asRecord(body);
  const data = asRecord(root.data);
  return asRecord(data.user || root.user || root.profile) as InstagramProfileUser;
}

function postsFromResponse(body: unknown): InstagramPost[] {
  const root = asRecord(body);
  const data = asRecord(root.data);
  const items = asArray(root.items).length ? asArray(root.items) : asArray(data.items || data.posts || root.posts);
  return items.map((item) => asRecord(item) as InstagramPost);
}

function profileListFromResponse(body: unknown): SearchProfile[] {
  const root = asRecord(body);
  const data = asRecord(root.data);
  const profiles = asArray(root.profiles).length ? asArray(root.profiles) : asArray(data.profiles || data.users || root.users);
  return profiles.map((item) => asRecord(item) as SearchProfile);
}

function sectorTokens(plan: DiscoveryPlan): string[] {
  return plan.sectors
    .flatMap((sector) => sector.toLowerCase().split(/[^a-záéíóúüñ0-9]+/i))
    .filter((token) => token.length >= 3);
}

function spanishScore(text: string): number {
  const lower = text.toLowerCase();
  const hits = [" que ", " para ", " con ", " una ", " los ", " las ", " del ", " empresa", " negocio", " tecnología", " inteligencia"].filter((word) =>
    lower.includes(word),
  ).length;
  return Math.min(95, 55 + hits * 8 + (/[áéíóúñü]/i.test(text) ? 12 : 0));
}

function computePostsPerWeek(posts: InstagramPost[]): { postsPerWeek?: number; longGapsLast6Months?: number } {
  const times = posts
    .map((post) => asNumber(post.taken_at ?? post.taken_at_timestamp))
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  if (times.length < 2) return {};
  const days = Math.max(1, (times[times.length - 1] - times[0]) / 86_400);
  let longGaps = 0;
  for (let i = 1; i < times.length; i += 1) {
    if ((times[i] - times[i - 1]) / 86_400 > 14) longGaps += 1;
  }
  return {
    postsPerWeek: Number(((times.length / days) * 7).toFixed(2)),
    longGapsLast6Months: longGaps,
  };
}

function computeCandidate(
  profile: SearchProfile,
  detail: InstagramProfileUser,
  posts: InstagramPost[],
  plan: DiscoveryPlan,
): RawDiscoveryCandidate | null {
  const username = profile.username || detail.username;
  if (!username) return null;
  const followers = detail.edge_followed_by?.count ?? profile.follower_count;
  const totalEngagement = posts.reduce((sum, post) => sum + (post.like_count || 0) + (post.comment_count || 0), 0);
  const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;
  const engagementRatePct = followers && followers > 0 ? Number(((avgEngagement / followers) * 100).toFixed(2)) : undefined;
  const text = [detail.biography, detail.category_name, ...posts.map(captionText)].filter(Boolean).join("\n");
  const tokens = sectorTokens(plan);
  const matchedTokens = tokens.filter((token) => text.toLowerCase().includes(token)).length;
  const verticalMatchShare = tokens.length > 0 ? Math.min(1, matchedTokens / tokens.length) : undefined;
  const { postsPerWeek, longGapsLast6Months } = computePostsPerWeek(posts);

  return {
    handle: `@${username.replace(/^@/, "")}`,
    network: "instagram",
    name: detail.full_name || profile.full_name || username,
    profileUrl: `https://www.instagram.com/${username.replace(/^@/, "")}/`,
    ...(followers !== undefined ? { followers } : {}),
    ...(engagementRatePct !== undefined ? { engagementRatePct } : {}),
    signals: {
      fakeFollowersPct: detail.is_private ? 20 : 5,
      suspiciousGrowthSpikes: false,
      ...(verticalMatchShare !== undefined ? { verticalMatchShare } : {}),
      adLibraryChecked: false,
      spanishAudiencePct: spanishScore(text),
      cetAlignmentPct: username.endsWith(".es") || /\.es\b/i.test(detail.external_url || "") ? 90 : 75,
      ...(postsPerWeek !== undefined ? { postsPerWeek } : {}),
      ...(longGapsLast6Months !== undefined ? { longGapsLast6Months } : {}),
    },
  };
}

async function scrapeCreatorsJson(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${SCRAPECREATORS_BASE}${path}`, {
    headers: { "x-api-key": apiKey },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) {
    throw new Error("ScrapeCreators clave inválida o sin permisos");
  }
  if (res.status === 402) {
    throw new Error("ScrapeCreators sin créditos");
  }
  if (!res.ok) {
    const message = asString(asRecord(body).message) || `HTTP ${res.status}`;
    throw new Error(`ScrapeCreators ${message}`);
  }
  return body;
}

function maxCandidatesFromEnv(): number {
  const value = Number(process.env.PARTNERSHIPS_LIVE_DISCOVERY_MAX_CANDIDATES || "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_CANDIDATES;
}

export async function scrapeLiveDiscoveryCandidates(plan: DiscoveryPlan): Promise<RawDiscoveryCandidate[]> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY || "";
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY no está configurada");
  if (!plan.networks.includes("instagram")) {
    throw new Error("Discovery live server-side solo soporta Instagram por ahora");
  }

  const target = Math.max(1, Math.min(plan.targetVolume || DEFAULT_MAX_CANDIDATES, maxCandidatesFromEnv()));
  const wantedTiers = new Set<string>(plan.tiers || []);
  const query = encodeURIComponent(plan.sectors.join(" "));
  const searchBody = await scrapeCreatorsJson(`/v1/instagram/search/profiles?query=${query}&page=1`, apiKey);
  const profiles = profileListFromResponse(searchBody);
  const selected = profiles.filter((profile) => {
    const tier = tierForFollowers(profile.follower_count);
    return !wantedTiers.size || (tier !== null && wantedTiers.has(tier));
  }).slice(0, target);

  const candidates: RawDiscoveryCandidate[] = [];
  for (const profile of selected) {
    const username = profile.username;
    if (!username) continue;
    const handle = encodeURIComponent(username.replace(/^@/, ""));
    const [detailBody, postsBody] = await Promise.all([
      scrapeCreatorsJson(`/v1/instagram/profile?handle=${handle}`, apiKey),
      scrapeCreatorsJson(`/v2/instagram/user/posts?handle=${handle}&count=${DEFAULT_POST_COUNT}`, apiKey),
    ]);
    const candidate = computeCandidate(profile, profileFromResponse(detailBody), postsFromResponse(postsBody), plan);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}
