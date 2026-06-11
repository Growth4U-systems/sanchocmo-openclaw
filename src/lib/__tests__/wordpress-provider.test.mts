import { test } from "node:test";
import assert from "node:assert/strict";
// CJS interop dance under tsx --test — same as api-middleware.test.mts.
import * as wp from "../publishing/providers/wordpress";
const { splitTitle, markdownToHtml } = (wp as unknown as { default: typeof wp }).default ?? wp;

// SAN-161 — pure helpers of the WordPress blog provider. The HTML converter
// only needs to cover what seo-content drafts actually emit.

test("splitTitle: first H1 becomes the title and leaves the body", () => {
  const { title, body } = splitTitle("# Mejor CRM para pymes\n\nIntro del artículo.\n\n## Sección");
  assert.equal(title, "Mejor CRM para pymes");
  assert.ok(!body.includes("# Mejor CRM"));
  assert.ok(body.includes("Intro del artículo."));
});

test("splitTitle: without H1 falls back to the first line", () => {
  const { title } = splitTitle("Un draft sin heading\nsegunda línea");
  assert.equal(title, "Un draft sin heading");
});

test("markdownToHtml: headings shift one level (H1 is the post title)", () => {
  const html = markdownToHtml("## Sección\n\ntexto");
  assert.ok(html.includes("<h3>Sección</h3>"));
  assert.ok(html.includes("<p>texto</p>"));
});

test("markdownToHtml: inline emphasis, links and code", () => {
  const html = markdownToHtml("Esto es **clave** con [un link](https://x.com) y `code`.");
  assert.ok(html.includes("<strong>clave</strong>"));
  assert.ok(html.includes('<a href="https://x.com">un link</a>'));
  assert.ok(html.includes("<code>code</code>"));
});

test("markdownToHtml: ordered and unordered lists", () => {
  const html = markdownToHtml("- uno\n- dos\n\n1. primero\n2. segundo");
  assert.ok(html.includes("<ul><li>uno</li><li>dos</li></ul>"));
  assert.ok(html.includes("<ol><li>primero</li><li>segundo</li></ol>"));
});

test("markdownToHtml: fenced code blocks keep raw content escaped", () => {
  const html = markdownToHtml("```\nconst a = 1 < 2;\n```");
  assert.ok(html.includes("<pre><code>const a = 1 &lt; 2;</code></pre>"));
});

test("markdownToHtml: escapes raw HTML in paragraphs", () => {
  const html = markdownToHtml("texto con <script>alert(1)</script>");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

// ── Alarife provider helpers (same file: blog providers share the converter) ──
import * as al from "../publishing/providers/alarife";
const { slugifyPath } = (al as unknown as { default: typeof al }).default ?? al;

test("slugifyPath: normalizes accents, spaces and symbols", () => {
  assert.equal(slugifyPath("Mejor CRM para pymes en 2026: comparativa"), "mejor-crm-para-pymes-en-2026-comparativa");
  assert.equal(slugifyPath("¿Qué CRM elegir?"), "que-crm-elegir");
});

test("slugifyPath: never returns empty", () => {
  assert.equal(slugifyPath("???"), "articulo");
});
