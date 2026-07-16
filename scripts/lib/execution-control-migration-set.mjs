import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCatalogStateInspector,
  readColumnState,
} from "./postgres-catalog-state.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "../..");
const migrationsDirectory = path.join(repositoryRoot, "src/db/migrations");

const relation = (name, options = {}) => ({
  kind: "relation",
  name,
  ...options,
});
const column = (table, name, type, options = {}) => ({
  kind: "column",
  table,
  name,
  type,
  ...options,
});
const index = (name, includes, options = {}) => ({
  kind: "index",
  name,
  includes,
  ...options,
});
const constraint = (table, name, includes = [], options = {}) => ({
  kind: "constraint",
  table,
  name,
  includes,
  ...options,
});
const utcTimestampDefault = "(clock_timestamp() AT TIME ZONE 'UTC'::text)";
const legacyOrUtcTimestampDefaults = ["now()", utcTimestampDefault];
const exactConstraint = (table, name, definitionEquals) =>
  constraint(table, name, [], { definitionEquals });
const exactIndex = (
  name,
  table,
  columns,
  { unique = false, predicate = "" } = {},
) =>
  index(name, [], {
    unique,
    definitionEquals: `CREATE ${unique ? "UNIQUE " : ""}INDEX ${name} ON public.${table} USING btree (${columns})${predicate ? ` WHERE ${predicate}` : ""}`,
  });

const runBaseColumns = [
  column("execution_runs", "id", "text", { notNull: true }),
  column("execution_runs", "tenant_key", "text"),
  column("execution_runs", "idempotency_key", "text", { notNull: true }),
  column("execution_runs", "aggregate_type", "text", { notNull: true }),
  column("execution_runs", "aggregate_id", "text", { notNull: true }),
  column("execution_runs", "operation", "text", { notNull: true }),
  column("execution_runs", "mode", "text", {
    notNull: true,
    defaultEquals: ["'shadow'::text"],
  }),
  column("execution_runs", "status", "text", {
    notNull: true,
    defaultEquals: ["'queued'::text"],
  }),
  column("execution_runs", "current_step", "text", { notNull: false }),
  column("execution_runs", "trace_id", "text", { notNull: false }),
  column("execution_runs", "input", "jsonb", { notNull: false }),
  column("execution_runs", "output", "jsonb", { notNull: false }),
  column("execution_runs", "error", "text", { notNull: false }),
  column("execution_runs", "metadata", "jsonb", {
    notNull: true,
    defaultEquals: ["'{}'::jsonb"],
  }),
  column("execution_runs", "created_at", "timestamp without time zone", {
    notNull: true,
    defaultEquals: legacyOrUtcTimestampDefaults,
  }),
  column("execution_runs", "started_at", "timestamp without time zone", {
    notNull: false,
  }),
  column("execution_runs", "finished_at", "timestamp without time zone", {
    notNull: false,
  }),
  column("execution_runs", "updated_at", "timestamp without time zone", {
    notNull: true,
    defaultEquals: legacyOrUtcTimestampDefaults,
  }),
];

const migration0019CatalogInspector = createCatalogStateInspector({
  required: [
    relation("execution_runs"),
    relation("execution_steps"),
    relation("execution_events"),
    relation("execution_events_sequence_seq", { kinds: ["S"] }),
    ...runBaseColumns,
    column("execution_steps", "id", "text", { notNull: true }),
    column("execution_steps", "run_id", "text", { notNull: true }),
    column("execution_steps", "step_key", "text", { notNull: true }),
    column("execution_steps", "status", "text", {
      notNull: true,
      defaultEquals: ["'pending'::text"],
    }),
    column("execution_steps", "attempt", "integer", {
      notNull: true,
      defaultEquals: ["0"],
    }),
    column("execution_steps", "input", "jsonb", { notNull: false }),
    column("execution_steps", "output", "jsonb", { notNull: false }),
    column("execution_steps", "error", "text", { notNull: false }),
    column("execution_steps", "created_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: legacyOrUtcTimestampDefaults,
    }),
    column("execution_steps", "started_at", "timestamp without time zone", {
      notNull: false,
    }),
    column("execution_steps", "finished_at", "timestamp without time zone", {
      notNull: false,
    }),
    column("execution_steps", "updated_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: legacyOrUtcTimestampDefaults,
    }),
    column("execution_events", "sequence", "bigint", {
      notNull: true,
      defaultEquals: ["nextval('execution_events_sequence_seq'::regclass)"],
    }),
    column("execution_events", "id", "text", { notNull: true }),
    column("execution_events", "run_id", "text", { notNull: true }),
    column("execution_events", "aggregate_type", "text", { notNull: true }),
    column("execution_events", "aggregate_id", "text", { notNull: true }),
    column("execution_events", "trace_id", "text", { notNull: false }),
    column("execution_events", "type", "text", { notNull: true }),
    column("execution_events", "ts", "timestamp without time zone", {
      notNull: true,
      defaultEquals: legacyOrUtcTimestampDefaults,
    }),
    column("execution_events", "data", "jsonb", { notNull: false }),
    exactConstraint(
      "execution_runs",
      "execution_runs_pkey",
      "PRIMARY KEY (id)",
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_mode_check",
      "CHECK (mode = ANY (ARRAY['shadow', 'canary', 'active']))",
    ),
    exactConstraint("execution_runs", "execution_runs_status_check", [
      "CHECK (status = ANY (ARRAY['queued', 'running', 'waiting_approval', 'completed', 'partial', 'failed', 'cancelled']))",
      "CHECK (status = ANY (ARRAY['queued', 'running', 'waiting_approval', 'blocked', 'completed', 'partial', 'failed', 'cancelled']))",
    ]),
    exactConstraint(
      "execution_runs",
      "execution_runs_metadata_object_check",
      "CHECK (jsonb_typeof(metadata) = 'object')",
    ),
    exactConstraint(
      "execution_steps",
      "execution_steps_pkey",
      "PRIMARY KEY (id)",
    ),
    exactConstraint(
      "execution_steps",
      "execution_steps_run_id_execution_runs_id_fk",
      "FOREIGN KEY (run_id) REFERENCES execution_runs(id) ON DELETE CASCADE",
    ),
    exactConstraint(
      "execution_steps",
      "execution_steps_status_check",
      "CHECK (status = ANY (ARRAY['pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'skipped']))",
    ),
    exactConstraint(
      "execution_steps",
      "execution_steps_attempt_check",
      "CHECK (attempt >= 0)",
    ),
    exactConstraint(
      "execution_events",
      "execution_events_pkey",
      "PRIMARY KEY (id)",
    ),
    exactConstraint(
      "execution_events",
      "execution_events_run_id_execution_runs_id_fk",
      "FOREIGN KEY (run_id) REFERENCES execution_runs(id) ON DELETE CASCADE",
    ),
    exactIndex(
      "execution_runs_tenant_aggregate_idempotency_idx",
      "execution_runs",
      "tenant_key, aggregate_type, aggregate_id, operation, idempotency_key",
      { unique: true },
    ),
    exactIndex(
      "execution_runs_aggregate_created_idx",
      "execution_runs",
      "aggregate_type, aggregate_id, created_at",
    ),
    exactIndex(
      "execution_runs_status_updated_idx",
      "execution_runs",
      "status, updated_at",
    ),
    exactIndex("execution_runs_trace_idx", "execution_runs", "trace_id"),
    exactIndex(
      "execution_steps_run_key_idx",
      "execution_steps",
      "run_id, step_key",
      {
        unique: true,
      },
    ),
    exactIndex(
      "execution_steps_run_status_idx",
      "execution_steps",
      "run_id, status",
    ),
    exactIndex(
      "execution_events_run_sequence_idx",
      "execution_events",
      "run_id, sequence",
    ),
    exactIndex(
      "execution_events_aggregate_sequence_idx",
      "execution_events",
      "aggregate_type, aggregate_id, sequence",
    ),
    exactIndex("execution_events_trace_idx", "execution_events", "trace_id"),
    exactIndex("execution_events_ts_idx", "execution_events", "ts"),
  ],
  anchors: [
    relation("execution_runs"),
    relation("execution_steps"),
    relation("execution_events"),
    relation("execution_events_sequence_seq", { kinds: ["S"] }),
  ],
});

const legacyIdentityIndexInspector = createCatalogStateInspector({
  required: [
    exactIndex(
      "execution_runs_aggregate_idempotency_idx",
      "execution_runs",
      "aggregate_type, aggregate_id, operation, idempotency_key",
      { unique: true },
    ),
  ],
  anchors: [index("execution_runs_aggregate_idempotency_idx", [])],
});

async function migration0019Inspector(transaction) {
  const catalogState = await migration0019CatalogInspector(transaction);
  if (catalogState !== "applied") return catalogState;

  const tenantColumn = await readColumnState(transaction, {
    table: "execution_runs",
    name: "tenant_key",
  });
  const legacyIndexState = await legacyIdentityIndexInspector(transaction);
  const [{ serialSequence }] = await transaction`
    SELECT pg_get_serial_sequence('public.execution_events', 'sequence')
      AS "serialSequence"
  `;
  if (serialSequence !== "public.execution_events_sequence_seq") {
    return "partial";
  }
  if (tenantColumn?.notNull === false && legacyIndexState === "applied") {
    return "applied";
  }
  if (tenantColumn?.notNull === true && legacyIndexState === "absent") {
    return "applied";
  }
  return "partial";
}

const migration0020CatalogInspector = createCatalogStateInspector({
  required: [
    column("execution_runs", "tenant_key", "text"),
    exactIndex(
      "execution_runs_tenant_aggregate_idempotency_idx",
      "execution_runs",
      "tenant_key, aggregate_type, aggregate_id, operation, idempotency_key",
      { unique: true },
    ),
    exactIndex(
      "execution_runs_tenant_created_idx",
      "execution_runs",
      "tenant_key, created_at DESC, id DESC",
    ),
    exactIndex(
      "execution_runs_tenant_status_created_idx",
      "execution_runs",
      "tenant_key, status, created_at DESC, id DESC",
    ),
    exactIndex(
      "execution_runs_tenant_operation_status_created_idx",
      "execution_runs",
      "tenant_key, operation, status, created_at DESC, id DESC",
    ),
    exactIndex(
      "execution_runs_tenant_operation_created_idx",
      "execution_runs",
      "tenant_key, operation, created_at DESC, id DESC",
    ),
  ],
  anchors: [
    index("execution_runs_tenant_created_idx", []),
    index("execution_runs_tenant_status_created_idx", []),
    index("execution_runs_tenant_operation_status_created_idx", []),
    index("execution_runs_tenant_operation_created_idx", []),
  ],
});

async function migration0020Inspector(transaction) {
  const catalogState = await migration0020CatalogInspector(transaction);
  if (catalogState !== "applied") return catalogState;
  const [{ missingTenant }] = await transaction`
    SELECT EXISTS (
      SELECT 1
      FROM "execution_runs"
      WHERE "tenant_key" IS NULL OR btrim("tenant_key") = ''
    ) AS "missingTenant"
  `;
  return missingTenant ? "partial" : "applied";
}

const migration0021Inspector = createCatalogStateInspector({
  required: [
    column("execution_runs", "available_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: legacyOrUtcTimestampDefaults,
    }),
    column("execution_runs", "lease_owner", "text", { notNull: false }),
    column("execution_runs", "lease_token_hash", "text", { notNull: false }),
    column(
      "execution_runs",
      "lease_expires_at",
      "timestamp without time zone",
      {
        notNull: false,
      },
    ),
    column("execution_runs", "claim_count", "integer", {
      notNull: true,
      defaultEquals: ["0"],
    }),
    exactIndex(
      "execution_runs_queued_claim_idx",
      "execution_runs",
      "tenant_key, operation, mode, available_at, created_at, id",
      {
        predicate:
          "((status = 'queued') AND (mode = ANY (ARRAY['canary', 'active'])))",
      },
    ),
    exactIndex(
      "execution_runs_running_expired_lease_idx",
      "execution_runs",
      "tenant_key, operation, mode, lease_expires_at",
      {
        predicate: "((status = 'running') AND (lease_expires_at IS NOT NULL))",
      },
    ),
  ],
  anchors: [
    column("execution_runs", "available_at"),
    column("execution_runs", "lease_owner"),
    column("execution_runs", "lease_token_hash"),
    column("execution_runs", "lease_expires_at"),
    column("execution_runs", "claim_count"),
    index("execution_runs_queued_claim_idx", []),
    index("execution_runs_running_expired_lease_idx", []),
  ],
});

const migration0022Inspector = createCatalogStateInspector({
  required: [
    column("execution_runs", "command_fingerprint", "text", {
      notNull: false,
    }),
  ],
  anchors: [column("execution_runs", "command_fingerprint")],
});

const migration0023Inspector = createCatalogStateInspector({
  required: [
    column("execution_runs", "handler_attempt", "integer", {
      notNull: true,
      defaultEquals: ["0"],
    }),
    exactIndex(
      "execution_runs_runnable_scope_idx",
      "execution_runs",
      "operation, mode, tenant_key",
      {
        predicate:
          "((status = ANY (ARRAY['queued', 'running'])) AND (mode = ANY (ARRAY['canary', 'active'])))",
      },
    ),
  ],
  anchors: [
    column("execution_runs", "handler_attempt"),
    index("execution_runs_runnable_scope_idx", []),
  ],
});

const tenantIdentityIndexInspector = createCatalogStateInspector({
  required: [
    exactIndex(
      "execution_runs_tenant_aggregate_idempotency_idx",
      "execution_runs",
      "tenant_key, aggregate_type, aggregate_id, operation, idempotency_key",
      { unique: true },
    ),
  ],
  anchors: [index("execution_runs_tenant_aggregate_idempotency_idx", [])],
});

async function migration0024Inspector(transaction) {
  const tenantColumn = await readColumnState(transaction, {
    table: "execution_runs",
    name: "tenant_key",
  });
  if (!tenantColumn) return "absent";

  const tenantIndexState = await tenantIdentityIndexInspector(transaction);

  const [indexes] = await transaction`
    SELECT
      to_regclass('public.execution_runs_aggregate_idempotency_idx') IS NOT NULL
        AS "legacyExists",
      to_regclass('public.execution_runs_tenant_aggregate_idempotency_idx') IS NOT NULL
        AS "tenantExists"
  `;
  if (
    tenantColumn.type === "text" &&
    tenantColumn.notNull === true &&
    indexes.legacyExists === false &&
    indexes.tenantExists === true &&
    tenantIndexState === "applied"
  ) {
    return "applied";
  }
  if (
    tenantColumn.type === "text" &&
    tenantColumn.notNull === false &&
    indexes.legacyExists === true &&
    indexes.tenantExists === true &&
    tenantIndexState === "applied"
  ) {
    return "absent";
  }
  return "partial";
}

const migration0025Inspector = createCatalogStateInspector({
  required: [
    relation("execution_effects"),
    column("execution_effects", "id", "text", { notNull: true }),
    column("execution_effects", "run_id", "text", { notNull: true }),
    column("execution_effects", "step_key", "text", { notNull: true }),
    column("execution_effects", "effect_key", "text", { notNull: true }),
    column("execution_effects", "handler_version", "integer", {
      notNull: true,
    }),
    column("execution_effects", "definition_version", "integer", {
      notNull: true,
    }),
    column("execution_effects", "capability", "text", { notNull: true }),
    column("execution_effects", "safety", "text", { notNull: true }),
    column("execution_effects", "payload_schema_version", "integer", {
      notNull: true,
    }),
    column("execution_effects", "payload_fingerprint", "text", {
      notNull: true,
    }),
    column("execution_effects", "policy_fingerprint", "text", {
      notNull: true,
    }),
    column("execution_effects", "receipt_schema_version", "integer", {
      notNull: true,
    }),
    column("execution_effects", "status", "text", {
      notNull: true,
      defaultEquals: ["'prepared'::text"],
    }),
    column("execution_effects", "attempt_count", "integer", {
      notNull: true,
      defaultEquals: ["0"],
    }),
    column("execution_effects", "reconcile_count", "integer", {
      notNull: true,
      defaultEquals: ["0"],
    }),
    column("execution_effects", "receipt", "jsonb", { notNull: false }),
    column("execution_effects", "receipt_fingerprint", "text", {
      notNull: false,
    }),
    column("execution_effects", "last_error_code", "text", {
      notNull: false,
    }),
    column("execution_effects", "available_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: legacyOrUtcTimestampDefaults,
    }),
    column(
      "execution_effects",
      "last_attempt_at",
      "timestamp without time zone",
      {
        notNull: false,
      },
    ),
    column(
      "execution_effects",
      "last_deadline_at",
      "timestamp without time zone",
      {
        notNull: false,
      },
    ),
    column("execution_effects", "finished_at", "timestamp without time zone", {
      notNull: false,
    }),
    column("execution_effects", "created_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: legacyOrUtcTimestampDefaults,
    }),
    column("execution_effects", "updated_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: legacyOrUtcTimestampDefaults,
    }),
    exactConstraint(
      "execution_effects",
      "execution_effects_pkey",
      "PRIMARY KEY (id)",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_run_id_fkey",
      "FOREIGN KEY (run_id) REFERENCES execution_runs(id) ON DELETE CASCADE",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_run_step_unique",
      "UNIQUE (run_id, step_key)",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_effect_key_unique",
      "UNIQUE (effect_key)",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_status_check",
      "CHECK (status = ANY (ARRAY['prepared', 'retry_wait', 'uncertain', 'succeeded', 'failed', 'cancelled']))",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_safety_check",
      "CHECK (safety = ANY (ARRAY['read_only', 'target_idempotency', 'reconcile_before_replay']))",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_attempt_check",
      "CHECK (attempt_count >= 0 AND reconcile_count >= 0)",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_versions_check",
      "CHECK (handler_version > 0 AND definition_version > 0 AND payload_schema_version > 0 AND receipt_schema_version > 0)",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_step_key_check",
      "CHECK (step_key ~ '^[a-z][a-z0-9._-]{0,63}$')",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_effect_key_check",
      "CHECK (octet_length(effect_key) >= 1 AND octet_length(effect_key) <= 512 AND effect_key !~ '[[:space:]]')",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_capability_check",
      "CHECK (capability ~ '^[a-z][a-z0-9._-]{0,127}$')",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_payload_hash_check",
      "CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$')",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_policy_hash_check",
      "CHECK (policy_fingerprint ~ '^[a-f0-9]{64}$')",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_receipt_hash_check",
      "CHECK (receipt_fingerprint IS NULL OR receipt_fingerprint ~ '^[a-f0-9]{64}$')",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_error_code_check",
      "CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9._-]{0,127}$')",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_receipt_size_check",
      "CHECK (receipt IS NULL OR jsonb_typeof(receipt) = 'object' AND octet_length(receipt::text) <= 16384)",
    ),
    exactConstraint(
      "execution_effects",
      "execution_effects_succeeded_receipt_check",
      "CHECK ((status = 'succeeded') = (receipt IS NOT NULL AND receipt_fingerprint IS NOT NULL))",
    ),
    exactIndex(
      "execution_effects_run_status_idx",
      "execution_effects",
      "run_id, status, step_key",
    ),
    exactIndex(
      "execution_effects_retry_idx",
      "execution_effects",
      "available_at, run_id",
      {
        predicate: "(status = ANY (ARRAY['retry_wait', 'uncertain']))",
      },
    ),
  ],
  anchors: [relation("execution_effects")],
});

const migration0026Inspector = createCatalogStateInspector({
  required: [
    column("execution_runs", "cancel_request_id", "text", { notNull: false }),
    column(
      "execution_runs",
      "cancel_requested_at",
      "timestamp without time zone",
      { notNull: false },
    ),
    column("execution_runs", "cancel_actor_type", "text", { notNull: false }),
    column("execution_runs", "cancel_actor_id", "text", { notNull: false }),
    column("execution_runs", "cancel_reason_code", "text", { notNull: false }),
    column(
      "execution_runs",
      "cancel_acknowledged_at",
      "timestamp without time zone",
      { notNull: false },
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_cancel_request_id_check",
      "CHECK (cancel_request_id IS NULL OR cancel_request_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cancel_[a-f0-9]{32,64})$')",
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_cancel_actor_type_check",
      "CHECK (cancel_actor_type IS NULL OR (cancel_actor_type = ANY (ARRAY['user', 'service', 'system'])))",
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_cancel_actor_id_check",
      "CHECK (cancel_actor_id IS NULL OR cancel_actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$')",
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_cancel_reason_code_check",
      "CHECK (cancel_reason_code IS NULL OR (cancel_reason_code = ANY (ARRAY['user_requested', 'superseded', 'invalid_command', 'policy_blocked', 'operator_intervention', 'system_shutdown'])))",
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_cancellation_shape_check",
      "CHECK (cancel_request_id IS NULL AND cancel_requested_at IS NULL AND cancel_actor_type IS NULL AND cancel_actor_id IS NULL AND cancel_reason_code IS NULL AND cancel_acknowledged_at IS NULL OR cancel_request_id IS NOT NULL AND cancel_requested_at IS NOT NULL AND cancel_actor_type IS NOT NULL AND cancel_actor_id IS NOT NULL AND cancel_reason_code IS NOT NULL AND (status = 'running' AND cancel_acknowledged_at IS NULL OR status = 'cancelled' AND cancel_acknowledged_at IS NOT NULL))",
    ),
    exactIndex(
      "execution_runs_cancellation_requested_idx",
      "execution_runs",
      "tenant_key, operation, mode, cancel_requested_at, id",
      {
        predicate: "((status = 'running') AND (cancel_request_id IS NOT NULL))",
      },
    ),
  ],
  anchors: [
    column("execution_runs", "cancel_request_id"),
    column("execution_runs", "cancel_requested_at"),
    column("execution_runs", "cancel_actor_type"),
    column("execution_runs", "cancel_actor_id"),
    column("execution_runs", "cancel_reason_code"),
    column("execution_runs", "cancel_acknowledged_at"),
  ],
});

const migration0027CatalogInspector = createCatalogStateInspector({
  required: [
    relation("execution_terminal_projections"),
    column("execution_terminal_projections", "run_id", "text", {
      notNull: true,
    }),
    column("execution_terminal_projections", "tenant_key", "text", {
      notNull: true,
    }),
    column("execution_terminal_projections", "operation", "text", {
      notNull: true,
    }),
    column("execution_terminal_projections", "mode", "text", {
      notNull: true,
    }),
    column("execution_terminal_projections", "terminal_status", "text", {
      notNull: true,
    }),
    column("execution_terminal_projections", "state", "text", {
      notNull: true,
      defaultEquals: ["'pending'::text"],
    }),
    column(
      "execution_terminal_projections",
      "available_at",
      "timestamp without time zone",
      { notNull: true, defaultEquals: legacyOrUtcTimestampDefaults },
    ),
    column("execution_terminal_projections", "claim_count", "integer", {
      notNull: true,
      defaultEquals: ["0"],
    }),
    column("execution_terminal_projections", "lease_owner", "text", {
      notNull: false,
    }),
    column("execution_terminal_projections", "lease_token_hash", "text", {
      notNull: false,
    }),
    column(
      "execution_terminal_projections",
      "lease_expires_at",
      "timestamp without time zone",
      { notNull: false },
    ),
    column(
      "execution_terminal_projections",
      "last_attempt_at",
      "timestamp without time zone",
      { notNull: false },
    ),
    column("execution_terminal_projections", "last_error_code", "text", {
      notNull: false,
    }),
    column(
      "execution_terminal_projections",
      "projected_at",
      "timestamp without time zone",
      { notNull: false },
    ),
    column(
      "execution_terminal_projections",
      "created_at",
      "timestamp without time zone",
      { notNull: true, defaultEquals: legacyOrUtcTimestampDefaults },
    ),
    column(
      "execution_terminal_projections",
      "updated_at",
      "timestamp without time zone",
      { notNull: true, defaultEquals: legacyOrUtcTimestampDefaults },
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_pkey",
      "PRIMARY KEY (run_id)",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_run_id_fkey",
      "FOREIGN KEY (run_id) REFERENCES execution_runs(id) ON DELETE RESTRICT",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_mode_check",
      "CHECK (mode = ANY (ARRAY['canary', 'active']))",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_terminal_status_check",
      "CHECK (terminal_status = ANY (ARRAY['completed', 'partial', 'failed', 'cancelled']))",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_state_check",
      "CHECK (state = ANY (ARRAY['pending', 'running', 'retry_wait', 'succeeded', 'blocked']))",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_claim_count_check",
      "CHECK (claim_count >= 0 AND claim_count <= 1000000)",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_scope_check",
      "CHECK (octet_length(tenant_key) >= 1 AND octet_length(tenant_key) <= 128 AND tenant_key = lower(tenant_key) AND tenant_key ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$' AND operation ~ '^[a-z][a-z0-9._-]{0,127}$')",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_lease_shape_check",
      "CHECK (state = 'running' AND lease_owner IS NOT NULL AND lease_token_hash IS NOT NULL AND lease_expires_at IS NOT NULL OR state <> 'running' AND lease_owner IS NULL AND lease_token_hash IS NULL AND lease_expires_at IS NULL)",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_lease_owner_check",
      "CHECK (lease_owner IS NULL OR octet_length(lease_owner) >= 1 AND octet_length(lease_owner) <= 160 AND lease_owner !~ '[[:cntrl:]]')",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_lease_hash_check",
      "CHECK (lease_token_hash IS NULL OR lease_token_hash ~ '^[a-f0-9]{64}$')",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_error_code_check",
      "CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9._-]{0,127}$')",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_error_state_check",
      "CHECK ((state = ANY (ARRAY['retry_wait', 'blocked'])) AND last_error_code IS NOT NULL OR (state = ANY (ARRAY['pending', 'succeeded'])) AND last_error_code IS NULL OR state = 'running')",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_attempt_shape_check",
      "CHECK (claim_count = 0 AND last_attempt_at IS NULL OR claim_count > 0 AND last_attempt_at IS NOT NULL)",
    ),
    exactConstraint(
      "execution_terminal_projections",
      "execution_terminal_projections_projected_check",
      "CHECK ((state = 'succeeded') = (projected_at IS NOT NULL))",
    ),
    exactIndex(
      "execution_terminal_projections_claim_idx",
      "execution_terminal_projections",
      "tenant_key, operation, mode, available_at, created_at, run_id",
      { predicate: "(state = ANY (ARRAY['pending', 'retry_wait']))" },
    ),
    exactIndex(
      "execution_terminal_projections_stale_lease_idx",
      "execution_terminal_projections",
      "tenant_key, operation, mode, lease_expires_at",
      { predicate: "(state = 'running')" },
    ),
    exactIndex(
      "execution_terminal_projections_runnable_scope_idx",
      "execution_terminal_projections",
      "operation, mode, tenant_key",
      {
        predicate: "(state = ANY (ARRAY['pending', 'retry_wait', 'running']))",
      },
    ),
    exactIndex(
      "execution_terminal_projections_blocked_idx",
      "execution_terminal_projections",
      "updated_at, operation, mode, tenant_key",
      { predicate: "(state = 'blocked')" },
    ),
    exactIndex(
      "execution_terminal_projections_blocked_scope_idx",
      "execution_terminal_projections",
      "operation, mode, tenant_key",
      { predicate: "(state = 'blocked')" },
    ),
  ],
  anchors: [relation("execution_terminal_projections")],
});

async function migration0027Inspector(transaction) {
  const catalogState = await migration0027CatalogInspector(transaction);
  if (catalogState !== "applied") return catalogState;
  const [{ invalidProjection }] = await transaction`
    SELECT EXISTS (
      SELECT 1
      FROM "execution_runs" AS run
      WHERE run."mode" IN ('canary', 'active')
        AND run."status" IN ('completed', 'partial', 'failed', 'cancelled')
        AND run."metadata"->>'authority' = 'execution_ledger_v2'
        AND NOT EXISTS (
          SELECT 1
          FROM "execution_terminal_projections" AS projection
          WHERE projection."run_id" = run."id"
        )
      UNION ALL
      SELECT 1
      FROM "execution_terminal_projections" AS projection
      JOIN "execution_runs" AS run ON run."id" = projection."run_id"
      WHERE projection."tenant_key" <> run."tenant_key"
        OR projection."operation" <> run."operation"
        OR projection."mode" <> run."mode"
        OR projection."terminal_status" <> run."status"
        OR run."mode" NOT IN ('canary', 'active')
        OR run."status" NOT IN ('completed', 'partial', 'failed', 'cancelled')
    ) AS "invalidProjection"
  `;
  return invalidProjection ? "partial" : "applied";
}

const migration0028Inspector = createCatalogStateInspector({
  required: [
    column("execution_runs", "blocked_reason_code", "text", {
      notNull: false,
    }),
    column("execution_runs", "blocked_at", "timestamp without time zone", {
      notNull: false,
    }),
    exactConstraint(
      "execution_runs",
      "execution_runs_status_check",
      "CHECK (status = ANY (ARRAY['queued', 'running', 'waiting_approval', 'blocked', 'completed', 'partial', 'failed', 'cancelled']))",
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_block_reason_code_check",
      "CHECK (blocked_reason_code IS NULL OR (blocked_reason_code = ANY (ARRAY['handler_version_invalid', 'handler_contract_unsupported', 'handler_contract_mismatch', 'execution_policy_mismatch', 'command_contract_mismatch', 'runtime_authority_unavailable'])))",
    ),
    exactConstraint(
      "execution_runs",
      "execution_runs_block_shape_check",
      "CHECK (status = 'blocked' AND blocked_reason_code IS NOT NULL AND blocked_at IS NOT NULL AND lease_owner IS NULL AND lease_token_hash IS NULL AND lease_expires_at IS NULL AND finished_at IS NULL OR status <> 'blocked' AND blocked_reason_code IS NULL AND blocked_at IS NULL)",
    ),
    exactIndex(
      "execution_runs_blocked_scope_idx",
      "execution_runs",
      "operation, mode, tenant_key, blocked_at, id",
      {
        predicate:
          "((status = 'blocked') AND (mode = ANY (ARRAY['canary', 'active'])))",
      },
    ),
  ],
  anchors: [
    column("execution_runs", "blocked_reason_code"),
    column("execution_runs", "blocked_at"),
    constraint("execution_runs", "execution_runs_block_reason_code_check"),
    constraint("execution_runs", "execution_runs_block_shape_check"),
    index("execution_runs_blocked_scope_idx", []),
  ],
});

const migration0029Inspector = createCatalogStateInspector({
  required: [
    relation("leads_search_projections"),
    column("leads_search_projections", "run_id", "text", { notNull: true }),
    column("leads_search_projections", "tenant_key", "text", {
      notNull: true,
    }),
    column("leads_search_projections", "terminal_status", "text", {
      notNull: true,
    }),
    column("leads_search_projections", "candidate_count", "integer", {
      notNull: true,
      defaultEquals: ["0"],
    }),
    column("leads_search_projections", "result", "jsonb", {
      notNull: false,
    }),
    column("leads_search_projections", "projection_fingerprint", "text", {
      notNull: true,
    }),
    column(
      "leads_search_projections",
      "projected_at",
      "timestamp without time zone",
      { notNull: true, defaultEquals: legacyOrUtcTimestampDefaults },
    ),
    exactConstraint(
      "leads_search_projections",
      "leads_search_projections_pkey",
      "PRIMARY KEY (run_id)",
    ),
    exactConstraint(
      "leads_search_projections",
      "leads_search_projections_run_id_fkey",
      "FOREIGN KEY (run_id) REFERENCES execution_runs(id) ON DELETE RESTRICT",
    ),
    exactConstraint(
      "leads_search_projections",
      "leads_search_projections_tenant_check",
      "CHECK (octet_length(tenant_key) >= 1 AND octet_length(tenant_key) <= 128 AND tenant_key = lower(tenant_key) AND tenant_key ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$')",
    ),
    exactConstraint(
      "leads_search_projections",
      "leads_search_projections_status_check",
      "CHECK (terminal_status = ANY (ARRAY['completed', 'partial', 'failed', 'cancelled']))",
    ),
    exactConstraint(
      "leads_search_projections",
      "leads_search_projections_candidate_count_check",
      "CHECK (candidate_count >= 0 AND candidate_count <= 10)",
    ),
    exactConstraint(
      "leads_search_projections",
      "leads_search_projections_result_check",
      "CHECK (terminal_status = 'completed' AND result IS NOT NULL AND jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 16384 OR (terminal_status = ANY (ARRAY['partial', 'failed', 'cancelled'])) AND result IS NULL AND candidate_count = 0)",
    ),
    exactConstraint(
      "leads_search_projections",
      "leads_search_projections_fingerprint_check",
      "CHECK (projection_fingerprint ~ '^[a-f0-9]{64}$')",
    ),
    exactIndex(
      "leads_search_projections_tenant_projected_idx",
      "leads_search_projections",
      "tenant_key, projected_at DESC, run_id DESC",
    ),
  ],
  anchors: [relation("leads_search_projections")],
});

const migration0030DefaultColumns = [
  ["execution_runs", "available_at"],
  ["execution_runs", "created_at"],
  ["execution_runs", "updated_at"],
  ["execution_steps", "created_at"],
  ["execution_steps", "updated_at"],
  ["execution_events", "ts"],
  ["execution_effects", "available_at"],
  ["execution_effects", "created_at"],
  ["execution_effects", "updated_at"],
  ["execution_terminal_projections", "available_at"],
  ["execution_terminal_projections", "created_at"],
  ["execution_terminal_projections", "updated_at"],
  ["leads_search_projections", "projected_at"],
];

async function migration0030Inspector(transaction) {
  const states = await Promise.all(
    migration0030DefaultColumns.map(([table, name]) =>
      readColumnState(transaction, { table, name }),
    ),
  );
  // The runner preflights the complete migration set before executing any
  // DDL. On a clean database, or while upgrading an adopted 0019-0020 prefix,
  // predecessor columns are legitimately absent. Their own inspectors still
  // fail closed on partial/corrupt shapes; 0030 only classifies the defaults
  // that already exist and later converges the complete set.
  const presentStates = states.filter((state) => state !== null);
  if (presentStates.length === 0) return "absent";

  const defaults = presentStates.map((state) => state.default);
  if (
    presentStates.length === states.length &&
    defaults.every((value) => value === utcTimestampDefault)
  ) {
    return "applied";
  }
  // New installations already receive UTC defaults from 0021/25/27/29,
  // while the published 0019 columns still have now(). Older installations
  // can have any equivalent mixture. 0030 safely converges both shapes.
  if (
    defaults.every(
      (value) => value === "now()" || value === utcTimestampDefault,
    )
  ) {
    return "absent";
  }
  return "partial";
}

const migration0031Inspector = createCatalogStateInspector({
  required: [
    index("execution_runs_mc_chat_origin_parent_idx", [
      "execution_runs",
      "metadata",
      "'{executionOrigin,parentAgentRunId}'",
      "'{executionOrigin,kind}'",
      "'mc_chat_parent_run'",
    ]),
  ],
  anchors: [index("execution_runs_mc_chat_origin_parent_idx", [])],
});

const migration0032Inspector = createCatalogStateInspector({
  required: [
    relation("execution_origins"),
    relation("execution_run_origins"),
    column("execution_origins", "tenant_key", "text", { notNull: true }),
    column("execution_origins", "kind", "text", { notNull: true }),
    column("execution_origins", "parent_agent_run_id", "text", {
      notNull: true,
    }),
    column("execution_origins", "cancel_request_id", "text", {
      notNull: false,
    }),
    column(
      "execution_origins",
      "cancel_requested_at",
      "timestamp without time zone",
      { notNull: false },
    ),
    column("execution_origins", "cancel_actor_type", "text", {
      notNull: false,
    }),
    column("execution_origins", "cancel_actor_id", "text", {
      notNull: false,
    }),
    column("execution_origins", "cancel_reason_code", "text", {
      notNull: false,
    }),
    column("execution_origins", "created_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: [utcTimestampDefault],
    }),
    column("execution_origins", "updated_at", "timestamp without time zone", {
      notNull: true,
      defaultEquals: [utcTimestampDefault],
    }),
    column("execution_run_origins", "run_id", "text", { notNull: true }),
    column("execution_run_origins", "tenant_key", "text", {
      notNull: true,
    }),
    column("execution_run_origins", "kind", "text", { notNull: true }),
    column("execution_run_origins", "parent_agent_run_id", "text", {
      notNull: true,
    }),
    column(
      "execution_run_origins",
      "created_at",
      "timestamp without time zone",
      { notNull: true, defaultEquals: [utcTimestampDefault] },
    ),
    exactConstraint(
      "execution_origins",
      "execution_origins_pkey",
      "PRIMARY KEY (tenant_key, kind, parent_agent_run_id)",
    ),
    constraint("execution_origins", "execution_origins_kind_check", [
      "kind",
      "mc_chat_parent_run",
    ]),
    constraint(
      "execution_origins",
      "execution_origins_parent_agent_run_id_check",
      ["parent_agent_run_id"],
    ),
    constraint(
      "execution_origins",
      "execution_origins_cancellation_shape_check",
      [
        "cancel_request_id",
        "cancel_requested_at",
        "cancel_actor_type",
        "cancel_actor_id",
        "cancel_reason_code",
      ],
    ),
    exactConstraint(
      "execution_run_origins",
      "execution_run_origins_pkey",
      "PRIMARY KEY (run_id)",
    ),
    exactConstraint(
      "execution_run_origins",
      "execution_run_origins_run_tenant_fk",
      "FOREIGN KEY (run_id, tenant_key) REFERENCES execution_runs(id, tenant_key) ON DELETE CASCADE",
    ),
    exactConstraint(
      "execution_run_origins",
      "execution_run_origins_origin_fk",
      "FOREIGN KEY (tenant_key, kind, parent_agent_run_id) REFERENCES execution_origins(tenant_key, kind, parent_agent_run_id) ON DELETE RESTRICT",
    ),
    exactIndex(
      "execution_runs_id_tenant_idx",
      "execution_runs",
      "id, tenant_key",
      { unique: true },
    ),
    index("execution_origins_cancelled_idx", [
      "execution_origins",
      "tenant_key",
      "cancel_requested_at",
      "parent_agent_run_id",
      "cancel_request_id IS NOT NULL",
    ]),
    exactIndex(
      "execution_run_origins_root_run_idx",
      "execution_run_origins",
      "tenant_key, kind, parent_agent_run_id, run_id",
    ),
  ],
  anchors: [
    relation("execution_origins"),
    relation("execution_run_origins"),
    index("execution_runs_id_tenant_idx", []),
  ],
});

const migration0033Inspector = createCatalogStateInspector({
  required: [
    column("execution_origins", "command_operation", "text", {
      notNull: false,
    }),
    column("execution_origins", "command_fingerprint", "text", {
      notNull: false,
    }),
    column(
      "execution_origins",
      "command_claimed_at",
      "timestamp without time zone",
      { notNull: false },
    ),
    constraint(
      "execution_origins",
      "execution_origins_command_operation_check",
      ["command_operation"],
    ),
    constraint(
      "execution_origins",
      "execution_origins_command_fingerprint_check",
      ["command_fingerprint"],
    ),
    constraint(
      "execution_origins",
      "execution_origins_command_claim_shape_check",
      ["command_operation", "command_fingerprint", "command_claimed_at"],
    ),
  ],
  anchors: [
    column("execution_origins", "command_operation"),
    column("execution_origins", "command_fingerprint"),
    column("execution_origins", "command_claimed_at"),
  ],
});

const allowed0024Destructive = [
  /^drop index if exists "?execution_runs_aggregate_idempotency_idx"?$/,
];
const allowed0028Destructive = [
  /^alter table "?execution_runs"? drop constraint if exists "?execution_runs_(status_check|block_reason_code_check|block_shape_check)"?$/,
];

const definitions = [
  ["0019_execution_control.sql", migration0019Inspector],
  ["0020_execution_tenant_scope.sql", migration0020Inspector],
  ["0021_execution_leases.sql", migration0021Inspector],
  ["0022_execution_command_fingerprint.sql", migration0022Inspector],
  ["0023_execution_drain.sql", migration0023Inspector],
  [
    "0024_execution_tenant_contract.sql",
    migration0024Inspector,
    allowed0024Destructive,
  ],
  ["0025_execution_effects.sql", migration0025Inspector],
  ["0026_execution_cancellation.sql", migration0026Inspector],
  ["0027_execution_terminal_projections.sql", migration0027Inspector],
  [
    "0028_execution_run_blocking.sql",
    migration0028Inspector,
    allowed0028Destructive,
  ],
  ["0029_leads_search_projections.sql", migration0029Inspector],
  ["0030_execution_utc_timestamps.sql", migration0030Inspector],
  ["0031_execution_origin_lookup.sql", migration0031Inspector],
  ["0032_execution_origin_tombstones.sql", migration0032Inspector],
  ["0033_execution_origin_command_claim.sql", migration0033Inspector],
];

export const executionControlMigrations = definitions.map(
  ([file, inspectState, allowedDestructiveStatements = []]) => ({
    id: file.slice(0, 4),
    path: path.join(migrationsDirectory, file),
    name: `src/db/migrations/${file}`,
    inspectState,
    allowedDestructiveStatements,
  }),
);

export function executionControlMigrationsThrough(through) {
  if (!through) return executionControlMigrations;
  if (!/^\d{4}$/.test(through)) {
    throw new Error("--through must be a four-digit migration id (0019–0033).");
  }
  const index = executionControlMigrations.findIndex(
    ({ id }) => id === through,
  );
  if (index < 0) {
    throw new Error(`Unknown execution-control migration id: ${through}`);
  }
  return executionControlMigrations.slice(0, index + 1);
}
