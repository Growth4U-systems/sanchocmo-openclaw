import { z } from "zod";

export const PRODUCT_DEFINITION_STATUSES = [
  "approved",
  "draft",
  "partial",
  "missing",
  "conflict",
  "stale",
] as const;

export const productDefinitionStatusSchema = z.enum(PRODUCT_DEFINITION_STATUSES);
export type ProductDefinitionStatus = z.infer<typeof productDefinitionStatusSchema>;

export const PRODUCT_APPROVER_IDS = ["martin", "alfonso"] as const;
export const productApproverIdSchema = z.enum(PRODUCT_APPROVER_IDS);
export type ProductApproverId = z.infer<typeof productApproverIdSchema>;

const CAPABILITY_ID_RE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const dateSchema = z.string().date();
const dateTimeSchema = z.string().datetime({ offset: true });

function isSafeRepositoryPath(value: string): boolean {
  return (
    !value.startsWith("/")
    && !value.includes("\\")
    && !value.includes("\0")
    && !value.split("/").includes("..")
  );
}

function isValidRoutePattern(value: string): boolean {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || value.includes("//")) {
    return false;
  }
  if (value === "/") return true;

  const segments = value.slice(1).split("/");
  for (const [index, segment] of segments.entries()) {
    if (!segment) return false;
    if (segment === "**") return index === segments.length - 1;
    if (segment === "*") continue;
    if (/^:[A-Za-z][A-Za-z0-9_]*$/.test(segment)) continue;
    if (!/^[A-Za-z0-9._~-]+$/.test(segment)) return false;
  }
  return true;
}

export const capabilityIdSchema = z.string().trim().min(3).max(120).regex(
  CAPABILITY_ID_RE,
  "Use a dot-separated lowercase capability id (for example mission-control.chat.run)",
);

export const repositoryPathSchema = z.string().trim().min(1).max(500).refine(
  isSafeRepositoryPath,
  "Expected a safe repository-relative path",
);

export const routePatternSchema = z.string().trim().min(1).max(300).refine(
  isValidRoutePattern,
  "Expected an absolute route pattern; use :param, * or a terminal ** wildcard",
);

const nonEmptyTextSchema = z.string().trim().min(1).max(2_000);

const definitionGapSchema = z.object({
  kind: z.enum(["behavior", "copy", "state", "flow", "permission", "visual", "acceptance-test", "other"]),
  description: nonEmptyTextSchema,
  requestedArtifact: z.enum(["decision", "copy", "acceptance-criteria", "flow", "permissions", "screenshot", "mockup", "test"]).optional(),
}).strict();

const capabilityStateSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9-]*$/),
  expectedBehavior: nonEmptyTextSchema,
}).strict();

const sideEffectSchema = z.object({
  kind: z.enum(["none", "local-write", "external-write", "runtime-execution", "notification"]),
  description: nonEmptyTextSchema,
  reversible: z.boolean(),
}).strict();

const acceptanceTestSchema = z.object({
  id: z.string().trim().min(1).max(120).regex(/^[a-z][a-z0-9-]*$/),
  description: nonEmptyTextSchema,
  sourcePath: repositoryPathSchema,
}).strict();

const runbookReferenceSchema = z.object({
  id: z.string().trim().min(1).max(120).regex(/^[a-z][a-z0-9-]*$/),
  description: nonEmptyTextSchema,
  automation: z.enum(["not-implemented", "read-only", "approval-required", "preapproved"]),
}).strict();

const uxReferenceSchema = z.object({
  kind: z.enum(["implementation", "screenshot", "mockup", "flow", "copy", "spec"]),
  path: repositoryPathSchema,
  description: nonEmptyTextSchema,
  requiredForDecision: z.boolean(),
}).strict();

const repositoryReferenceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  refPolicy: z.literal("deployed-sha"),
}).strict();

export const productCapabilitySchema = z.object({
  id: capabilityIdSchema,
  name: z.string().trim().min(1).max(200),
  summary: nonEmptyTextSchema,
  owner: z.enum(["product", "platform", "product-platform"]),
  lifecycle: z.enum(["experimental", "beta", "ga", "deprecated"]),
  definitionStatus: productDefinitionStatusSchema,
  definitionGaps: z.array(definitionGapSchema).max(30),
  routes: z.array(routePatternSchema).min(1).max(50),
  roles: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  tenantScoped: z.boolean(),
  userJob: nonEmptyTextSchema,
  preconditions: z.array(nonEmptyTextSchema).max(50),
  happyPath: z.array(nonEmptyTextSchema).min(1).max(50),
  states: z.array(capabilityStateSchema).min(1).max(50),
  sideEffects: z.array(sideEffectSchema).max(30),
  services: z.array(z.string().trim().min(1).max(160)).max(30),
  repositories: z.array(repositoryReferenceSchema).min(1).max(20),
  sourceFiles: z.array(repositoryPathSchema).min(1).max(100),
  featureFlags: z.array(z.string().trim().min(1).max(120)).max(30),
  acceptanceTests: z.array(acceptanceTestSchema).max(50),
  runbooks: z.array(runbookReferenceSchema).max(30),
  uxReferences: z.array(uxReferenceSchema).max(50),
  approvedBy: productApproverIdSchema.optional(),
  approvedAt: dateTimeSchema.optional(),
  version: z.number().int().positive(),
  lastReviewedAt: dateSchema,
  reviewCadenceDays: z.number().int().min(1).max(365),
}).strict().superRefine((capability, ctx) => {
  const uniqueFields: Array<[string, string[]]> = [
    ["routes", capability.routes],
    ["roles", capability.roles],
    ["sourceFiles", capability.sourceFiles],
    ["featureFlags", capability.featureFlags],
    ["states", capability.states.map((state) => state.id)],
    ["acceptanceTests", capability.acceptanceTests.map((test) => test.id)],
    ["runbooks", capability.runbooks.map((runbook) => runbook.id)],
  ];

  for (const [field, values] of uniqueFields) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${field} must not contain duplicates`,
      });
    }
  }

  if (capability.definitionStatus === "approved") {
    if (!capability.approvedBy) {
      ctx.addIssue({ code: "custom", path: ["approvedBy"], message: "Approved definitions require approvedBy" });
    }
    if (!capability.approvedAt) {
      ctx.addIssue({ code: "custom", path: ["approvedAt"], message: "Approved definitions require approvedAt" });
    }
    if (capability.definitionGaps.length > 0) {
      ctx.addIssue({ code: "custom", path: ["definitionGaps"], message: "Approved definitions cannot have open gaps" });
    }
    if (capability.acceptanceTests.length === 0) {
      ctx.addIssue({ code: "custom", path: ["acceptanceTests"], message: "Approved definitions require acceptance tests" });
    }
    if (capability.uxReferences.length === 0) {
      ctx.addIssue({ code: "custom", path: ["uxReferences"], message: "Approved definitions require UX or implementation references" });
    }
  } else if (capability.definitionGaps.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["definitionGaps"],
      message: `${capability.definitionStatus} definitions must say what is missing or conflicting`,
    });
  }
});

export type ProductCapability = z.infer<typeof productCapabilitySchema>;

export const productCapabilityManifestSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: dateTimeSchema,
  capabilities: z.array(productCapabilitySchema).min(1).max(500),
}).strict().superRefine((manifest, ctx) => {
  const ids = new Map<string, number>();
  const routes = new Map<string, { capabilityId: string; index: number }>();

  manifest.capabilities.forEach((capability, index) => {
    const previousId = ids.get(capability.id);
    if (previousId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["capabilities", index, "id"],
        message: `Duplicate capability id; first declared at capabilities.${previousId}.id`,
      });
    } else {
      ids.set(capability.id, index);
    }

    for (const route of capability.routes) {
      const previous = routes.get(route);
      if (previous && previous.capabilityId !== capability.id) {
        ctx.addIssue({
          code: "custom",
          path: ["capabilities", index, "routes"],
          message: `Exact route ${route} is already owned by ${previous.capabilityId}`,
        });
      } else {
        routes.set(route, { capabilityId: capability.id, index });
      }
    }
  });
});

export type ProductCapabilityManifest = z.infer<typeof productCapabilityManifestSchema>;
