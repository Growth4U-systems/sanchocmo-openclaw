import { createHash } from "node:crypto";

export type DurableJsonObject = { [key: string]: DurableJson };

export type DurableJson =
  null | boolean | number | string | DurableJson[] | DurableJsonObject;

export interface DurableJsonBounds {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxStringBytes: number;
  maxArrayItems: number;
  maxObjectKeys: number;
}

export interface DurableSecretPolicy {
  mode: "reject";
  /** Opaque credential references are identifiers, never credential values. */
  credentialRefPattern?: RegExp;
}

export interface DurableJsonContract<T extends DurableJson> {
  schemaVersion: number;
  bounds: DurableJsonBounds;
  secrets: DurableSecretPolicy;
  /** Return a closed, plain JSON value. Unknown properties must not survive. */
  parse(value: unknown): T;
}

export type DurableJsonSurface =
  | "command"
  | "metadata"
  | "checkpoint"
  | "effect_payload"
  | "effect_receipt"
  | "event_data";

function frozenBounds(bounds: DurableJsonBounds): Readonly<DurableJsonBounds> {
  return Object.freeze({ ...bounds });
}

/** Repository-wide ceilings. A contract may only narrow these values. */
export const DURABLE_JSON_GLOBAL_BOUNDS: Readonly<
  Record<DurableJsonSurface, Readonly<DurableJsonBounds>>
> = Object.freeze({
  command: frozenBounds({
    maxBytes: 128 * 1024,
    maxDepth: 24,
    maxNodes: 5_000,
    maxStringBytes: 32 * 1024,
    maxArrayItems: 500,
    maxObjectKeys: 500,
  }),
  metadata: frozenBounds({
    maxBytes: 8 * 1024,
    maxDepth: 8,
    maxNodes: 256,
    maxStringBytes: 4 * 1024,
    maxArrayItems: 100,
    maxObjectKeys: 100,
  }),
  checkpoint: frozenBounds({
    maxBytes: 256 * 1024,
    maxDepth: 24,
    maxNodes: 10_000,
    maxStringBytes: 32 * 1024,
    maxArrayItems: 1_000,
    maxObjectKeys: 1_000,
  }),
  effect_payload: frozenBounds({
    maxBytes: 128 * 1024,
    maxDepth: 24,
    maxNodes: 5_000,
    maxStringBytes: 32 * 1024,
    maxArrayItems: 500,
    maxObjectKeys: 500,
  }),
  effect_receipt: frozenBounds({
    maxBytes: 16 * 1024,
    maxDepth: 12,
    maxNodes: 512,
    maxStringBytes: 4 * 1024,
    maxArrayItems: 100,
    maxObjectKeys: 100,
  }),
  event_data: frozenBounds({
    maxBytes: 8 * 1024,
    maxDepth: 8,
    maxNodes: 256,
    maxStringBytes: 4 * 1024,
    maxArrayItems: 100,
    maxObjectKeys: 100,
  }),
});

export const DURABLE_ERROR_MAX_BYTES = 1_024 as const;

export type DurableJsonValidationCode =
  | "durable_json_schema_invalid"
  | "durable_json_contract_invalid"
  | "durable_json_type_invalid"
  | "durable_json_cycle"
  | "durable_json_bytes_exceeded"
  | "durable_json_depth_exceeded"
  | "durable_json_nodes_exceeded"
  | "durable_json_string_exceeded"
  | "durable_json_array_exceeded"
  | "durable_json_object_exceeded"
  | "durable_json_secret_detected";

/** Stable, value-free validation error safe to surface in operational logs. */
export class DurableJsonValidationError extends Error {
  constructor(
    readonly code: DurableJsonValidationCode,
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = "DurableJsonValidationError";
  }
}

export interface DurableSecretFinding {
  kind: "sensitive_key" | "secret_value" | "invalid_credential_ref";
  path: string;
}

export interface ValidatedDurableJson<T extends DurableJson> {
  /** Canonically cloned JSON, with sorted object insertion order. */
  value: T;
  canonicalJson: string;
  bytes: number;
  nodes: number;
}

export interface ParsedDurableJsonContractValue<
  T extends DurableJson,
> extends ValidatedDurableJson<T> {
  schemaVersion: number;
  fingerprint: string;
}

const BOUND_KEYS = [
  "maxBytes",
  "maxDepth",
  "maxNodes",
  "maxStringBytes",
  "maxArrayItems",
  "maxObjectKeys",
] as const satisfies readonly (keyof DurableJsonBounds)[];

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const CREDENTIAL_REF_KEY = "credentialref";
const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authtoken",
  "sessiontoken",
  "bearertoken",
  "apikey",
  "accesskey",
  "secretkey",
  "clientsecret",
  "signingsecret",
  "webhooksecret",
  "secret",
  "password",
  "passwd",
  "pwd",
  "privatekey",
  "credentials",
  "credential",
  "sessionsecret",
]);

const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\b(?:bearer|basic)\s+[A-Za-z0-9+/_.~=-]{4,}\b/i,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /\b(?:sancho_mcp_|github_pat_|gh[pousr]_|glpat-|sk-|sk_|ntn_|xox[baprs]-|whsec_|rk_live_|lin_api_|npm_|pypi-|hf_)[A-Za-z0-9._-]{8,}\b/i,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bAIza[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /(?:https?|postgres(?:ql)?|mysql|redis|rediss|mongodb(?:\+srv)?):\/\/[^\s/@:]+:[^\s/@]+@/i,
  /[?&](?:access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|signature|sig)=[^&#\s]+/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|password|authorization|cookie|token|secret)\s*[:=]\s*["']?[^\s,"'};]+/i,
  /\b(?:fixture|test|example)[_-](?:secret|token|api[_-]?key)(?:[_-]value)?\b/i,
  /\b(?:secret|token|api[_-]?key)[_-](?:fixture|test|value)\b/i,
];

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  if (normalized === CREDENTIAL_REF_KEY) return false;
  if (SENSITIVE_KEYS.has(normalized)) return true;
  return (
    /(?:access|refresh|auth|bearer|session|oauth|webhook)token$/.test(
      normalized,
    ) ||
    /(?:api|private|secret|signing|encryption|access)key$/.test(normalized) ||
    /(?:client|signing|webhook|session)secret$/.test(normalized) ||
    /password(?:hash|value)?$/.test(normalized)
  );
}

function secretLikeString(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function credentialRefMatches(pattern: RegExp, value: string): boolean {
  const safePattern = new RegExp(pattern.source, pattern.flags);
  safePattern.lastIndex = 0;
  return safePattern.test(value);
}

function plainObjectDescriptor(
  value: object,
  path: string,
): Record<string, PropertyDescriptor> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new DurableJsonValidationError(
      "durable_json_type_invalid",
      "Durable JSON objects must have a plain prototype",
      path,
    );
  }
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length > 0) {
    throw new DurableJsonValidationError(
      "durable_json_type_invalid",
      "Durable JSON cannot contain symbol properties",
      path,
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new DurableJsonValidationError(
        "durable_json_type_invalid",
        "Durable JSON cannot contain hidden or accessor properties",
        path,
      );
    }
  }
  return descriptors;
}

function assertPositiveSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      `Durable JSON ${name} must be a positive safe integer`,
    );
  }
  return value as number;
}

export function validateDurableJsonBounds(
  bounds: DurableJsonBounds,
  ceiling?: Readonly<DurableJsonBounds>,
): Readonly<DurableJsonBounds> {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable JSON bounds must be an object",
    );
  }
  const ownKeys = Object.keys(bounds);
  if (
    ownKeys.length !== BOUND_KEYS.length ||
    ownKeys.some((key) => !BOUND_KEYS.includes(key as keyof DurableJsonBounds))
  ) {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable JSON bounds must use the closed bounds schema",
    );
  }
  const normalized = Object.fromEntries(
    BOUND_KEYS.map((key) => [key, assertPositiveSafeInteger(bounds[key], key)]),
  ) as unknown as DurableJsonBounds;
  if (ceiling && BOUND_KEYS.some((key) => normalized[key] > ceiling[key])) {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable JSON contract bounds exceed the repository ceiling",
    );
  }
  return frozenBounds(normalized);
}

export function validateDurableSecretPolicy(
  policy: DurableSecretPolicy,
): Readonly<DurableSecretPolicy> {
  if (!policy || typeof policy !== "object" || policy.mode !== "reject") {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable secret policy must reject secret-bearing values",
    );
  }
  const keys = Object.keys(policy);
  if (
    keys.some((key) => key !== "mode" && key !== "credentialRefPattern") ||
    (policy.credentialRefPattern !== undefined &&
      !(policy.credentialRefPattern instanceof RegExp))
  ) {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable secret policy uses an unsupported option",
    );
  }
  return policy;
}

export function validateDurableJsonContractDescriptor<T extends DurableJson>(
  contract: DurableJsonContract<T>,
  surface: DurableJsonSurface,
): void {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable JSON contract must be an object",
    );
  }
  const keys = Object.keys(contract);
  if (
    keys.some(
      (key) =>
        key !== "schemaVersion" &&
        key !== "bounds" &&
        key !== "secrets" &&
        key !== "parse",
    )
  ) {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable JSON contract uses an unsupported option",
    );
  }
  assertPositiveSafeInteger(contract.schemaVersion, "schemaVersion");
  validateDurableJsonBounds(
    contract.bounds,
    DURABLE_JSON_GLOBAL_BOUNDS[surface],
  );
  validateDurableSecretPolicy(contract.secrets);
  if (typeof contract.parse !== "function") {
    throw new DurableJsonValidationError(
      "durable_json_contract_invalid",
      "Durable JSON contract requires a parser",
    );
  }
}

interface SerializeOptions {
  bounds: Readonly<DurableJsonBounds>;
  secrets?: Readonly<DurableSecretPolicy>;
}

function serializeDurableJson(
  value: unknown,
  options: SerializeOptions,
): { canonicalJson: string; nodes: number } {
  let nodes = 0;
  const ancestors = new WeakSet<object>();

  const visit = (current: unknown, depth: number, path: string): string => {
    nodes += 1;
    if (nodes > options.bounds.maxNodes) {
      throw new DurableJsonValidationError(
        "durable_json_nodes_exceeded",
        "Durable JSON exceeds its node limit",
        path,
      );
    }
    if (depth > options.bounds.maxDepth) {
      throw new DurableJsonValidationError(
        "durable_json_depth_exceeded",
        "Durable JSON exceeds its depth limit",
        path,
      );
    }
    if (current === null) return "null";
    if (typeof current === "boolean") return current ? "true" : "false";
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new DurableJsonValidationError(
          "durable_json_type_invalid",
          "Durable JSON numbers must be finite",
          path,
        );
      }
      return JSON.stringify(Object.is(current, -0) ? 0 : current);
    }
    if (typeof current === "string") {
      if (byteLength(current) > options.bounds.maxStringBytes) {
        throw new DurableJsonValidationError(
          "durable_json_string_exceeded",
          "Durable JSON exceeds its string byte limit",
          path,
        );
      }
      if (options.secrets && secretLikeString(current)) {
        throw new DurableJsonValidationError(
          "durable_json_secret_detected",
          "Durable JSON contains secret-like material",
          path,
        );
      }
      return JSON.stringify(current);
    }
    if (typeof current !== "object") {
      throw new DurableJsonValidationError(
        "durable_json_type_invalid",
        "Durable JSON contains a non-JSON value",
        path,
      );
    }
    if (ancestors.has(current)) {
      throw new DurableJsonValidationError(
        "durable_json_cycle",
        "Durable JSON cannot contain cycles",
        path,
      );
    }
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (current.length > options.bounds.maxArrayItems) {
          throw new DurableJsonValidationError(
            "durable_json_array_exceeded",
            "Durable JSON exceeds its array item limit",
            path,
          );
        }
        if (Object.getOwnPropertySymbols(current).length > 0) {
          throw new DurableJsonValidationError(
            "durable_json_type_invalid",
            "Durable JSON arrays cannot contain symbol properties",
            path,
          );
        }
        const descriptors = Object.getOwnPropertyDescriptors(current);
        const ownKeys = Object.keys(current);
        if (
          ownKeys.length !== current.length ||
          ownKeys.some((key, index) => {
            const descriptor = descriptors[key];
            return (
              key !== String(index) ||
              !descriptor?.enumerable ||
              !("value" in descriptor)
            );
          })
        ) {
          throw new DurableJsonValidationError(
            "durable_json_type_invalid",
            "Durable JSON arrays must be dense and unadorned",
            path,
          );
        }
        const values = ownKeys.map((key, index) =>
          visit(descriptors[key]!.value, depth + 1, `${path}[${index}]`),
        );
        return `[${values.join(",")}]`;
      }

      const descriptors = plainObjectDescriptor(current, path);
      const keys = Object.keys(descriptors);
      if (keys.length > options.bounds.maxObjectKeys) {
        throw new DurableJsonValidationError(
          "durable_json_object_exceeded",
          "Durable JSON exceeds its object key limit",
          path,
        );
      }
      keys.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
      const fields = keys.map((key) => {
        const childPath = `${path}.${key}`;
        if (UNSAFE_OBJECT_KEYS.has(key)) {
          throw new DurableJsonValidationError(
            "durable_json_type_invalid",
            "Durable JSON contains an unsafe object key",
            childPath,
          );
        }
        if (byteLength(key) > options.bounds.maxStringBytes) {
          throw new DurableJsonValidationError(
            "durable_json_string_exceeded",
            "Durable JSON exceeds its key byte limit",
            childPath,
          );
        }
        const descriptor = descriptors[key]!;
        const child = descriptor.value;
        if (options.secrets) {
          if (sensitiveKey(key)) {
            throw new DurableJsonValidationError(
              "durable_json_secret_detected",
              "Durable JSON contains a sensitive key",
              childPath,
            );
          }
          if (normalizedKey(key) === CREDENTIAL_REF_KEY) {
            if (
              typeof child !== "string" ||
              child.length < 1 ||
              secretLikeString(child) ||
              (options.secrets.credentialRefPattern &&
                !credentialRefMatches(
                  options.secrets.credentialRefPattern,
                  child,
                ))
            ) {
              throw new DurableJsonValidationError(
                "durable_json_secret_detected",
                "Durable JSON contains an invalid credential reference",
                childPath,
              );
            }
          }
        }
        return `${JSON.stringify(key)}:${visit(child, depth + 1, childPath)}`;
      });
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  };

  return { canonicalJson: visit(value, 1, "$"), nodes };
}

export function validateDurableJson<T extends DurableJson>(
  value: unknown,
  options: {
    bounds: Readonly<DurableJsonBounds>;
    secrets?: Readonly<DurableSecretPolicy>;
  },
): ValidatedDurableJson<T> {
  const bounds = validateDurableJsonBounds(options.bounds as DurableJsonBounds);
  const secrets = options.secrets
    ? validateDurableSecretPolicy(options.secrets as DurableSecretPolicy)
    : undefined;
  const serialized = serializeDurableJson(value, { bounds, secrets });
  const bytes = byteLength(serialized.canonicalJson);
  if (bytes > bounds.maxBytes) {
    throw new DurableJsonValidationError(
      "durable_json_bytes_exceeded",
      "Durable JSON exceeds its canonical byte limit",
      "$",
    );
  }
  return {
    value: JSON.parse(serialized.canonicalJson) as T,
    canonicalJson: serialized.canonicalJson,
    bytes,
    nodes: serialized.nodes,
  };
}

export function canonicalDurableJson(
  value: DurableJson,
  bounds: Readonly<DurableJsonBounds> = DURABLE_JSON_GLOBAL_BOUNDS.checkpoint,
): string {
  return validateDurableJson(value, { bounds }).canonicalJson;
}

export function durableJsonSha256(value: DurableJson): string {
  return createHash("sha256")
    .update(canonicalDurableJson(value), "utf8")
    .digest("hex");
}

export function isDurableJsonObject(
  value: DurableJson,
): value is DurableJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseDurableJsonContractValue<T extends DurableJson>(
  contract: DurableJsonContract<T>,
  rawValue: unknown,
  surface: DurableJsonSurface,
): ParsedDurableJsonContractValue<T> {
  validateDurableJsonContractDescriptor(contract, surface);
  // Inspect the caller-provided JSON before schema projection. A parser may
  // intentionally strip safe unknown properties, but it must never make an
  // oversized or secret-bearing raw command disappear before the guard sees it.
  validateDurableJson(rawValue, {
    bounds: contract.bounds,
    secrets: contract.secrets,
  });
  let parsed: T;
  try {
    parsed = contract.parse(rawValue);
  } catch (error) {
    if (error instanceof DurableJsonValidationError) throw error;
    throw new DurableJsonValidationError(
      "durable_json_schema_invalid",
      "Durable JSON does not match its closed schema",
    );
  }
  const validated = validateDurableJson<T>(parsed, {
    bounds: contract.bounds,
    secrets: contract.secrets,
  });
  const schemaVersion = assertPositiveSafeInteger(
    contract.schemaVersion,
    "schemaVersion",
  );
  const fingerprint = durableJsonSha256({
    schemaVersion,
    payload: validated.value,
  });
  return { ...validated, schemaVersion, fingerprint };
}

export function findDurableSecret(
  value: DurableJson,
  policy: DurableSecretPolicy = { mode: "reject" },
): DurableSecretFinding | null {
  try {
    validateDurableJson(value, {
      bounds: DURABLE_JSON_GLOBAL_BOUNDS.checkpoint,
      secrets: policy,
    });
    return null;
  } catch (error) {
    if (
      error instanceof DurableJsonValidationError &&
      error.code === "durable_json_secret_detected"
    ) {
      const message = error.message.toLowerCase();
      return {
        kind: message.includes("credential")
          ? "invalid_credential_ref"
          : message.includes("key")
            ? "sensitive_key"
            : "secret_value",
        path: error.path ?? "$",
      };
    }
    throw error;
  }
}
