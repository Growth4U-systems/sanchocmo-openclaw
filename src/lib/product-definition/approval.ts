import { createHash } from "node:crypto";
import { z } from "zod";
import {
  PRODUCT_APPROVER_IDS,
  capabilityIdSchema,
  productApproverIdSchema,
  type ProductApproverId,
} from "./schema";

export const PRODUCT_APPROVAL_QUORUM = 1 as const;

/**
 * Canonical principals, not Slack user IDs. The Slack adapter must map an
 * authenticated Slack identity to one of these principals before calling the
 * transition functions. Being present in the channel is never authorization.
 */
const PRODUCT_APPROVERS = Object.freeze([
  Object.freeze({
    id: "martin" as const,
    displayName: "Martín",
    slackUserIdEnvironmentVariable: "SANCHO_PRODUCT_APPROVER_MARTIN_SLACK_USER_ID",
  }),
  Object.freeze({
    id: "alfonso" as const,
    displayName: "Alfonso",
    slackUserIdEnvironmentVariable: "SANCHO_PRODUCT_APPROVER_ALFONSO_SLACK_USER_ID",
  }),
]);

export const PRODUCT_APPROVAL_POLICY = Object.freeze({
  channelKey: "sancho-pruebas",
  slackChannelLabel: "Sancho Pruebas",
  slackChannelIdEnvironmentVariable: "SANCHO_PRODUCT_APPROVAL_SLACK_CHANNEL_ID",
  quorum: PRODUCT_APPROVAL_QUORUM,
  approvers: PRODUCT_APPROVERS,
});

export const PRODUCT_APPROVAL_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "expired",
  "superseded",
] as const;

export type ProductApprovalStatus = typeof PRODUCT_APPROVAL_STATUSES[number];

export const PRODUCT_APPROVAL_TRANSITIONS: Readonly<Record<ProductApprovalStatus, readonly ProductApprovalStatus[]>> = {
  draft: ["pending", "expired", "superseded"],
  pending: ["approved", "rejected", "changes_requested", "expired"],
  approved: [],
  rejected: ["superseded"],
  changes_requested: ["superseded"],
  expired: ["superseded"],
  superseded: [],
};

const DATE_TIME_SCHEMA = z.string().datetime({ offset: true });
const boundedText = z.string().trim().min(1).max(4_000);

export const productDecisionProposalSchema = z.object({
  incidentId: z.string().trim().min(1).max(160),
  capabilityId: capabilityIdSchema,
  requestedBy: z.object({
    userId: z.string().trim().min(1).max(160),
    displayName: z.string().trim().min(1).max(200),
    tenantSlug: z.string().trim().min(1).max(120),
  }).strict(),
  userGoal: boundedText,
  observedBehavior: boundedText,
  currentDefinition: z.string().trim().max(4_000).nullable(),
  decisionRequired: boundedText,
  proposedOutcome: boundedText,
  impact: z.array(z.string().trim().min(1).max(1_000)).min(1).max(30),
  requiredArtifacts: z.array(z.enum([
    "decision",
    "copy",
    "acceptance-criteria",
    "flow",
    "permissions",
    "screenshot",
    "mockup",
    "test",
  ])).max(20),
}).strict();

export type ProductDecisionProposal = z.infer<typeof productDecisionProposalSchema>;

export const productApprovalDecisionSchema = z.enum(["approve", "reject", "request_changes"]);
export type ProductApprovalDecisionAction = z.infer<typeof productApprovalDecisionSchema>;

export const decideProductApprovalInputSchema = z.object({
  action: productApprovalDecisionSchema,
  approverId: z.string().trim().min(1).max(160),
  surface: z.enum(["growie", "slack"]),
  externalUserId: z.string().trim().min(1).max(160).optional(),
  rationale: z.string().trim().min(1).max(4_000),
  expectedProposalHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  expectedVersion: z.number().int().positive(),
}).strict();

export type DecideProductApprovalInput = z.infer<typeof decideProductApprovalInputSchema>;

const storedDecisionSchema = z.object({
  action: productApprovalDecisionSchema,
  approverId: productApproverIdSchema,
  surface: z.enum(["growie", "slack"]),
  externalUserId: z.string().trim().min(1).max(160).optional(),
  rationale: z.string().trim().min(1).max(4_000),
  decidedAt: DATE_TIME_SCHEMA,
  proposalHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  proposalVersion: z.number().int().positive(),
}).strict();

export const productApprovalRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(160),
  incidentId: z.string().trim().min(1).max(160),
  capabilityId: capabilityIdSchema,
  version: z.number().int().positive(),
  proposalHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  proposal: productDecisionProposalSchema,
  status: z.enum(PRODUCT_APPROVAL_STATUSES),
  authorizedApprovers: z.tuple([z.literal("martin"), z.literal("alfonso")]),
  quorum: z.literal(PRODUCT_APPROVAL_QUORUM),
  createdBy: z.string().trim().min(1).max(160),
  createdAt: DATE_TIME_SCHEMA,
  updatedAt: DATE_TIME_SCHEMA,
  expiresAt: DATE_TIME_SCHEMA,
  submittedAt: DATE_TIME_SCHEMA.optional(),
  decision: storedDecisionSchema.optional(),
  supersedesProposalHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
}).strict().superRefine((request, ctx) => {
  if (request.incidentId !== request.proposal.incidentId) {
    ctx.addIssue({ code: "custom", path: ["incidentId"], message: "Must match proposal.incidentId" });
  }
  if (request.capabilityId !== request.proposal.capabilityId) {
    ctx.addIssue({ code: "custom", path: ["capabilityId"], message: "Must match proposal.capabilityId" });
  }
  if (request.proposalHash !== computeProductProposalHash(request.proposal, request.version)) {
    ctx.addIssue({ code: "custom", path: ["proposalHash"], message: "Does not match proposal content and version" });
  }

  if (request.status === "pending" && !request.submittedAt) {
    ctx.addIssue({ code: "custom", path: ["submittedAt"], message: "Pending requests require submittedAt" });
  }

  const requiredDecision: Partial<Record<ProductApprovalStatus, ProductApprovalDecisionAction>> = {
    approved: "approve",
    rejected: "reject",
    changes_requested: "request_changes",
  };
  const expectedAction = requiredDecision[request.status];
  if (expectedAction && request.decision?.action !== expectedAction) {
    ctx.addIssue({
      code: "custom",
      path: ["decision"],
      message: `${request.status} requests require a ${expectedAction} decision`,
    });
  }
  if (["draft", "pending", "expired"].includes(request.status) && request.decision) {
    ctx.addIssue({ code: "custom", path: ["decision"], message: `${request.status} requests cannot contain a decision` });
  }
  if (request.decision && (
    request.decision.proposalHash !== request.proposalHash
    || request.decision.proposalVersion !== request.version
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["decision"],
      message: "Decision must target the exact proposal hash and version",
    });
  }
  if (request.decision?.surface === "slack" && !request.decision.externalUserId) {
    ctx.addIssue({
      code: "custom",
      path: ["decision", "externalUserId"],
      message: "Slack decisions require the authenticated external identity used for principal mapping",
    });
  }
});

export type ProductApprovalRequest = z.infer<typeof productApprovalRequestSchema>;

export class ProductApprovalError extends Error {
  constructor(
    readonly code:
      | "invalid_contract"
      | "invalid_transition"
      | "unauthorized_approver"
      | "stale_proposal"
      | "expired"
      | "invalid_expiry"
      | "immutable_scope"
      | "unchanged_proposal",
    message: string,
  ) {
    super(message);
    this.name = "ProductApprovalError";
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export function computeProductProposalHash(
  rawProposal: ProductDecisionProposal,
  version: number,
): string {
  const proposal = productDecisionProposalSchema.parse(rawProposal);
  if (!Number.isInteger(version) || version < 1) {
    throw new ProductApprovalError("invalid_contract", "Proposal version must be a positive integer");
  }
  const digest = createHash("sha256")
    .update(`growie-product-proposal:v1\n${version}\n${canonicalJson(proposal)}`, "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

export function parseProductApprovalRequest(input: unknown): ProductApprovalRequest {
  const parsed = productApprovalRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new ProductApprovalError("invalid_contract", issues);
  }
  return parsed.data;
}

function iso(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new ProductApprovalError("invalid_contract", "Invalid transition timestamp");
  return now.toISOString();
}

function assertNotExpired(request: ProductApprovalRequest, now: Date): void {
  if (new Date(request.expiresAt).getTime() <= now.getTime()) {
    throw new ProductApprovalError("expired", `Approval request ${request.requestId} version ${request.version} has expired`);
  }
}

function assertTransition(from: ProductApprovalStatus, to: ProductApprovalStatus): void {
  if (!PRODUCT_APPROVAL_TRANSITIONS[from].includes(to)) {
    throw new ProductApprovalError("invalid_transition", `Cannot transition a product approval from ${from} to ${to}`);
  }
}

export function isAuthorizedProductApprover(value: string): value is ProductApproverId {
  return (PRODUCT_APPROVER_IDS as readonly string[]).includes(value);
}

export interface ProductApprovalSlackIdentityEnvironment {
  [key: string]: string | undefined;
  SANCHO_PRODUCT_APPROVER_MARTIN_SLACK_USER_ID?: string;
  SANCHO_PRODUCT_APPROVER_ALFONSO_SLACK_USER_ID?: string;
}

/** Resolve an authenticated Slack actor to exactly one canonical approver. */
export function resolveSlackProductApprover(
  externalUserId: unknown,
  env: ProductApprovalSlackIdentityEnvironment = process.env,
): ProductApproverId | null {
  if (typeof externalUserId !== "string" || !externalUserId.trim()) return null;
  const candidate = externalUserId.trim();
  const matches = [
    env.SANCHO_PRODUCT_APPROVER_MARTIN_SLACK_USER_ID === candidate ? "martin" : null,
    env.SANCHO_PRODUCT_APPROVER_ALFONSO_SLACK_USER_ID === candidate ? "alfonso" : null,
  ].filter((value): value is ProductApproverId => value !== null);
  // Missing configuration and duplicate mappings both fail closed.
  return matches.length === 1 ? matches[0] : null;
}

export interface CreateProductApprovalDraftInput {
  requestId: string;
  proposal: ProductDecisionProposal;
  createdBy: string;
  expiresAt: string;
}

export function createProductApprovalDraft(
  input: CreateProductApprovalDraftInput,
  now = new Date(),
): ProductApprovalRequest {
  const proposal = productDecisionProposalSchema.parse(input.proposal);
  const createdAt = iso(now);
  if (new Date(input.expiresAt).getTime() <= now.getTime()) {
    throw new ProductApprovalError("invalid_expiry", "Product approval expiry must be in the future");
  }

  return parseProductApprovalRequest({
    requestId: input.requestId,
    incidentId: proposal.incidentId,
    capabilityId: proposal.capabilityId,
    version: 1,
    proposalHash: computeProductProposalHash(proposal, 1),
    proposal,
    status: "draft",
    authorizedApprovers: ["martin", "alfonso"],
    quorum: PRODUCT_APPROVAL_QUORUM,
    createdBy: input.createdBy,
    createdAt,
    updatedAt: createdAt,
    expiresAt: input.expiresAt,
  });
}

export function submitProductApproval(
  rawRequest: ProductApprovalRequest,
  now = new Date(),
): ProductApprovalRequest {
  const request = parseProductApprovalRequest(rawRequest);
  assertTransition(request.status, "pending");
  assertNotExpired(request, now);
  const submittedAt = iso(now);
  return parseProductApprovalRequest({
    ...request,
    status: "pending",
    submittedAt,
    updatedAt: submittedAt,
  });
}

export function decideProductApproval(
  rawRequest: ProductApprovalRequest,
  rawInput: DecideProductApprovalInput,
  now = new Date(),
  slackIdentityEnv: ProductApprovalSlackIdentityEnvironment = process.env,
): ProductApprovalRequest {
  const request = parseProductApprovalRequest(rawRequest);
  const parsedInput = decideProductApprovalInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    const issues = parsedInput.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ProductApprovalError("invalid_contract", issues);
  }
  const input = parsedInput.data;
  if (input.expectedProposalHash !== request.proposalHash || input.expectedVersion !== request.version) {
    throw new ProductApprovalError(
      "stale_proposal",
      `Decision targets a stale product proposal; expected version ${request.version} and hash ${request.proposalHash}`,
    );
  }
  if (!isAuthorizedProductApprover(input.approverId)) {
    throw new ProductApprovalError("unauthorized_approver", "Only Martín or Alfonso can approve product decisions");
  }
  if (input.surface === "slack") {
    const mappedApprover = resolveSlackProductApprover(
      input.externalUserId,
      slackIdentityEnv,
    );
    if (mappedApprover !== input.approverId) {
      throw new ProductApprovalError(
        "unauthorized_approver",
        "The authenticated Slack identity is not mapped to the claimed product approver",
      );
    }
  }
  assertNotExpired(request, now);

  const statusByAction: Record<ProductApprovalDecisionAction, ProductApprovalStatus> = {
    approve: "approved",
    reject: "rejected",
    request_changes: "changes_requested",
  };
  const nextStatus = statusByAction[input.action];
  assertTransition(request.status, nextStatus);
  const decidedAt = iso(now);
  return parseProductApprovalRequest({
    ...request,
    status: nextStatus,
    updatedAt: decidedAt,
    decision: {
      action: input.action,
      approverId: input.approverId,
      surface: input.surface,
      ...(input.externalUserId?.trim() ? { externalUserId: input.externalUserId.trim() } : {}),
      rationale: input.rationale,
      decidedAt,
      proposalHash: request.proposalHash,
      proposalVersion: request.version,
    },
  });
}

export function expireProductApproval(
  rawRequest: ProductApprovalRequest,
  now = new Date(),
): ProductApprovalRequest {
  const request = parseProductApprovalRequest(rawRequest);
  if (new Date(request.expiresAt).getTime() > now.getTime()) {
    throw new ProductApprovalError("invalid_transition", "Cannot expire a product approval before expiresAt");
  }
  assertTransition(request.status, "expired");
  const updatedAt = iso(now);
  return parseProductApprovalRequest({ ...request, status: "expired", updatedAt });
}

export interface ReviseProductApprovalInput {
  proposal: ProductDecisionProposal;
  createdBy: string;
  expiresAt: string;
}

export interface ProductApprovalRevision {
  superseded: ProductApprovalRequest;
  revision: ProductApprovalRequest;
}

export function reviseProductApproval(
  rawRequest: ProductApprovalRequest,
  input: ReviseProductApprovalInput,
  now = new Date(),
): ProductApprovalRevision {
  const request = parseProductApprovalRequest(rawRequest);
  assertTransition(request.status, "superseded");
  const proposal = productDecisionProposalSchema.parse(input.proposal);
  if (proposal.incidentId !== request.incidentId || proposal.capabilityId !== request.capabilityId) {
    throw new ProductApprovalError(
      "immutable_scope",
      "A revision cannot move a product decision to another incident or capability",
    );
  }
  if (canonicalJson(proposal) === canonicalJson(request.proposal)) {
    throw new ProductApprovalError("unchanged_proposal", "A revision must change the proposal content");
  }
  if (new Date(input.expiresAt).getTime() <= now.getTime()) {
    throw new ProductApprovalError("invalid_expiry", "Revised product approval expiry must be in the future");
  }

  const updatedAt = iso(now);
  const superseded = parseProductApprovalRequest({ ...request, status: "superseded", updatedAt });
  const version = request.version + 1;
  const revision = parseProductApprovalRequest({
    requestId: request.requestId,
    incidentId: request.incidentId,
    capabilityId: request.capabilityId,
    version,
    proposalHash: computeProductProposalHash(proposal, version),
    proposal,
    status: "draft",
    authorizedApprovers: ["martin", "alfonso"],
    quorum: PRODUCT_APPROVAL_QUORUM,
    createdBy: input.createdBy,
    createdAt: updatedAt,
    updatedAt,
    expiresAt: input.expiresAt,
    supersedesProposalHash: request.proposalHash,
  });
  return { superseded, revision };
}

export function isApprovedProductProposal(
  rawRequest: ProductApprovalRequest,
  expectedProposalHash: string,
  expectedVersion: number,
): boolean {
  const request = parseProductApprovalRequest(rawRequest);
  return (
    request.status === "approved"
    && request.proposalHash === expectedProposalHash
    && request.version === expectedVersion
    && request.decision?.action === "approve"
  );
}
