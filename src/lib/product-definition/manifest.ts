import rawManifest from "../../../config/product-capability-manifest.json";
import {
  productCapabilityManifestSchema,
  type ProductCapability,
  type ProductCapabilityManifest,
  type ProductDefinitionStatus,
} from "./schema";

export class ProductCapabilityManifestError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid product capability manifest:\n- ${issues.join("\n- ")}`);
    this.name = "ProductCapabilityManifestError";
    this.issues = issues;
  }
}

export function parseProductCapabilityManifest(input: unknown): ProductCapabilityManifest {
  const parsed = productCapabilityManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProductCapabilityManifestError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "manifest";
        return `${path}: ${issue.message}`;
      }),
    );
  }
  return parsed.data;
}

let cachedManifest: ProductCapabilityManifest | undefined;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function getProductCapabilityManifest(): ProductCapabilityManifest {
  cachedManifest ??= deepFreeze(parseProductCapabilityManifest(rawManifest));
  return cachedManifest;
}

interface RouteMatch {
  capability: ProductCapability;
  pattern: string;
  score: number;
}

export type ProductDefinitionResolution =
  | {
      kind: "resolved";
      status: ProductDefinitionStatus;
      source: "capability" | "route";
      capability: ProductCapability;
      route?: string;
      matchedRoute?: string;
    }
  | {
      kind: "missing";
      status: "missing";
      reason: "capability_not_found" | "route_not_mapped" | "empty_query";
      capabilityId?: string;
      route?: string;
      suggestedCapabilityIds: string[];
    }
  | {
      kind: "conflict";
      status: "conflict";
      reason: "ambiguous_route" | "capability_route_mismatch";
      capabilityId?: string;
      route: string;
      candidates: Array<{ capabilityId: string; matchedRoute?: string }>;
    };

export type ProductDefinitionQuery =
  | { capabilityId: string; route?: string }
  | { capabilityId?: never; route: string };

function normalizeRoute(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed, "http://sancho.local").pathname;
  } catch {
    pathname = trimmed.split(/[?#]/, 1)[0] || "/";
  }

  const normalized = `/${pathname}`.replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function routeSegments(route: string): string[] {
  return route === "/" ? [] : route.slice(1).split("/");
}

function matchRoutePattern(pattern: string, route: string): number | null {
  const patternSegments = routeSegments(pattern);
  const routeParts = routeSegments(route);
  let routeIndex = 0;
  let score = 0;

  for (const patternPart of patternSegments) {
    if (patternPart === "**") {
      return score + 1;
    }
    if (routeIndex >= routeParts.length) return null;

    if (patternPart === "*") {
      score += 10;
    } else if (patternPart.startsWith(":")) {
      score += 100;
    } else if (patternPart === routeParts[routeIndex]) {
      score += 1_000;
    } else {
      return null;
    }
    routeIndex += 1;
  }

  if (routeIndex !== routeParts.length) return null;
  return score + 50;
}

function matchesForRoute(manifest: ProductCapabilityManifest, rawRoute: string): RouteMatch[] {
  const route = normalizeRoute(rawRoute);
  const bestByCapability = new Map<string, RouteMatch>();

  for (const capability of manifest.capabilities) {
    for (const pattern of capability.routes) {
      const score = matchRoutePattern(pattern, route);
      if (score === null) continue;
      const previous = bestByCapability.get(capability.id);
      if (!previous || score > previous.score) {
        bestByCapability.set(capability.id, { capability, pattern, score });
      }
    }
  }

  return [...bestByCapability.values()].sort((left, right) => (
    right.score - left.score || left.capability.id.localeCompare(right.capability.id)
  ));
}

function routeResolution(
  manifest: ProductCapabilityManifest,
  rawRoute: string,
): ProductDefinitionResolution {
  const route = normalizeRoute(rawRoute);
  const matches = matchesForRoute(manifest, route);
  if (matches.length === 0) {
    return {
      kind: "missing",
      status: "missing",
      reason: "route_not_mapped",
      route,
      suggestedCapabilityIds: [],
    };
  }

  const topScore = matches[0].score;
  const best = matches.filter((match) => match.score === topScore);
  if (best.length > 1) {
    return {
      kind: "conflict",
      status: "conflict",
      reason: "ambiguous_route",
      route,
      candidates: best.map((match) => ({
        capabilityId: match.capability.id,
        matchedRoute: match.pattern,
      })),
    };
  }

  return {
    kind: "resolved",
    status: best[0].capability.definitionStatus,
    source: "route",
    capability: best[0].capability,
    route,
    matchedRoute: best[0].pattern,
  };
}

export function resolveProductDefinition(
  query: ProductDefinitionQuery,
  manifest: ProductCapabilityManifest = getProductCapabilityManifest(),
): ProductDefinitionResolution {
  const capabilityId = "capabilityId" in query ? query.capabilityId?.trim() : undefined;
  const rawRoute = query.route?.trim();

  if (!capabilityId && !rawRoute) {
    return {
      kind: "missing",
      status: "missing",
      reason: "empty_query",
      suggestedCapabilityIds: [],
    };
  }

  if (!capabilityId && rawRoute) return routeResolution(manifest, rawRoute);

  const capability = manifest.capabilities.find((entry) => entry.id === capabilityId);
  if (!capability) {
    const routeCandidates = rawRoute ? matchesForRoute(manifest, rawRoute) : [];
    return {
      kind: "missing",
      status: "missing",
      reason: "capability_not_found",
      capabilityId,
      ...(rawRoute ? { route: normalizeRoute(rawRoute) } : {}),
      suggestedCapabilityIds: routeCandidates.map((match) => match.capability.id),
    };
  }

  if (rawRoute) {
    const route = normalizeRoute(rawRoute);
    const directMatch = capability.routes
      .map((pattern) => ({ pattern, score: matchRoutePattern(pattern, route) }))
      .filter((entry): entry is { pattern: string; score: number } => entry.score !== null)
      .sort((left, right) => right.score - left.score)[0];

    if (!directMatch) {
      return {
        kind: "conflict",
        status: "conflict",
        reason: "capability_route_mismatch",
        capabilityId,
        route,
        candidates: [
          { capabilityId: capability.id },
          ...matchesForRoute(manifest, route).map((match) => ({
            capabilityId: match.capability.id,
            matchedRoute: match.pattern,
          })),
        ],
      };
    }

    return {
      kind: "resolved",
      status: capability.definitionStatus,
      source: "capability",
      capability,
      route,
      matchedRoute: directMatch.pattern,
    };
  }

  return {
    kind: "resolved",
    status: capability.definitionStatus,
    source: "capability",
    capability,
  };
}

export function listProductCapabilities(
  manifest: ProductCapabilityManifest = getProductCapabilityManifest(),
): ProductCapability[] {
  return [...manifest.capabilities];
}
