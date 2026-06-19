/**
 * skill-frontmatter.ts — shared YAML-frontmatter parser for SKILL.md files.
 *
 * Factored out of src/pages/api/system/skills.ts (SAN-246) so both the Settings
 * → Skills panel AND the dispatch context-pack assembler (context-pack.ts) read
 * `context_required` from the SAME parser. Behavior is intentionally identical
 * to the inline version it replaced (golden-frozen by skills.ts consumers).
 *
 * Scope: a tiny, dependency-free subset of YAML — enough for the flat
 * key/value + scalar-list + one-level `metadata:` map shape that SKILL.md
 * frontmatter uses. NOT a general YAML parser; do not feed arbitrary YAML.
 */

export interface SkillMeta {
  name: string;
  description: string;
  metadata?: Record<string, string>;
  context_required?: string[];
  context_writes?: string[];
  /** Flat list of channel-level required context (SAN-246). */
  context_required_channel?: string[];
}

export interface ParsedSkillFrontmatter {
  meta: SkillMeta;
  body: string;
}

/**
 * Parse the leading `--- … ---` YAML frontmatter block of a SKILL.md.
 * Returns the parsed `meta` and the remaining `body`. When no frontmatter
 * block is present, `meta` is the empty `{ name: "", description: "" }` and
 * `body` is the whole input (same contract as the previous skills.ts impl).
 */
export function parseSkillFrontmatter(content: string): ParsedSkillFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: { name: "", description: "" }, body: content };

  const yamlStr = match[1];
  const body = match[2];
  const meta: Record<string, unknown> = {};

  let currentKey = "";
  for (const line of yamlStr.split("\n")) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "" || val === "[]") {
        meta[currentKey] = val === "[]" ? [] : {};
      } else if (val.startsWith('"') || val.startsWith("'")) {
        meta[currentKey] = val.replace(/^['"]|['"]$/g, "");
      } else {
        meta[currentKey] = val;
      }
    } else if (line.startsWith("- ") && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      (meta[currentKey] as string[]).push(line.slice(2).trim());
    } else if (line.startsWith("  ") && currentKey === "metadata") {
      const subMatch = line.trim().match(/^(\w[\w_]*)\s*:\s*['"]?(.+?)['"]?\s*$/);
      if (subMatch) {
        if (typeof meta.metadata !== "object" || Array.isArray(meta.metadata)) meta.metadata = {};
        (meta.metadata as Record<string, string>)[subMatch[1]] = subMatch[2];
      }
    }
  }

  return { meta: meta as unknown as SkillMeta, body };
}
