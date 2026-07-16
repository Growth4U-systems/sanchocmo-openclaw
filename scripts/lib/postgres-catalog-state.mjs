/**
 * Build a migration-state verifier from PostgreSQL catalog expectations.
 * `required` describes the durable post-migration contract. `anchors` are the
 * objects owned by that migration: all absent means it is safe to apply, all
 * required present means it is safe to adopt, and every other shape is partial.
 */
export function createCatalogStateInspector({ required, anchors }) {
  if (!Array.isArray(required) || required.length === 0) {
    throw new Error("Catalog verifier requires at least one expected object.");
  }
  if (!Array.isArray(anchors) || anchors.length === 0) {
    throw new Error("Catalog verifier requires at least one absence anchor.");
  }

  return async function inspectState(transaction) {
    const requiredMatches = await Promise.all(
      required.map((expectation) => objectMatches(transaction, expectation)),
    );
    if (requiredMatches.every(Boolean)) return "applied";

    const anchorPresence = await Promise.all(
      anchors.map((anchor) => objectExists(transaction, anchor)),
    );
    return anchorPresence.every((present) => !present) ? "absent" : "partial";
  };
}

export async function readColumnState(transaction, expectation) {
  const schema = expectation.schema ?? "public";
  const [row] = await transaction`
    SELECT
      format_type(attribute.atttypid, attribute.atttypmod) AS "type",
      attribute.attnotnull AS "notNull",
      pg_get_expr(default_value.adbin, default_value.adrelid) AS "default"
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
    WHERE namespace.nspname = ${schema}
      AND relation.relname = ${expectation.table}
      AND attribute.attname = ${expectation.name}
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  `;
  return row ?? null;
}

async function objectMatches(transaction, expectation) {
  switch (expectation.kind) {
    case "relation":
      return relationMatches(transaction, expectation);
    case "column":
      return columnMatches(transaction, expectation);
    case "index":
      return indexMatches(transaction, expectation);
    case "constraint":
      return constraintMatches(transaction, expectation);
    default:
      throw new Error(`Unsupported catalog object kind: ${expectation.kind}`);
  }
}

async function objectExists(transaction, expectation) {
  switch (expectation.kind) {
    case "relation":
      return relationExists(transaction, expectation);
    case "column":
      return (await readColumnState(transaction, expectation)) !== null;
    case "index":
      return (await readIndexState(transaction, expectation)) !== null;
    case "constraint":
      return (await readConstraintState(transaction, expectation)) !== null;
    default:
      throw new Error(`Unsupported catalog object kind: ${expectation.kind}`);
  }
}

async function relationExists(transaction, expectation) {
  const schema = expectation.schema ?? "public";
  const [row] = await transaction`
    SELECT relation.relkind AS "kind"
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = ${schema}
      AND relation.relname = ${expectation.name}
  `;
  return row !== undefined;
}

async function relationMatches(transaction, expectation) {
  const schema = expectation.schema ?? "public";
  const [row] = await transaction`
    SELECT relation.relkind AS "kind"
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = ${schema}
      AND relation.relname = ${expectation.name}
  `;
  if (!row) return false;
  const allowedKinds = expectation.kinds ?? ["r"];
  return allowedKinds.includes(row.kind);
}

async function columnMatches(transaction, expectation) {
  const row = await readColumnState(transaction, expectation);
  if (!row) return false;
  if (expectation.type && row.type !== expectation.type) return false;
  if (
    typeof expectation.notNull === "boolean" &&
    row.notNull !== expectation.notNull
  ) {
    return false;
  }
  if (
    expectation.defaultIncludes &&
    !definitionContains(row.default ?? "", expectation.defaultIncludes)
  ) {
    return false;
  }
  if (
    expectation.defaultEquals !== undefined &&
    !definitionEqualsAny(row.default ?? "", expectation.defaultEquals)
  ) {
    return false;
  }
  return true;
}

async function readIndexState(transaction, expectation) {
  const schema = expectation.schema ?? "public";
  const [row] = await transaction`
    SELECT
      pg_get_indexdef(index_relation.oid) AS "definition",
      index.indisvalid AS "valid",
      index.indisready AS "ready",
      index.indisunique AS "unique"
    FROM pg_catalog.pg_class AS index_relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_index AS index
      ON index.indexrelid = index_relation.oid
    WHERE namespace.nspname = ${schema}
      AND index_relation.relname = ${expectation.name}
  `;
  return row ?? null;
}

async function indexMatches(transaction, expectation) {
  const row = await readIndexState(transaction, expectation);
  if (!row || row.valid !== true || row.ready !== true) return false;
  if (
    typeof expectation.unique === "boolean" &&
    row.unique !== expectation.unique
  ) {
    return false;
  }
  return (
    definitionContains(row.definition, expectation.includes ?? []) &&
    definitionEqualsAny(row.definition, expectation.definitionEquals)
  );
}

async function readConstraintState(transaction, expectation) {
  const schema = expectation.schema ?? "public";
  const [row] = await transaction`
    SELECT
      pg_get_constraintdef(constraint_row.oid, true) AS "definition",
      constraint_row.convalidated AS "validated"
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = ${schema}
      AND relation.relname = ${expectation.table}
      AND constraint_row.conname = ${expectation.name}
  `;
  return row ?? null;
}

async function constraintMatches(transaction, expectation) {
  const row = await readConstraintState(transaction, expectation);
  if (!row || row.validated !== true) return false;
  return (
    definitionContains(row.definition, expectation.includes ?? []) &&
    definitionEqualsAny(row.definition, expectation.definitionEquals)
  );
}

function definitionEqualsAny(definition, expected) {
  if (expected === undefined) return true;
  const alternatives = Array.isArray(expected) ? expected : [expected];
  const normalizedDefinition = normalizeDefinition(definition);
  return alternatives.some(
    (candidate) => normalizeDefinition(candidate) === normalizedDefinition,
  );
}

function definitionContains(definition, expectedFragments) {
  const normalizedDefinition = normalizeDefinition(definition);
  return expectedFragments.every((fragment) =>
    normalizedDefinition.includes(normalizeDefinition(fragment)),
  );
}

function normalizeDefinition(value) {
  const source = String(value);
  let result = "";
  let outside = "";

  const flushOutside = () => {
    result += outside
      .replace(/::[a-z_]+(\[\])?/gi, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
    outside = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== "'" && char !== '"') {
      outside += char;
      continue;
    }

    flushOutside();
    const quote = char;
    result += char;
    for (index += 1; index < source.length; index += 1) {
      const quotedChar = source[index];
      result += quotedChar;
      if (quotedChar !== quote) continue;
      if (source[index + 1] === quote) {
        result += source[index + 1];
        index += 1;
        continue;
      }
      break;
    }
  }
  flushOutside();
  return result.trim();
}
