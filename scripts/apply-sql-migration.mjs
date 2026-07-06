#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((arg) => arg !== "--dry-run");

if (files.length === 0) {
  console.error("Usage: node scripts/apply-sql-migration.mjs [--dry-run] <migration.sql> [...]");
  process.exit(1);
}

if (!dryRun && !process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to apply SQL migrations.");
  process.exit(1);
}

const sql = dryRun ? null : neon(process.env.DATABASE_URL);

try {
  for (const file of files) {
    await applyMigration(file);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

async function applyMigration(file) {
  const absPath = path.resolve(process.cwd(), file);
  const sqlText = await fs.readFile(absPath, "utf8");
  const statements = splitSqlStatements(sqlText);

  if (statements.length === 0) {
    console.log(`${file}: no SQL statements found`);
    return;
  }

  for (const statement of statements) {
    assertNonDestructive(statement, file);
  }

  if (dryRun) {
    console.log(`${file}: ${statements.length} statement(s) validated`);
    return;
  }

  await sql.query("begin");
  try {
    for (const statement of statements) {
      await sql.query(statement);
    }
    await sql.query("commit");
  } catch (err) {
    await sql.query("rollback").catch(() => undefined);
    throw err;
  }

  console.log(`${file}: applied ${statements.length} statement(s)`);
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i += 1) {
    const char = sqlText[i];
    const next = sqlText[i + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "-" && next === "-") {
      current += char + next;
      i += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "/" && next === "*") {
      current += char + next;
      i += 1;
      inBlockComment = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      current += char;
      if (inSingleQuote && next === "'") {
        current += next;
        i += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }

    if (!inSingleQuote && char === '"') {
      current += char;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === ";") {
      pushStatement(statements, current);
      current = "";
      continue;
    }

    current += char;
  }

  pushStatement(statements, current);
  return statements;
}

function pushStatement(statements, value) {
  const statement = value.trim();
  if (statement) statements.push(statement);
}

function assertNonDestructive(statement, file) {
  const normalized = stripSqlComments(statement).toLowerCase();
  const destructivePattern = /\b(drop\s+(table|schema|database)|truncate\s+table|alter\s+table\b[\s\S]*\bdrop\b)\b/;
  if (destructivePattern.test(normalized)) {
    throw new Error(`${file}: destructive SQL is not allowed by this deploy runner`);
  }
}

function stripSqlComments(statement) {
  return statement
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}
