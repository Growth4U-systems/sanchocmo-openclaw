import { test } from "node:test";
import assert from "node:assert/strict";

// chat-openers + skill-resolver are client-safe (no fs) → load directly.
const {
  buildYalcThread,
  buildB2BCampaignThread,
  buildDiscoverySearchThread,
  buildOutreachTemplateThread,
  buildMediaAssetThread,
  buildVisualIdentityChatThread,
  buildOdGenerateThread,
  buildSkillCreatorThread,
  buildSkillEditorThread,
  buildHtmlConversionThread,
} = await import("../chat-openers");
const { resolveAgentForSkill } = await import("../skill-resolver");

const SLUG = "growth4u";

test("founder-led-setup is owned by dulcinea", () => {
  assert.equal(resolveAgentForSkill("founder-led-setup"), "dulcinea");
});

// Every chat-opener button must route to the agent that OWNS its skill — no
// undefined-agent for owned skills (the SAN-166 class of bug at the button
// level). For each builder, assert agent === resolveAgentForSkill(skill).
const CASES: Array<{ name: string; cfg: { skill: string; agent?: string } }> = [
  { name: "yalc", cfg: buildYalcThread(SLUG) },
  { name: "b2b-campaign", cfg: buildB2BCampaignThread(SLUG) },
  { name: "discovery", cfg: buildDiscoverySearchThread(SLUG) },
  { name: "outreach-template", cfg: buildOutreachTemplateThread(SLUG, { id: "seq-1", name: "Seq" }) },
  { name: "media-asset", cfg: buildMediaAssetThread(SLUG, "brand-book/x/logo.png", "Logo", "logo") },
  { name: "visual-identity", cfg: buildVisualIdentityChatThread(SLUG) },
  { name: "od-generate", cfg: buildOdGenerateThread(SLUG, "poster-maker", "Poster Maker") },
  { name: "skill-creator", cfg: buildSkillCreatorThread(SLUG) },
  { name: "skill-editor", cfg: buildSkillEditorThread(SLUG, "my-skill", "My Skill") },
  { name: "html-conversion", cfg: buildHtmlConversionThread(SLUG, "content/x.md", undefined) },
];

for (const { name, cfg } of CASES) {
  test(`builder "${name}" routes to its skill's owner agent`, () => {
    const owner = resolveAgentForSkill(cfg.skill);
    if (owner) {
      assert.equal(cfg.agent, owner, `${name}: skill ${cfg.skill} owned by ${owner} but agent=${cfg.agent}`);
    } else {
      // Skill has no specialist owner → agent may be undefined (Sancho default) or explicit.
      assert.ok(true);
    }
  });
}

// SAN-193: discovery threadIds must be minted in the same shape the storage
// layer persists. `mc-chat.threadFile()` sanitizes the shortId for the
// filesystem (`:` → `-`, then drops everything outside [a-zA-Z0-9-_]). If the
// client registers a colon-shaped id (`discovery:new-<ts>`) it can NEVER match
// the on-disk id (`discovery-new-<ts>`), so `useThreadList`'s exact-id dedup
// misses and paints a phantom second row. The invariant: the shortId is already
// idempotent under that sanitization.
const sanitizeShort = (shortId: string) =>
  shortId.replace(/:/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");

for (const { name, cfg } of [
  { name: "discovery-new", cfg: buildDiscoverySearchThread(SLUG) },
  { name: "discovery-existing", cfg: buildDiscoverySearchThread(SLUG, { campaignId: "CAMP_abc", title: "Test" }) },
] as const) {
  test(`builder "${name}" threadId survives FS sanitization (client id == on-disk id)`, () => {
    const shortId = cfg.threadId.startsWith(`${SLUG}:`) ? cfg.threadId.slice(SLUG.length + 1) : cfg.threadId;
    assert.equal(
      shortId,
      sanitizeShort(shortId),
      `shortId "${shortId}" must equal its sanitized form so the dedup in useThreadList matches`,
    );
  });
}

test("discovery new opens a blank Partnerships campaign thread with suggested actions", () => {
  const cfg = buildDiscoverySearchThread(SLUG);
  assert.equal(cfg.threadName, "Nueva campaña Partnerships");
  assert.equal(cfg.agent, "rocinante");
  assert.equal(cfg.initialMessage, undefined);
  assert.deepEqual(cfg.quickActions, [
    {
      label: "Crear campaña creator",
      prompt:
        "Quiero crear una nueva campaña de Partnerships/creators. Ayúdame a definir target de creators, redes, tiers, criterios positivos/negativos, brief y secuencia de contacto.",
    },
    {
      label: "Definir audiencia",
      prompt:
        "Quiero definir la audiencia de una campaña creator: nichos, plataformas, países, tamaños de audiencia, señales de calidad y exclusiones.",
    },
    {
      label: "Crear brief",
      prompt:
        "Quiero crear el brief y la secuencia de contacto para una campaña de Partnerships/creators.",
    },
  ]);
});

test("B2B campaign opens a blank B2B campaign thread with suggested actions", () => {
  const cfg = buildB2BCampaignThread(SLUG);
  assert.equal(cfg.threadName, "Nueva campaña B2B");
  assert.equal(cfg.agent, "rocinante");
  assert.equal(cfg.threadState, "create");
  assert.equal(cfg.initialMessage, undefined);
  assert.match(cfg.threadId, new RegExp(`^${SLUG}:b2b-campaign-new-\\d+$`));
  assert.deepEqual(cfg.quickActions, [
    {
      label: "Crear campaña B2B",
      prompt:
        "Quiero crear una nueva campaña B2B de cold email. Define ICP, oferta, audiencia, criterios positivos/negativos y una secuencia que incluya personalización por lead desde el inicio usando {{personalization}} o {{icebreaker}}. La campaña debe quedar preparada para buscar, enriquecer, personalizar automáticamente los leads y enviar.",
    },
    {
      label: "Definir ICP",
      prompt:
        "Quiero definir el ICP para una campaña B2B: roles, industrias, geografía, tamaño de empresa, señales de intención y exclusiones.",
    },
    {
      label: "Generar secuencia",
      prompt:
        "Quiero generar la secuencia de emails de una campaña B2B con email inicial y follow-ups, usando el contexto de Growth4U e incluyendo personalización por lead desde el primer email con {{personalization}} o {{icebreaker}}.",
    },
  ]);
});
