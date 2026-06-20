#!/usr/bin/env node

/**
 * generate-plan.js — Generate metrics-plan.json for a client
 *
 * Usage:
 *   node generate-plan.js --slug <client> --archetype <type> [--sub-variant <variant>]
 *   node generate-plan.js --slug <client> --auto   (auto-detect from company-context)
 *
 * Reads:
 *   - brand/{slug}/integrations.json → connected data sources
 *   - schemas/integration-mappings.json → how integrations map to metrics
 *   - generate-template.js ARCHETYPES → funnel + KPIs definition
 *
 * Writes:
 *   - brand/{slug}/metrics-plan.json
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..', '..', '..');
const SCHEMAS = path.resolve(__dirname, '..', 'schemas');

// --- Parse args ---
const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--')) args[a.slice(2)] = arr[i + 1] || true;
});

const slug = args.slug;
const archetype = args.archetype || args.auto;
const subVariant = args['sub-variant'];

if (!slug) {
  console.error('Usage: node generate-plan.js --slug <client> --archetype <type> [--sub-variant <variant>]');
  console.error('Archetypes: saas-app, fintech, marketplace, ecommerce-d2c, lead-to-sale');
  console.error('Sub-variants (lead-to-sale): local, enterprise, b2b');
  process.exit(1);
}

// --- Load archetype config from generate-template.js ---
const templateScript = fs.readFileSync(path.join(__dirname, 'generate-template.js'), 'utf-8');
const archMatch = templateScript.match(/const ARCHETYPES = ({[\s\S]*?});/);
const variantMatch = templateScript.match(/const LEAD_TO_SALE_VARIANTS = ({[\s\S]*?});/);
const tierMatch = templateScript.match(/const TIER_BY_CATEGORY = ({[\s\S]*?});/);

if (!archMatch) { console.error('Cannot parse ARCHETYPES from generate-template.js'); process.exit(1); }

const ARCHETYPES = eval('(' + archMatch[1] + ')');
const LEAD_TO_SALE_VARIANTS = variantMatch ? eval('(' + variantMatch[1] + ')') : {};
// Single source of truth for KPI tiering (defined alongside ARCHETYPES). Falls
// back to a local copy so the generator still tiers KPIs if the block moves.
const TIER_BY_CATEGORY = tierMatch ? eval('(' + tierMatch[1] + ')') : {
  funnel: 'leading', traffic: 'leading', seo: 'leading', paid: 'leading',
  social: 'leading', outreach: 'leading', crm: 'leading',
  efficiency: 'lagging', cost: 'lagging', value: 'lagging', quality: 'lagging',
  primary: 'primary',
};

// Map a KPI's category onto its tier (primary / leading / lagging). Unknown
// categories are upstream signals → "leading".
function tierForCategory(category) {
  return TIER_BY_CATEGORY[category] || 'leading';
}

// --- Load integration mappings ---
const mappings = JSON.parse(fs.readFileSync(path.join(SCHEMAS, 'integration-mappings.json'), 'utf-8'));

// --- Load client integrations ---
const integrationsPath = path.join(BASE, 'brand', slug, 'integrations.json');
let clientIntegrations = {};
if (fs.existsSync(integrationsPath)) {
  clientIntegrations = JSON.parse(fs.readFileSync(integrationsPath, 'utf-8'));
}
const dataSources = clientIntegrations.dataSources || {};

// --- Determine archetype ---
let config;
if (args.auto) {
  // Try to read company-context.md to detect archetype
  // For now, default to lead-to-sale
  console.log('⚠️  Auto-detection not yet implemented. Use --archetype <type>');
  process.exit(1);
} else if (!archetype || !ARCHETYPES[archetype]) {
  console.error(`Unknown archetype: ${archetype}. Available: ${Object.keys(ARCHETYPES).join(', ')}`);
  process.exit(1);
} else {
  config = { ...ARCHETYPES[archetype] };

  // Apply sub-variant for lead-to-sale
  if (archetype === 'lead-to-sale' && subVariant && LEAD_TO_SALE_VARIANTS[subVariant]) {
    const variant = LEAD_TO_SALE_VARIANTS[subVariant];
    config.label = `${config.label} (${variant.label})`;
    config.funnelSteps = variant.funnelSteps;
    config.activationEvent = variant.activationEvent;
    config.primaryKPI = variant.primaryKPI;
    if (variant.channelOverrides) config.channels = variant.channelOverrides;
  }
}

// --- Normalize connected source names ---
function normalizeSourceId(id) {
  return id.replace(/_/g, '-');
}
const connectedSources = new Set();
for (const [id, src] of Object.entries(dataSources)) {
  if (src.status === 'connected' || src.status === 'ok') {
    connectedSources.add(normalizeSourceId(id));
    // Add aliases
    const mapping = mappings[normalizeSourceId(id)];
    if (mapping && mapping.aliases) {
      mapping.aliases.forEach(a => connectedSources.add(normalizeSourceId(a)));
    }
  }
}

console.log(`📊 Archetype: ${config.label}`);
console.log(`📡 Connected sources: ${[...connectedSources].join(', ') || 'none'}`);
console.log(`🔄 Funnel: ${config.funnelSteps.join(' → ')}`);
console.log();

// --- Map funnel steps to integrations ---
const funnel = config.funnelSteps.map(step => {
  const entry = { step, source: null, metric: null, manual: true };

  // Try each connected source to see if it can provide this funnel step
  for (const sourceId of connectedSources) {
    const sourceMapping = mappings[sourceId];
    if (!sourceMapping || !sourceMapping.funnelMaps) continue;

    const metricName = sourceMapping.funnelMaps[step];
    if (metricName) {
      entry.source = sourceId;
      entry.metric = metricName;
      entry.manual = false;
      break;
    }
  }

  return entry;
});

// --- Build KPIs ---
const kpis = [];

// Always include funnel conversion rates
for (let i = 1; i < funnel.length; i++) {
  if (!funnel[i - 1].manual && !funnel[i].manual) {
    kpis.push({
      name: `${funnel[i - 1].step} → ${funnel[i].step} Rate`,
      formula: `${funnel[i].source}.${funnel[i].metric} / ${funnel[i - 1].source}.${funnel[i - 1].metric} * 100`,
      sources: [funnel[i].source, funnel[i - 1].source],
      format: 'percent',
      category: 'funnel',
    });
  }
}

// Add source-specific KPIs based on what's connected
// Web Traffic
if (connectedSources.has('ga4')) {
  kpis.push({ name: 'Sessions', source: 'ga4', metric: 'sessions', category: 'traffic' });
  kpis.push({ name: 'New Users', source: 'ga4', metric: 'newUsers', category: 'traffic' });
  kpis.push({ name: 'Engagement Rate', source: 'ga4', metric: 'engagementRate', format: 'percent', category: 'traffic' });
  kpis.push({ name: 'Avg Duration', source: 'ga4', metric: 'averageSessionDuration', format: 'seconds', category: 'traffic' });
}

// SEO
if (connectedSources.has('gsc')) {
  kpis.push({ name: 'SEO Impressions', source: 'gsc', metric: 'impressions', category: 'seo' });
  kpis.push({ name: 'Avg Position', source: 'gsc', metric: 'position', format: 'decimal', category: 'seo' });
}

// Paid ads (any ad platform)
const adSource = ['meta-ads', 'google-ads', 'linkedin-ads'].find(s => connectedSources.has(s));
if (adSource) {
  kpis.push({ name: 'Ad Spend', source: adSource, metric: 'spend', format: 'currency', category: 'paid' });
  kpis.push({ name: 'Ad CTR', source: adSource, metric: 'ctr', format: 'percent', category: 'paid' });
  kpis.push({ name: 'CPC', source: adSource, metric: 'cpc', format: 'currency', category: 'paid' });
  kpis.push({ name: 'Ad Clicks', source: adSource, metric: 'clicks', category: 'paid' });

  // CPL if CRM is also connected
  const crmSource = ['ghl', 'hubspot'].find(s => connectedSources.has(s));
  if (crmSource) {
    const contactMetric = mappings[crmSource]?.provides?.newContacts?.metric || 'newContacts';
    kpis.push({
      name: 'CPL',
      formula: `${adSource}.spend / ${crmSource}.${contactMetric}`,
      sources: [adSource, crmSource],
      format: 'currency',
      category: 'efficiency',
    });
  }
}

// CRM
const crmSource = ['ghl', 'hubspot'].find(s => connectedSources.has(s));
if (crmSource) {
  kpis.push({ name: 'Total Contacts', source: crmSource, metric: 'totalContacts', category: 'crm' });
  kpis.push({ name: 'New Contacts', source: crmSource, metric: 'newContacts', category: 'crm' });
  kpis.push({ name: 'Appointments', source: crmSource, metric: 'appointments', category: 'crm' });
}

// Social
if (connectedSources.has('metricool')) {
  kpis.push({ name: 'Social Engagement', source: 'metricool', metric: 'avgEngagement', format: 'percent', category: 'social' });
  kpis.push({ name: 'Social Impressions', source: 'metricool', metric: 'impressions', category: 'social' });
}

// Outreach
if (connectedSources.has('instantly')) {
  kpis.push({ name: 'Emails Sent', source: 'instantly', metric: 'sent', category: 'outreach' });
  kpis.push({ name: 'Reply Rate', source: 'instantly', metric: 'replies', category: 'outreach' });
}

// --- Tier every KPI (SAN-296) ---
// Each KPI gets a tier so the dashboard Overview groups primary / leading / lagging:
//   - default from its category (TIER_BY_CATEGORY);
//   - cost / efficiency KPIs (spend/cpc/cpa/...) are lagging regardless of category;
//   - a KPI whose name IS the archetype's primaryKPI / activationEvent -> `primary`.
// The North Star is NOT (re)derived here: it is already defined by the archetype
// (config.primaryKPI / activationEvent, via metrics-setup) and resolved by the
// dashboard (buildSeedDefinition seeds northStar.label/kpiRef; the metrics page
// resolves the value). No synthetic KPI is injected.
const primaryName = (config.primaryKPI || '').toLowerCase();
const activationName = (config.activationEvent || '').toLowerCase();
function isPrimaryKpi(kpi) {
  const n = (kpi.name || '').toLowerCase();
  if (kpi.category === 'funnel') return false; // conversion-rate KPIs are leading, never the North Star
  return [primaryName, activationName].filter(Boolean).some((t) => n === t || n.includes(t) || t.includes(n));
}
// Cost / efficiency KPIs are LAGGING regardless of category — the `paid` default is
// `leading` (clicks/CTR are leading activity), but Ad Spend / CPC / CPA are cost
// outcomes and belong in lagging.
const COST_RE = /\b(spend|cost|cpc|cpa|cpl|cpm|cac|roas|roi)\b/i;
for (const kpi of kpis) {
  if (isPrimaryKpi(kpi)) kpi.tier = 'primary';
  else if (COST_RE.test(kpi.name || '')) kpi.tier = 'lagging';
  else kpi.tier = tierForCategory(kpi.category);
}

// --- Determine which integration modules to show ---
const integrationModules = [...connectedSources].filter(s => mappings[s]);

// --- Build missing integrations list ---
const recommended = config.dataSources || [];
const missing = [];
// Build a set of keywords from connected sources for fuzzy matching
const connectedKeywords = new Set();
for (const s of connectedSources) {
  connectedKeywords.add(s);
  const m = mappings[s];
  if (m) {
    connectedKeywords.add(m.label.toLowerCase());
    (m.aliases || []).forEach(a => connectedKeywords.add(a.toLowerCase()));
  }
}

for (const ds of recommended) {
  if (ds.method === 'manual') continue;
  const sourceWords = ds.source.toLowerCase().split(/[\s\/,]+/);
  const isConnected = sourceWords.some(w =>
    [...connectedKeywords].some(k => k.includes(w) || w.includes(k))
  );
  if (!isConnected) {
    missing.push({
      metric: ds.metric,
      suggestedSource: ds.source,
      frequency: ds.frequency,
    });
  }
}

// --- Build the plan ---
const plan = {
  _generated: new Date().toISOString(),
  _generator: 'acquisition-metrics-plan/generate-plan.js',
  slug,
  archetype,
  subVariant: subVariant || null,
  label: config.label,
  activationEvent: config.activationEvent,
  primaryKPI: config.primaryKPI,
  benchmarks: config.benchmarks || {},
  funnel,
  kpis,
  integrationModules,
  missingIntegrations: missing,
  channels: (config.channels || []).map(c => ({ group: c.group, name: c.name })),
};

// --- Write ---
const outputPath = path.join(BASE, 'brand', slug, 'metrics-plan.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));

console.log(`✅ Plan written to ${outputPath}`);
console.log(`   Funnel: ${funnel.length} steps (${funnel.filter(f => !f.manual).length} automated, ${funnel.filter(f => f.manual).length} manual)`);
console.log(`   KPIs: ${kpis.length}`);
console.log(`   Integration modules: ${integrationModules.join(', ')}`);
if (missing.length > 0) {
  console.log(`   ⚠️  Missing integrations: ${missing.map(m => m.metric + ' (' + m.suggestedSource + ')').join(', ')}`);
}
