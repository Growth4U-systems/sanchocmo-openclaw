/**
 * Fail-closed sanitization for support evidence leaving Sancho.
 *
 * Callers must choose a destination explicitly. Secrets are always redacted;
 * personally identifiable contact data is additionally redacted for every
 * destination that leaves Sancho's internal support boundary.
 */

export const SUPPORT_REDACTION_POLICY_VERSION = "2026-07-15.v1" as const;

export type SupportDestination = "internal" | "model" | "linear" | "slack";

export type SupportSafeValue =
  | null
  | boolean
  | number
  | string
  | SupportSafeValue[]
  | { [key: string]: SupportSafeValue };

export interface SupportRedactionLimits {
  maxDepth: number;
  maxArrayLength: number;
  maxObjectKeys: number;
  maxStringLength: number;
  maxTotalBytes: number;
}

export const DEFAULT_SUPPORT_REDACTION_LIMITS: Readonly<SupportRedactionLimits> =
  Object.freeze({
    maxDepth: 8,
    maxArrayLength: 100,
    maxObjectKeys: 200,
    maxStringLength: 16_384,
    maxTotalBytes: 262_144,
  });

const HARD_LIMITS: Readonly<SupportRedactionLimits> = Object.freeze({
  maxDepth: 12,
  maxArrayLength: 250,
  maxObjectKeys: 500,
  maxStringLength: 32_768,
  maxTotalBytes: 524_288,
});

const MIN_LIMITS: Readonly<SupportRedactionLimits> = Object.freeze({
  maxDepth: 1,
  maxArrayLength: 1,
  maxObjectKeys: 1,
  maxStringLength: 32,
  maxTotalBytes: 64,
});

export type SupportRedactionKind =
  | "authorization"
  | "cookie"
  | "api_key"
  | "token"
  | "password"
  | "secret"
  | "private_key"
  | "signed_url"
  | "sensitive_query"
  | "url_credentials"
  | "url_fragment"
  | "malformed_url"
  | "email"
  | "phone"
  | "unsafe_correlation_id"
  | "unsafe_key"
  | "string_truncated"
  | "depth_truncated"
  | "array_truncated"
  | "object_truncated"
  | "total_size_truncated"
  | "cycle"
  | "binary"
  | "accessor"
  | "unsupported"
  | "non_finite";

export interface SupportRedactionMetadata {
  policyVersion: typeof SUPPORT_REDACTION_POLICY_VERSION;
  destination: SupportDestination;
  external: boolean;
  applied: boolean;
  totalRedactions: number;
  counts: Record<SupportRedactionKind, number>;
  truncated: boolean;
  outputBytes: number;
  limits: SupportRedactionLimits;
}

export interface SupportRedactionResult {
  value: SupportSafeValue;
  metadata: SupportRedactionMetadata;
}

export interface SupportRedactionOptions extends Partial<SupportRedactionLimits> {
  destination: SupportDestination;
}

export type SupportRedactionErrorCode =
  "INVALID_POLICY" | "SANITIZATION_FAILED" | "RESIDUAL_SECRET";

export class SupportRedactionError extends Error {
  readonly code: SupportRedactionErrorCode;

  constructor(code: SupportRedactionErrorCode, message: string) {
    super(message);
    this.name = "SupportRedactionError";
    this.code = code;
  }
}

const REDACTION_KINDS: readonly SupportRedactionKind[] = [
  "authorization",
  "cookie",
  "api_key",
  "token",
  "password",
  "secret",
  "private_key",
  "signed_url",
  "sensitive_query",
  "url_credentials",
  "url_fragment",
  "malformed_url",
  "email",
  "phone",
  "unsafe_correlation_id",
  "unsafe_key",
  "string_truncated",
  "depth_truncated",
  "array_truncated",
  "object_truncated",
  "total_size_truncated",
  "cycle",
  "binary",
  "accessor",
  "unsupported",
  "non_finite",
] as const;

const EXTERNAL_DESTINATIONS = new Set<SupportDestination>([
  "model",
  "linear",
  "slack",
]);

const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const CORRELATION_KEYS = new Set([
  "correlationid",
  "xcorrelationid",
  "requestid",
  "xrequestid",
  "traceid",
  "spanid",
  "runid",
]);
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi;
const DATA_URL_PATTERN = /data:[^\s"'<>]+/gi;
const URL_PATTERN =
  /(?:https?|postgres(?:ql)?|mysql|redis|rediss|mongodb(?:\+srv)?):\/\/[^\s<>"'`]+/gi;
const AUTHORIZATION_PATTERN =
  /\b(?:authorization\s*[:=]\s*)?(?:bearer|basic|token)\s+[A-Za-z0-9+/_.~=-]+/gi;
const COOKIE_PATTERN = /\b(?:set-cookie|cookie)\s*[:=]\s*[^\r\n]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /(?<![?&])(?:[A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|signing[_-]?secret|webhook[_-]?secret|password|passwd|pwd|authorization|credential|session[_-]?(?:id|token|secret)|cookie)[A-Za-z0-9_.-]*|token|secret)\s*["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/gi;
const KNOWN_TOKEN_PATTERN =
  /\b(?:sancho_mcp_|github_pat_|gh[pousr]_|glpat-|sk-|sk_|ntn_|xox[baprs]-|whsec_|rk_live_|lin_api_|npm_|pypi-|hf_)[A-Za-z0-9._-]{8,}\b/gi;
const AWS_ACCESS_KEY_PATTERN = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const GOOGLE_API_KEY_PATTERN = /\bAIza[A-Za-z0-9_-]{20,}\b/g;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const GENERIC_BASE64_SECRET_PATTERN =
  /\b(?:secret|token|key)\s*[:=]\s*[A-Za-z0-9+/]{32,}={0,2}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_CANDIDATE_PATTERN = /\+?\d[\d ().-]{7,}\d/g;

const SENSITIVE_QUERY_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "auth",
  "code",
  "cookie",
  "credential",
  "idtoken",
  "key",
  "password",
  "refreshtoken",
  "secret",
  "session",
  "sessionid",
  "sig",
  "signature",
  "state",
  "token",
]);

const TRUNCATION_KINDS = new Set<SupportRedactionKind>([
  "string_truncated",
  "depth_truncated",
  "array_truncated",
  "object_truncated",
  "total_size_truncated",
]);

interface RedactionState {
  destination: SupportDestination;
  external: boolean;
  limits: SupportRedactionLimits;
  counts: Record<SupportRedactionKind, number>;
  unsafeKeySequence: number;
  remainingNodes: number;
  nodeBudgetExhausted: boolean;
}

function emptyCounts(): Record<SupportRedactionKind, number> {
  return Object.fromEntries(REDACTION_KINDS.map((kind) => [kind, 0])) as Record<
    SupportRedactionKind,
    number
  >;
}

function note(state: RedactionState, kind: SupportRedactionKind): void {
  state.counts[kind] += 1;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validateDestination(value: unknown): SupportDestination {
  if (
    value === "internal" ||
    value === "model" ||
    value === "linear" ||
    value === "slack"
  ) {
    return value;
  }
  throw new SupportRedactionError(
    "INVALID_POLICY",
    "A valid support redaction destination is required",
  );
}

function resolveLimit(
  name: keyof SupportRedactionLimits,
  value: number | undefined,
): number {
  if (value === undefined) return DEFAULT_SUPPORT_REDACTION_LIMITS[name];
  if (!Number.isSafeInteger(value) || value < MIN_LIMITS[name]) {
    throw new SupportRedactionError(
      "INVALID_POLICY",
      `Support redaction ${name} is outside the safe range`,
    );
  }
  return Math.min(value, HARD_LIMITS[name]);
}

function resolveLimits(
  options: SupportRedactionOptions,
): SupportRedactionLimits {
  return {
    maxDepth: resolveLimit("maxDepth", options.maxDepth),
    maxArrayLength: resolveLimit("maxArrayLength", options.maxArrayLength),
    maxObjectKeys: resolveLimit("maxObjectKeys", options.maxObjectKeys),
    maxStringLength: resolveLimit("maxStringLength", options.maxStringLength),
    maxTotalBytes: resolveLimit("maxTotalBytes", options.maxTotalBytes),
  };
}

function isValidTraceparent(value: string): boolean {
  const match = SAFE_TRACEPARENT.exec(value);
  return Boolean(match && !/^0+$/.test(match[1]) && !/^0+$/.test(match[2]));
}

function isSafeCorrelationValue(key: string, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (normalizeKey(key) === "traceparent") return isValidTraceparent(value);
  if (!SAFE_CORRELATION_ID.test(value)) return false;
  const recognizableSecrets = [
    KNOWN_TOKEN_PATTERN,
    AWS_ACCESS_KEY_PATTERN,
    GOOGLE_API_KEY_PATTERN,
    JWT_PATTERN,
  ];
  return !recognizableSecrets.some((pattern) => {
    pattern.lastIndex = 0;
    const found = pattern.test(value);
    pattern.lastIndex = 0;
    return found;
  });
}

function isCorrelationKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === "traceparent" || CORRELATION_KEYS.has(normalized);
}

function classifySecretKey(key: string): SupportRedactionKind | null {
  const normalized = normalizeKey(key);
  if (
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "authheader" ||
    normalized === "auth"
  ) {
    return "authorization";
  }
  if (
    normalized === "cookie" ||
    normalized === "cookies" ||
    normalized === "setcookie" ||
    normalized === "session" ||
    normalized === "sid" ||
    normalized.endsWith("cookie")
  ) {
    return "cookie";
  }
  if (
    normalized === "password" ||
    normalized === "passwd" ||
    normalized === "pwd" ||
    normalized.endsWith("password")
  ) {
    return "password";
  }
  if (normalized.includes("privatekey")) return "private_key";
  if (normalized.endsWith("apikey") || normalized === "xapikey") {
    return "api_key";
  }
  if (
    normalized === "token" ||
    normalized.endsWith("token") ||
    normalized === "sessionid" ||
    normalized === "csrftoken" ||
    normalized === "csrf"
  ) {
    return "token";
  }
  if (
    normalized === "secret" ||
    normalized.endsWith("secret") ||
    normalized.endsWith("credential") ||
    normalized.endsWith("credentials")
  ) {
    return "secret";
  }
  return null;
}

function classifyExternalPiiKey(key: string): "email" | "phone" | null {
  const normalized = normalizeKey(key);
  if (
    normalized === "email" ||
    normalized.endsWith("email") ||
    normalized.endsWith("emailaddress")
  ) {
    return "email";
  }
  if (
    normalized === "phone" ||
    normalized === "telephone" ||
    normalized === "mobile" ||
    normalized === "whatsapp" ||
    normalized.endsWith("phonenumber") ||
    normalized.endsWith("telephonenumber") ||
    normalized.endsWith("mobilenumber")
  ) {
    return "phone";
  }
  return null;
}

function replaceAndCount(
  value: string,
  pattern: RegExp,
  replacement: string,
  state: RedactionState,
  kind: SupportRedactionKind,
): string {
  return value.replace(pattern, () => {
    note(state, kind);
    return replacement;
  });
}

function queryKeyIsSigned(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized === "signature" ||
    normalized === "sig" ||
    normalized === "policy" ||
    normalized === "keypairid" ||
    normalized === "googleaccessid" ||
    normalized.startsWith("xamz") ||
    normalized.startsWith("xgoog")
  );
}

function queryKeyIsSensitive(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_QUERY_KEYS.has(normalized) ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("apikey")
  );
}

function splitTrailingPunctuation(value: string): [string, string] {
  const match = /^(.*?)([.,;!?]+)$/.exec(value);
  return match ? [match[1], match[2]] : [value, ""];
}

function sanitizeUrl(raw: string, state: RedactionState): string {
  const [candidate, punctuation] = splitTrailingPunctuation(raw);
  try {
    const parsed = new URL(candidate);
    const hadCredentials = Boolean(parsed.username || parsed.password);
    if (hadCredentials) {
      parsed.username = "";
      parsed.password = "";
      note(state, "url_credentials");
    }

    const queryEntries = Array.from(parsed.searchParams.entries());
    const signed = queryEntries.some(([key]) => queryKeyIsSigned(key));
    let signedQueryPlaceholder = "";
    if (signed) {
      parsed.search = "";
      signedQueryPlaceholder = "?[REDACTED_SIGNED_QUERY]";
      note(state, "signed_url");
    } else {
      for (const [key] of queryEntries) {
        if (!queryKeyIsSensitive(key)) continue;
        parsed.searchParams.set(key, "[REDACTED]");
        note(state, "sensitive_query");
        continue;
      }
      if (state.external) {
        for (const [key, queryValue] of queryEntries) {
          if (queryKeyIsSensitive(key)) continue;
          const piiKinds = piiKindsInText(queryValue);
          if (piiKinds.length === 0) continue;
          parsed.searchParams.set(key, "[REDACTED_PII]");
          for (const kind of piiKinds) note(state, kind);
        }
      }
    }

    if (state.external) {
      parsed.pathname = parsed.pathname
        .split("/")
        .map((segment) => {
          let decoded = segment;
          try {
            decoded = decodeURIComponent(segment);
          } catch {
            // Keep malformed path segments; no decoded content can be exposed.
          }
          const piiKinds = piiKindsInText(decoded);
          if (piiKinds.length === 0) return segment;
          for (const kind of piiKinds) note(state, kind);
          return "%5BREDACTED_PII%5D";
        })
        .join("/");
    }

    let fragmentPlaceholder = "";
    if (parsed.hash) {
      parsed.hash = "";
      fragmentPlaceholder = "#[REDACTED_FRAGMENT]";
      note(state, "url_fragment");
    }
    return `${parsed.toString()}${signedQueryPlaceholder}${fragmentPlaceholder}${punctuation}`;
  } catch {
    note(state, "malformed_url");
    return `[REDACTED_MALFORMED_URL]${punctuation}`;
  }
}

function redactUrls(value: string, state: RedactionState): string {
  return value.replace(URL_PATTERN, (url) => sanitizeUrl(url, state));
}

function classifyAssignment(match: string): SupportRedactionKind {
  const normalized = normalizeKey(match.split(/[:=]/, 1)[0] ?? "");
  if (normalized.includes("authorization")) return "authorization";
  if (normalized.includes("cookie")) return "cookie";
  if (normalized.includes("password") || normalized.includes("passwd")) {
    return "password";
  }
  if (normalized.includes("privatekey")) return "private_key";
  if (normalized.includes("apikey")) return "api_key";
  if (normalized.includes("token") || normalized.includes("sessionid")) {
    return "token";
  }
  return "secret";
}

function redactSecretAssignments(value: string, state: RedactionState): string {
  return value.replace(SECRET_ASSIGNMENT_PATTERN, (match) => {
    note(state, classifyAssignment(match));
    return "[REDACTED_SECRET_ASSIGNMENT]";
  });
}

function looksLikeIpv4(candidate: string): boolean {
  const normalized = candidate.trim();
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized)) return false;
  return normalized.split(".").every((part) => Number(part) <= 255);
}

function looksLikeIsoDatePrefix(candidate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2})?$/.test(candidate.trim());
}

function redactPhones(value: string, state: RedactionState): string {
  return value.replace(PHONE_CANDIDATE_PATTERN, (candidate) => {
    const digits = candidate.replace(/\D/g, "");
    if (
      digits.length < 9 ||
      digits.length > 15 ||
      looksLikeIpv4(candidate) ||
      looksLikeIsoDatePrefix(candidate)
    ) {
      return candidate;
    }
    note(state, "phone");
    return "[REDACTED_PHONE]";
  });
}

function piiKindsInText(value: string): Array<"email" | "phone"> {
  const kinds: Array<"email" | "phone"> = [];
  EMAIL_PATTERN.lastIndex = 0;
  if (EMAIL_PATTERN.test(value)) kinds.push("email");
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_CANDIDATE_PATTERN.lastIndex = 0;
  const hasPhone = Array.from(value.matchAll(PHONE_CANDIDATE_PATTERN)).some(
    ([candidate]) => {
      const digits = candidate.replace(/\D/g, "");
      return (
        digits.length >= 9 &&
        digits.length <= 15 &&
        !looksLikeIpv4(candidate) &&
        !looksLikeIsoDatePrefix(candidate)
      );
    },
  );
  PHONE_CANDIDATE_PATTERN.lastIndex = 0;
  if (hasPhone) kinds.push("phone");
  return kinds;
}

function truncateString(value: string, maxLength: number): string {
  const marker = "[TRUNCATED]";
  if (value.length <= maxLength) return value;
  if (maxLength <= marker.length) return marker.slice(0, maxLength);
  return `${value.slice(0, maxLength - marker.length)}${marker}`;
}

function sanitizeString(value: string, state: RedactionState): string {
  // Do not run unbounded regexes over attacker-controlled logs. Bytes beyond
  // this prefix can never be present in the output and are dropped first.
  const scanLimit = state.limits.maxStringLength + 512;
  let sanitized = value.slice(0, scanLimit);
  let wasTruncated = value.length > scanLimit;

  sanitized = replaceAndCount(
    sanitized,
    PRIVATE_KEY_PATTERN,
    "[REDACTED_PRIVATE_KEY]",
    state,
    "private_key",
  );
  sanitized = replaceAndCount(
    sanitized,
    DATA_URL_PATTERN,
    "[REDACTED_DATA_URL]",
    state,
    "secret",
  );
  sanitized = redactUrls(sanitized, state);
  sanitized = replaceAndCount(
    sanitized,
    COOKIE_PATTERN,
    "[REDACTED_COOKIE]",
    state,
    "cookie",
  );
  sanitized = replaceAndCount(
    sanitized,
    AUTHORIZATION_PATTERN,
    "[REDACTED_AUTHORIZATION]",
    state,
    "authorization",
  );
  sanitized = redactSecretAssignments(sanitized, state);
  sanitized = replaceAndCount(
    sanitized,
    KNOWN_TOKEN_PATTERN,
    "[REDACTED_TOKEN]",
    state,
    "token",
  );
  sanitized = replaceAndCount(
    sanitized,
    AWS_ACCESS_KEY_PATTERN,
    "[REDACTED_API_KEY]",
    state,
    "api_key",
  );
  sanitized = replaceAndCount(
    sanitized,
    GOOGLE_API_KEY_PATTERN,
    "[REDACTED_API_KEY]",
    state,
    "api_key",
  );
  sanitized = replaceAndCount(
    sanitized,
    JWT_PATTERN,
    "[REDACTED_TOKEN]",
    state,
    "token",
  );
  sanitized = replaceAndCount(
    sanitized,
    GENERIC_BASE64_SECRET_PATTERN,
    "[REDACTED_SECRET]",
    state,
    "secret",
  );

  if (state.external) {
    sanitized = replaceAndCount(
      sanitized,
      EMAIL_PATTERN,
      "[REDACTED_EMAIL]",
      state,
      "email",
    );
    sanitized = redactPhones(sanitized, state);
  }

  if (sanitized.length > state.limits.maxStringLength) wasTruncated = true;
  if (wasTruncated) {
    sanitized = truncateString(sanitized, state.limits.maxStringLength);
    note(state, "string_truncated");
  }
  return sanitized;
}

function keyLooksSensitive(key: string, state: RedactionState): boolean {
  if (
    key.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    UNSAFE_OBJECT_KEYS.has(key) ||
    /^\[(?:REDACTED_KEY|REDACTED|TRUNCATED)/.test(key)
  ) {
    return true;
  }
  const scratch: RedactionState = {
    ...state,
    counts: emptyCounts(),
    limits: { ...state.limits, maxStringLength: 128 },
    unsafeKeySequence: 0,
  };
  sanitizeString(key, scratch);
  return REDACTION_KINDS.some((kind) => scratch.counts[kind] > 0);
}

function sanitizeObjectKey(key: string, state: RedactionState): string {
  if (!keyLooksSensitive(key, state)) return key;
  state.unsafeKeySequence += 1;
  note(state, "unsafe_key");
  return `[REDACTED_KEY_${state.unsafeKeySequence}]`;
}

function sanitizeError(
  error: Error,
  state: RedactionState,
  depth: number,
  ancestors: Set<object>,
): SupportSafeValue {
  const safe: Record<string, SupportSafeValue> = {
    name: sanitizeString(String(error.name || "Error"), state),
    message: sanitizeString(String(error.message || ""), state),
  };
  if (typeof error.stack === "string") {
    safe.stack = sanitizeString(error.stack, state);
  }
  for (const key of Object.keys(error)) {
    if (key === "name" || key === "message" || key === "stack") continue;
    if (Object.keys(safe).length >= state.limits.maxObjectKeys) {
      note(state, "object_truncated");
      break;
    }
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (!descriptor || !("value" in descriptor)) {
      note(state, "accessor");
      safe[sanitizeObjectKey(key, state)] = "[REDACTED_ACCESSOR]";
      continue;
    }
    const secretKind = classifySecretKey(key);
    const safeKey = sanitizeObjectKey(key, state);
    if (secretKind) {
      note(state, secretKind);
      safe[safeKey] = "[REDACTED_SECRET_FIELD]";
      continue;
    }
    const piiKind = state.external ? classifyExternalPiiKey(key) : null;
    if (piiKind) {
      note(state, piiKind);
      safe[safeKey] =
        piiKind === "email" ? "[REDACTED_EMAIL]" : "[REDACTED_PHONE]";
      continue;
    }
    safe[safeKey] = sanitizeValue(
      descriptor.value,
      state,
      depth + 1,
      ancestors,
    );
  }
  return safe;
}

function sanitizeObject(
  value: object,
  state: RedactionState,
  depth: number,
  ancestors: Set<object>,
): SupportSafeValue {
  if (depth >= state.limits.maxDepth) {
    note(state, "depth_truncated");
    return "[TRUNCATED_MAX_DEPTH]";
  }
  if (ancestors.has(value)) {
    note(state, "cycle");
    return "[REDACTED_CIRCULAR_REFERENCE]";
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    note(state, "binary");
    return "[REDACTED_BINARY]";
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isFinite(timestamp)) {
      note(state, "non_finite");
      return null;
    }
    return value.toISOString();
  }
  if (value instanceof URL) return sanitizeString(value.toString(), state);

  ancestors.add(value);
  try {
    if (value instanceof Error) {
      return sanitizeError(value, state, depth, ancestors);
    }
    if (Array.isArray(value)) {
      const length = Math.min(value.length, state.limits.maxArrayLength);
      const safe: SupportSafeValue[] = [];
      for (let index = 0; index < length; index += 1) {
        safe.push(sanitizeValue(value[index], state, depth + 1, ancestors));
      }
      if (value.length > length) note(state, "array_truncated");
      return safe;
    }

    const safe: Record<string, SupportSafeValue> = {};
    let visited = 0;
    for (const key of Object.keys(value)) {
      if (visited >= state.limits.maxObjectKeys) {
        note(state, "object_truncated");
        break;
      }
      visited += 1;
      const safeKey = sanitizeObjectKey(key, state);
      const secretKind = classifySecretKey(key);
      if (secretKind) {
        note(state, secretKind);
        safe[safeKey] = "[REDACTED_SECRET_FIELD]";
        continue;
      }
      const piiKind = state.external ? classifyExternalPiiKey(key) : null;
      if (piiKind) {
        note(state, piiKind);
        safe[safeKey] =
          piiKind === "email" ? "[REDACTED_EMAIL]" : "[REDACTED_PHONE]";
        continue;
      }
      if (isCorrelationKey(key)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          descriptor &&
          "value" in descriptor &&
          isSafeCorrelationValue(key, descriptor.value)
        ) {
          safe[safeKey] = descriptor.value;
        } else {
          note(state, "unsafe_correlation_id");
          safe[safeKey] = "[REDACTED_UNSAFE_CORRELATION_ID]";
        }
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        note(state, "accessor");
        safe[safeKey] = "[REDACTED_ACCESSOR]";
        continue;
      }
      safe[safeKey] = sanitizeValue(
        descriptor.value,
        state,
        depth + 1,
        ancestors,
      );
    }
    return safe;
  } finally {
    ancestors.delete(value);
  }
}

function sanitizeValue(
  value: unknown,
  state: RedactionState,
  depth: number,
  ancestors: Set<object>,
): SupportSafeValue {
  if (state.remainingNodes <= 0) {
    if (!state.nodeBudgetExhausted) {
      state.nodeBudgetExhausted = true;
      note(state, "total_size_truncated");
    }
    return "[TRUNCATED_TOTAL_SIZE]";
  }
  state.remainingNodes -= 1;
  if (value === null) return null;
  if (typeof value === "string") return sanitizeString(value, state);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    note(state, "non_finite");
    return null;
  }
  if (typeof value === "bigint") {
    const serialized = value.toString();
    if (serialized.length <= state.limits.maxStringLength) return serialized;
    note(state, "string_truncated");
    return truncateString(serialized, state.limits.maxStringLength);
  }
  if (typeof value === "object") {
    return sanitizeObject(value, state, depth, ancestors);
  }
  note(state, "unsupported");
  return "[REDACTED_UNSUPPORTED_VALUE]";
}

function serializedBytes(value: SupportSafeValue): {
  serialized: string;
  bytes: number;
} {
  const serialized = JSON.stringify(value);
  return { serialized, bytes: new TextEncoder().encode(serialized).length };
}

function assertNoResidualSecrets(serialized: string): void {
  const residualPatterns = [
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
    /\b(?:bearer|basic)\s+(?!\[REDACTED)[A-Za-z0-9+/_.~=-]{8,}/i,
    new RegExp(KNOWN_TOKEN_PATTERN.source, "i"),
    /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    /\bAIza[A-Za-z0-9_-]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  ];
  if (residualPatterns.some((pattern) => pattern.test(serialized))) {
    throw new SupportRedactionError(
      "RESIDUAL_SECRET",
      "Support data failed the post-redaction safety check",
    );
  }
}

/**
 * Convert arbitrary support evidence to a JSON-safe, bounded value.
 *
 * The function never returns the original value on failure. Unexpected object
 * behaviour (for example a throwing Proxy) aborts with a generic error so a
 * caller cannot accidentally fall back to sending the raw bundle.
 */
export function sanitizeSupportBundle(
  input: unknown,
  options: SupportRedactionOptions,
): SupportRedactionResult {
  const destination = validateDestination(options?.destination);
  const limits = resolveLimits(options);
  const state: RedactionState = {
    destination,
    external: EXTERNAL_DESTINATIONS.has(destination),
    limits,
    counts: emptyCounts(),
    unsafeKeySequence: 0,
    remainingNodes: Math.max(64, Math.min(20_000, limits.maxTotalBytes >> 2)),
    nodeBudgetExhausted: false,
  };

  try {
    let value = sanitizeValue(input, state, 0, new Set<object>());
    let { serialized, bytes } = serializedBytes(value);
    if (bytes > limits.maxTotalBytes) {
      note(state, "total_size_truncated");
      value = "[TRUNCATED_TOTAL_SIZE]";
      ({ serialized, bytes } = serializedBytes(value));
    }
    assertNoResidualSecrets(serialized);

    const totalRedactions = REDACTION_KINDS.reduce(
      (total, kind) => total + state.counts[kind],
      0,
    );
    return {
      value,
      metadata: {
        policyVersion: SUPPORT_REDACTION_POLICY_VERSION,
        destination,
        external: state.external,
        applied: totalRedactions > 0,
        totalRedactions,
        counts: { ...state.counts },
        truncated: REDACTION_KINDS.some(
          (kind) => TRUNCATION_KINDS.has(kind) && state.counts[kind] > 0,
        ),
        outputBytes: bytes,
        limits: { ...limits },
      },
    };
  } catch (error) {
    if (error instanceof SupportRedactionError) throw error;
    throw new SupportRedactionError(
      "SANITIZATION_FAILED",
      "Support data could not be sanitized safely",
    );
  }
}
