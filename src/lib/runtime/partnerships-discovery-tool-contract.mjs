const TEXT_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const PLAN_FIELDS = new Set([
  "title",
  "sectors",
  "hashtags",
  "networks",
  "tiers",
  "audienceEsMinPct",
  "targetVolume",
  "signals",
  "templates",
  "qualificationMode",
  "disqualifyThreshold",
  "notes",
]);
const SIGNAL_FIELDS = new Set(["adLibrary", "competitorBrands"]);
const TIER_KEYS = new Set(["nano", "micro", "mid", "macro"]);
const QUALIFICATION_MODES = new Set(["auto", "manual", "hybrid"]);

const boundedStringSchema = (maxLength) => ({
  type: "string",
  minLength: 1,
  maxLength,
});

const boundedStringListSchema = (maxItems, maxLength) => ({
  type: "array",
  minItems: 1,
  maxItems,
  uniqueItems: true,
  items: boundedStringSchema(maxLength),
});

/**
 * Closed model-facing command. Runtime validation below is authoritative;
 * this schema is also intentionally explicit so OpenClaw cannot invent a
 * tenant, command id, execution mode, callback or polling surface.
 */
export const partnershipsDiscoveryStartParameters = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["plan"],
  properties: {
    plan: {
      type: "object",
      additionalProperties: false,
      required: ["title", "sectors", "networks"],
      properties: {
        title: boundedStringSchema(160),
        sectors: boundedStringListSchema(8, 80),
        hashtags: {
          type: "array",
          maxItems: 12,
          uniqueItems: true,
          items: boundedStringSchema(80),
        },
        networks: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          uniqueItems: true,
          items: { type: "string", enum: ["instagram"] },
        },
        tiers: {
          type: "array",
          maxItems: 4,
          uniqueItems: true,
          items: {
            type: "string",
            enum: ["nano", "micro", "mid", "macro"],
          },
        },
        audienceEsMinPct: { type: "number", minimum: 0, maximum: 100 },
        targetVolume: {
          type: "integer",
          minimum: 1,
          maximum: 100,
        },
        signals: {
          type: "object",
          additionalProperties: false,
          properties: {
            adLibrary: { type: "boolean" },
            competitorBrands: {
              type: "array",
              maxItems: 10,
              uniqueItems: true,
              items: boundedStringSchema(120),
            },
          },
        },
        templates: {
          type: "array",
          maxItems: 10,
          uniqueItems: true,
          items: boundedStringSchema(120),
        },
        qualificationMode: {
          type: "string",
          enum: ["auto", "manual", "hybrid"],
        },
        disqualifyThreshold: {
          type: "number",
          minimum: 0,
          maximum: 100,
        },
        notes: boundedStringSchema(500),
      },
    },
  },
});

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedText(value, maximum) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum && !TEXT_CONTROL_PATTERN.test(text)
    ? text
    : null;
}

function canonicalList(
  value,
  { maximumItems, maximumLength, normalize = (item) => item },
) {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const result = value.map((item) => {
    const text = boundedText(item, maximumLength);
    return text ? normalize(text) : null;
  });
  if (result.some((item) => !item)) return null;
  const identities = result.map((item) => item.toLowerCase());
  return new Set(identities).size === identities.length ? result : null;
}

function boundedPercentage(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

/**
 * Canonicalize and validate the exact command again at every trust boundary.
 * Returns null for unknown fields, unsupported networks or excessive input.
 */
export function parsePartnershipsDiscoveryStartInput(value) {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, "plan") ||
    !isPlainRecord(value.plan) ||
    Object.keys(value.plan).some((key) => !PLAN_FIELDS.has(key))
  ) {
    return null;
  }
  const raw = value.plan;
  const title = boundedText(raw.title, 160);
  const sectors = canonicalList(raw.sectors, {
    maximumItems: 8,
    maximumLength: 80,
    normalize: (item) => item.toLowerCase(),
  });
  const networks = canonicalList(raw.networks, {
    maximumItems: 1,
    maximumLength: 20,
    normalize: (item) => item.toLowerCase(),
  });
  if (
    !title ||
    !sectors?.length ||
    networks?.length !== 1 ||
    networks[0] !== "instagram"
  ) {
    return null;
  }

  const plan = { title, sectors, networks };
  if (raw.hashtags !== undefined) {
    const hashtags = canonicalList(raw.hashtags, {
      maximumItems: 12,
      maximumLength: 80,
      normalize: (item) =>
        `#${item.replace(/^#+/, "").replace(/\s+/g, "").toLowerCase()}`,
    });
    if (!hashtags || hashtags.some((item) => item === "#")) return null;
    plan.hashtags = hashtags;
  }
  if (raw.tiers !== undefined) {
    const tiers = canonicalList(raw.tiers, {
      maximumItems: 4,
      maximumLength: 16,
      normalize: (item) => item.toLowerCase(),
    });
    if (!tiers || tiers.some((tier) => !TIER_KEYS.has(tier))) return null;
    plan.tiers = tiers;
  }
  if (raw.audienceEsMinPct !== undefined) {
    const percentage = boundedPercentage(raw.audienceEsMinPct);
    if (percentage === null) return null;
    plan.audienceEsMinPct = percentage;
  }
  if (raw.targetVolume !== undefined) {
    if (
      !Number.isSafeInteger(raw.targetVolume) ||
      raw.targetVolume < 1 ||
      raw.targetVolume > 100
    ) {
      return null;
    }
    plan.targetVolume = raw.targetVolume;
  }
  if (raw.signals !== undefined) {
    if (
      !isPlainRecord(raw.signals) ||
      Object.keys(raw.signals).some((key) => !SIGNAL_FIELDS.has(key))
    ) {
      return null;
    }
    const signals = {};
    if (raw.signals.adLibrary !== undefined) {
      if (typeof raw.signals.adLibrary !== "boolean") return null;
      signals.adLibrary = raw.signals.adLibrary;
    }
    if (raw.signals.competitorBrands !== undefined) {
      const competitorBrands = canonicalList(raw.signals.competitorBrands, {
        maximumItems: 10,
        maximumLength: 120,
      });
      if (!competitorBrands) return null;
      signals.competitorBrands = competitorBrands;
    }
    plan.signals = signals;
  }
  if (raw.templates !== undefined) {
    const templates = canonicalList(raw.templates, {
      maximumItems: 10,
      maximumLength: 120,
    });
    if (!templates) return null;
    plan.templates = templates;
  }
  if (raw.qualificationMode !== undefined) {
    const mode = boundedText(raw.qualificationMode, 16)?.toLowerCase();
    if (!mode || !QUALIFICATION_MODES.has(mode)) return null;
    plan.qualificationMode = mode;
  }
  if (raw.disqualifyThreshold !== undefined) {
    const threshold = boundedPercentage(raw.disqualifyThreshold);
    if (threshold === null) return null;
    plan.disqualifyThreshold = threshold;
  }
  if (raw.notes !== undefined) {
    const notes = boundedText(raw.notes, 500);
    if (!notes) return null;
    plan.notes = notes;
  }
  return { plan };
}
