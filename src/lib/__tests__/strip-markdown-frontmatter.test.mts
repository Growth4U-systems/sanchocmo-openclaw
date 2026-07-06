import { test } from "node:test";
import assert from "node:assert/strict";
// Mismo patrón CJS/namespace que partnerships-stage-mapping.test.mts.
import * as mod from "../../components/shared/doc-slideover";
const { stripMarkdownFrontmatter } = (mod as unknown as { default: typeof mod }).default ?? mod;

test("stripMarkdownFrontmatter: quita el bloque YAML inicial", () => {
  const doc = "---\ntitle: Brief Monzo\ntype: brief\n---\n# Contenido\n\nCuerpo.";
  assert.equal(stripMarkdownFrontmatter(doc), "# Contenido\n\nCuerpo.");
});

test("stripMarkdownFrontmatter: soporta CRLF", () => {
  const doc = "---\r\ntitle: Secuencia\r\n---\r\n# Hola";
  assert.equal(stripMarkdownFrontmatter(doc), "# Hola");
});

test("stripMarkdownFrontmatter: documento sin frontmatter queda intacto", () => {
  const doc = "# Sin frontmatter\n\nTexto con --- en medio.\n";
  assert.equal(stripMarkdownFrontmatter(doc), doc);
});

test("stripMarkdownFrontmatter: un --- suelto al inicio sin cierre no se toca", () => {
  const doc = "---\nsolo una línea de guiones sin bloque cerrado";
  assert.equal(stripMarkdownFrontmatter(doc), doc);
});
