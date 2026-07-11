#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..', '..', '..')

const SIDE_EFFECT_SKILLS = new Set([
  'answer-comments',
  'email-campaign-create',
  'linkedin-campaign-create',
  'launch-linkedin-campaign',
  'multi-channel-campaign',
  'reply-to-comments',
  'send-email-sequence',
  'send-cold-email',
])

const PREFERRED_API_SKILLS = new Set([
  'answer-comments',
  'classify-mentions',
  'classify-replies',
  'competitive-intel',
  'dedupe-against-history',
  'detect-funding',
  'detect-hiring-surge',
  'detect-job-change',
  'detect-news',
  'draft-content-post',
  'email-sequence',
  'email-campaign-create',
  'enrich-email',
  'enrich-leads',
  'export-data',
  'fetch-inbox-replies',
  'find-companies',
  'find-people',
  'funding-feed-search',
  'generate-magnet-asset',
  'icp-company-search',
  'landing-page-deploy',
  'linkedin-campaign-create',
  'linkedin-trending-content',
  'list-recent-linkedin-posts',
  'monthly-campaign-report',
  'monitor-competitor-content',
  'multi-channel-campaign',
  'outline-magnet',
  'outbound-hypothesis-capture',
  'people-enrich',
  'personalize',
  'propose-campaigns',
  'propose-magnets',
  'qualify-engagers',
  'qualify-leads',
  'rank-and-truncate',
  'research',
  'research-company',
  'scrape-linkedin',
  'scrape-post-engagers',
  'score-lead',
  'send-email-sequence',
  'suggest-reply-action',
  'verify-campaign-launch',
  'visualize',
  'visualize-campaigns',
])

const KNOWN_CLI_FALLBACKS = [
  'find-linkedin',
  'track-campaign',
  'import-leads',
  'track-campaigns',
  'prospect-discovery-pipeline',
]

const SAFE_CLI_COMMANDS = new Set([
  'adapters:list',
  'framework:list',
  'framework:recommend',
  'gates:list',
  'pipeline:list',
  'provider:list',
  'routine:propose',
  'signals:list',
])

function usage() {
  console.error(`Usage:
  yalc-client health --slug <slug>
  yalc-client skills --slug <slug>
  yalc-client skill-info --slug <slug> --skill <id>
  yalc-client catalog --slug <slug>
  yalc-client today --slug <slug>
  yalc-client campaigns --slug <slug>
  yalc-client create-campaign-draft --slug <slug> [--input <json-file>|--json '<json>'] [--allow-empty-email-sequence]
  yalc-client campaign --slug <slug> --id <campaign-id>
  yalc-client add-campaign-step --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>']
  yalc-client campaign-leads-search --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-leads-enrich --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-leads-personalize --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-leads --slug <slug> --id <campaign-id>
  yalc-client campaign-lead --slug <slug> --id <campaign-id> --lead-id <lead-id>
  yalc-client campaign-sequence-update --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-sequence-approve --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-sequence-request-changes --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-dry-run --slug <slug> --id <campaign-id> --confirm-side-effect
  yalc-client campaign-publish --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-live --slug <slug> --id <campaign-id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client outbound-command --slug <slug> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client campaign-report --slug <slug> --id <campaign-id>
  yalc-client campaign-timeline --slug <slug> --id <campaign-id>
  yalc-client campaign-export --slug <slug> --id <campaign-id>
  yalc-client campaign-chat --slug <slug> --id <campaign-id> --message <question>
  yalc-client pause-campaign --slug <slug> --id <campaign-id> --confirm-side-effect
  yalc-client resume-campaign --slug <slug> --id <campaign-id> --confirm-side-effect
  yalc-client update-lead-status --slug <slug> --id <campaign-id> --lead-id <lead-id> --status <status> --confirm-side-effect
  yalc-client brain --slug <slug>
  yalc-client brain-update --slug <slug> --path <dot.path> --value-json '<json>' --confirm-side-effect
  yalc-client gates --slug <slug>
  yalc-client approve-gate --slug <slug> --run-id <id> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client reject-gate --slug <slug> --run-id <id> --reason <text> --confirm-side-effect
  yalc-client providers --slug <slug>
  yalc-client provider-knowledge --slug <slug>
  yalc-client provider-test --slug <slug> --provider <id>
  yalc-client setup-preview --slug <slug>
  yalc-client setup-update-preview --slug <slug> --section <section> --input <json-file> --confirm-side-effect
  yalc-client setup-regenerate --slug <slug> --section <section> [--hint <text>] --confirm-side-effect
  yalc-client setup-commit --slug <slug> [--input <json-file>|--json '<json>'] --confirm-side-effect
  yalc-client dashboard-list --slug <slug>
  yalc-client dashboard --slug <slug> --archetype <a|b|c|d>
  yalc-client visualizations --slug <slug>
  yalc-client visualization --slug <slug> --view-id <id>
  yalc-client run-skill --slug <slug> --skill <id> --input <json-file> [--confirm-side-effect]
  yalc-client api --slug <slug> --method <GET|POST|PUT|PATCH|DELETE> --path </api/...> [--input <json-file>|--json '<json>'] [--confirm-side-effect]
  yalc-client cli --slug <slug> --argv '["provider:list"]'

Options:
  --base-url <url>              Override YALC base URL
  --token <token>               Override bearer token (avoid in shell history; prefer env)
  --mc-base-url <url>           Override Mission Control base URL for outbound-command (default SANCHO_BASE_URL or localhost:3000)
  --admin-token <token>         Override Mission Control admin token for outbound-command (default MC_ADMIN_TOKEN or clients.json)
  --json '<json>'               Inline JSON payload for run-skill
  --confirm-side-effect         Required for live sends, campaign status writes, gates, setup commits, and generic mutating API calls
                                Not required for create-campaign-draft because it only creates an internal YALC review draft
  --callback-context '<json>'   For long ops (campaign-leads-search, campaign-leads-enrich, campaign-leads-personalize, campaign-publish, run-skill, approve-gate, reject-gate):
                                {"slug","threadId","agent"} captured from the [MC Chat Context]. When YALC runs the op as a
                                background job (202), it POSTs the result to SANCHO_BASE_URL/api/yalc/job-callback, which
                                re-engages this chat thread. The agent must say "te aviso cuando termine" and END the turn.
`)
}

function parseArgs(argv) {
  const args = { _: [] }
  const boolFlags = new Set(['confirm-side-effect', 'allow-unverified-skill', 'allow-empty-email-sequence'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      args._.push(a)
      continue
    }
    const key = a.slice(2)
    if (boolFlags.has(key)) {
      args[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true
      continue
    }
    const next = argv[++i]
    if (next == null) throw new Error(`Missing value for --${key}`)
    args[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = next
  }
  return args
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  const raw = fs.readFileSync(file, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    value = value.replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

function slugPrefix(slug) {
  return String(slug || '').replace(/-/g, '_').toUpperCase()
}

function resolveConfig(args) {
  const slug = args.slug || 'growth4u'
  loadDotEnv(path.join(workspaceRoot, 'brand', slug, '.env'))
  const prefix = slugPrefix(slug)
  const baseUrl =
    args.baseUrl ||
    process.env[`${prefix}_YALC_BASE_URL`] ||
    process.env.YALC_BASE_URL ||
    process.env.GTM_OS_BASE_URL ||
    'http://localhost:3847'
  const token =
    args.token ||
    process.env[`${prefix}_YALC_API_TOKEN`] ||
    process.env.YALC_API_TOKEN ||
    process.env.GTM_OS_API_TOKEN ||
    ''
  return { slug, baseUrl: baseUrl.replace(/\/+$/, ''), token }
}

async function request(config, method, endpoint, body) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (config.token) headers.Authorization = `Bearer ${config.token}`

  // Scope every call to the brand's YALC tenant (idempotent — overrides any
  // tenant already on the endpoint). Without this, campaigns/skills/gates hit
  // the `default` tenant instead of the brand.
  const url = new URL(endpoint, config.baseUrl)
  if (config.slug) url.searchParams.set('tenant', config.slug)

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const message = data?.message || data?.error || text || `HTTP ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.data = data
    throw err
  }
  // YALC returns 202 {jobId, statusUrl} for long-running ops it has converted
  // to async jobs. The result is delivered later via the callbackUrl we passed
  // in the request body; the agent must NOT poll. Surface the async marker so
  // callAndSave/commands can report "te aviso cuando termine" and end the turn.
  if (res.status === 202) {
    return {
      ok: true,
      async: true,
      jobId: data?.jobId ?? null,
      statusUrl: data?.statusUrl ?? null,
    }
  }
  return data
}

function readAdminToken() {
  if (process.env.MC_ADMIN_TOKEN) return process.env.MC_ADMIN_TOKEN
  for (const file of [
    path.join(workspaceRoot, 'clients.json'),
    path.join(workspaceRoot, 'workspace-sancho', 'clients.json'),
  ]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof data.adminToken === 'string' && data.adminToken.trim()) return data.adminToken.trim()
    } catch {
      // Best effort: env remains the preferred path.
    }
  }
  return ''
}

function resolveMissionControlConfig(args) {
  return {
    slug: args.slug || 'growth4u',
    baseUrl: (args.mcBaseUrl || process.env.SANCHO_BASE_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    token: args.adminToken || readAdminToken(),
  }
}

async function missionControlRequest(config, method, endpoint, body) {
  const url = new URL(endpoint, config.baseUrl)
  if (config.slug) url.searchParams.set('slug', config.slug)
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (config.token) headers['x-admin-token'] = config.token
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify({ ...(body || {}), slug: config.slug }),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const message = data?.message || data?.error || text || `HTTP ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

async function callMissionControlAndSave(args, label, method, endpoint, body) {
  const mc = resolveMissionControlConfig(args)
  const data = await missionControlRequest(mc, method, endpoint, body)
  const out = { ok: true, data, request: { method, endpoint, baseUrl: mc.baseUrl } }
  if (data && data.async === true) {
    out.async = true
    out.jobId = data.jobId
    out.statusUrl = data.statusUrl
  }
  out.savedTo = saveRun(mc.slug, label, out)
  console.log(JSON.stringify(out, null, 2))
  return out
}

async function callAndSave(config, label, method, endpoint, body) {
  const data = await request(config, method, endpoint, body)
  const out = { ok: true, data, request: { method, endpoint } }
  // Hoist the async marker so the agent sees it at the top level: YALC accepted
  // the long op as a background job and will deliver the result via callback.
  // The agent MUST tell the user "te aviso cuando termine" and END the turn —
  // do NOT poll statusUrl in a loop.
  if (data && data.async === true) {
    out.async = true
    out.jobId = data.jobId
    out.statusUrl = data.statusUrl
  }
  out.savedTo = saveRun(config.slug, label, out)
  console.log(JSON.stringify(out, null, 2))
  return out
}

function ensureYalcOutputDir(slug) {
  const dir = path.join(workspaceRoot, 'brand', slug, 'yalc', 'runs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function saveRun(slug, label, data) {
  const dir = ensureYalcOutputDir(slug)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '-')
  const file = path.join(dir, `${ts}-${safeLabel}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  return path.relative(workspaceRoot, file)
}

function readPayload(args) {
  if (args.json) return JSON.parse(args.json)
  if (!args.input) return {}
  const abs = path.isAbsolute(args.input) ? args.input : path.join(workspaceRoot, args.input)
  let raw
  try {
    raw = fs.readFileSync(abs, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        `Payload file not found at ${abs} (a relative --input is resolved against ${workspaceRoot}). ` +
        `Pass the payload inline with --json '<json>', or write it to an absolute path under /tmp and pass that with --input.`,
      )
    }
    throw err
  }
  return JSON.parse(raw)
}

function requireArg(args, name) {
  if (!args[name]) throw new Error(`Missing --${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`)
  return args[name]
}

function requireConfirmation(args, action) {
  if (!args.confirmSideEffect) {
    throw new Error(`${action} can modify YALC or external systems. Re-run with --confirm-side-effect after explicit user approval.`)
  }
}

function endpointWithTenant(endpoint, slug) {
  const sep = endpoint.includes('?') ? '&' : '?'
  return `${endpoint}${sep}tenant=${encodeURIComponent(slug)}`
}

// Sancho's own base URL — where YALC POSTs job-completion callbacks. This is the
// Sancho/Mission-Control app, NOT the YALC base URL.
function sanchoBaseUrl() {
  const base = process.env.SANCHO_BASE_URL || process.env.BASE_URL || 'http://localhost:3000'
  return base.replace(/\/+$/, '')
}

function callbackUrl() {
  return `${sanchoBaseUrl()}/api/yalc/job-callback`
}

// Long-op commands hit YALC endpoints that may return 202 + run async. For
// those we attach callbackUrl + callbackContext so YALC can re-engage the
// originating chat thread when the job finishes. The chat runtime exposes this
// context through SANCHO_CHAT_*; --callback-context remains an explicit CLI
// fallback. A manual CLI run without either source remains fire-and-poll.
function parseCallbackContext(args) {
  if (!args.callbackContext) {
    const slug = process.env.SANCHO_CHAT_SLUG
    const threadId = process.env.SANCHO_CHAT_THREAD_ID
    const agent = process.env.SANCHO_CHAT_AGENT
    if (!slug || !threadId || !agent) return null
    return {
      slug,
      threadId,
      agent,
      originalRequest: process.env.SANCHO_CHAT_REQUEST || undefined,
    }
  }
  let ctx
  try {
    ctx = JSON.parse(args.callbackContext)
  } catch {
    throw new Error('--callback-context must be JSON, e.g. \'{"slug":"acme","threadId":"acme:abc","agent":"rocinante"}\'')
  }
  if (!ctx || typeof ctx !== 'object' || !ctx.slug || !ctx.threadId || !ctx.agent) {
    throw new Error('--callback-context requires { slug, threadId, agent }')
  }
  return {
    slug: ctx.slug,
    threadId: ctx.threadId,
    agent: ctx.agent,
    originalRequest: typeof ctx.originalRequest === 'string'
      ? ctx.originalRequest
      : process.env.SANCHO_CHAT_REQUEST || undefined,
  }
}

// Merge callbackUrl + callbackContext into a long-op POST body when the agent
// supplied a chat context. Returns the body unchanged when no context is given.
function withAsyncCallback(body, args) {
  const ctx = parseCallbackContext(args)
  if (!ctx) return body
  const command = typeof body?.command === 'string' ? body.command : undefined
  const campaignId = typeof body?.campaignId === 'string' ? body.campaignId : undefined
  const profileKind = typeof body?.profileKind === 'string' ? body.profileKind : undefined
  const channel = typeof body?.channel === 'string' ? body.channel : undefined
  return {
    ...(body || {}),
    callbackUrl: callbackUrl(),
    callbackContext: { ...ctx, command, campaignId, profileKind, channel },
  }
}

function normalizeLiveSkillIds(skillsData) {
  const ids = new Set()
  const skills = Array.isArray(skillsData?.skills) ? skillsData.skills : []
  for (const skill of skills) {
    if (!skill?.id) continue
    ids.add(skill.id)
    if (String(skill.id).startsWith('md:')) ids.add(String(skill.id).slice(3))
  }
  return ids
}

async function fetchLiveSkillIds(config) {
  const data = await request(config, 'GET', '/api/skills/list')
  return normalizeLiveSkillIds(data)
}

function isSideEffectingSkill(skill) {
  if (SIDE_EFFECT_SKILLS.has(skill)) return true
  return /(^|[-:])(send|launch|reply|post|publish|campaign-create|linkedin-campaign-create|email-campaign-create)([-:]|$)/.test(skill)
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function arrayHasEmailBody(items) {
  if (!Array.isArray(items)) return false
  return items.some((item) => {
    if (!isRecord(item)) return false
    return Boolean(typeof item.body === 'string' && item.body.trim()
      || typeof item.content === 'string' && item.content.trim()
      || typeof item.message === 'string' && item.message.trim()
      || typeof item.template === 'string' && item.template.trim())
  })
}

function inputHasEmailSequence(input) {
  if (!isRecord(input)) return false
  return arrayHasEmailBody(input.sequence)
    || arrayHasEmailBody(input.emails)
    || arrayHasEmailBody(input.emailSequence)
    || arrayHasEmailBody(input.email_sequence)
    || arrayHasEmailBody(input.steps)
    || arrayHasEmailBody(input.messages)
}

function hasReviewableEmailSequence(payload) {
  if (!isRecord(payload)) return false
  if (inputHasEmailSequence(payload)) return true
  const steps = Array.isArray(payload.steps) ? payload.steps : []
  return steps.some((step) => isRecord(step) && inputHasEmailSequence(step.skillInput))
}

function requiresEmailSequence(payload) {
  if (!isRecord(payload)) return false
  const channels = Array.isArray(payload.channels) ? payload.channels : []
  if (channels.some((channel) => String(channel).toLowerCase() === 'email')) return true
  const steps = Array.isArray(payload.steps) ? payload.steps : []
  return steps.some((step) => {
    if (!isRecord(step)) return false
    const skillId = String(step.skillId || '').toLowerCase()
    const channel = String(step.channel || '').toLowerCase()
    return channel === 'email' || skillId.includes('email')
  })
}

function assertReviewableEmailDraft(payload, args) {
  if (!requiresEmailSequence(payload) || args.allowEmptyEmailSequence) return
  if (hasReviewableEmailSequence(payload)) return
  throw new Error(
    'Email campaign drafts must include a reviewable email sequence before they are created. Add a send-email-sequence step with skillInput.sequence [{ subject, body, delay_days }] or rerun with --allow-empty-email-sequence for a planning-only draft.',
  )
}

function assertSafeGenericApi(args) {
  const method = String(args.method || 'GET').toUpperCase()
  const endpoint = requireArg(args, 'path')
  if (!endpoint.startsWith('/api/')) throw new Error('Generic API access is limited to /api/* paths.')
  if (endpoint.startsWith('/api/keys/save')) {
    throw new Error('Do not save API keys through Yalc Agent. Use Mission Control credential setup instead.')
  }
  if (method !== 'GET') requireConfirmation(args, `Generic ${method} ${endpoint}`)
  return { method, endpoint }
}

function runCliFallback(args, config) {
  const raw = requireArg(args, 'argv')
  let argv
  try {
    argv = JSON.parse(raw)
  } catch {
    throw new Error('--argv must be a JSON array, for example: --argv \'["provider:list"]\'')
  }
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((v) => typeof v !== 'string')) {
    throw new Error('--argv must be a non-empty JSON array of strings')
  }
  const command = argv[0]
  if (!SAFE_CLI_COMMANDS.has(command)) {
    throw new Error(`CLI fallback command "${command}" is not allowlisted for Yalc Agent. Use the API wrapper or add the command intentionally.`)
  }
  const bin = process.env.YALC_CLI_BIN || 'yalc-gtm'
  const cwd = process.env.YALC_CLI_CWD || process.cwd()
  const result = spawnSync(bin, argv, {
    cwd,
    env: {
      ...process.env,
      GTM_OS_TENANT: config.slug,
      ...(config.token ? { GTM_OS_API_TOKEN: config.token } : {}),
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  const out = {
    ok: result.status === 0,
    command: [bin, ...argv],
    cwd,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    signal: result.signal,
  }
  out.savedTo = saveRun(config.slug, `cli-${command}`, out)
  console.log(JSON.stringify(out, null, 2))
  process.exit(result.status === 0 ? 0 : 1)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]
  if (!command) {
    usage()
    process.exit(2)
  }
  const config = resolveConfig(args)

  if (command === 'health') {
    const checks = {}
    for (const [name, endpoint] of Object.entries({
      skills: '/api/skills/list',
      today: '/api/today/feed',
      campaigns: '/api/campaigns',
      gates: '/api/gates/awaiting',
      providers: '/api/keys/list',
    })) {
      try {
        const data = await request(config, 'GET', endpoint)
        checks[name] = { ok: true, count: countRows(data) }
      } catch (err) {
        checks[name] = { ok: false, error: err.message, status: err.status || null }
      }
    }
    const ok = Object.values(checks).every((c) => c.ok)
    const out = { ok, baseUrl: config.baseUrl, auth: config.token ? 'bearer' : 'none', checks }
    out.savedTo = saveRun(config.slug, 'health', out)
    console.log(JSON.stringify(out, null, 2))
    process.exit(ok ? 0 : 1)
  }

  if (command === 'skills') {
    return callAndSave(config, 'skills', 'GET', '/api/skills/list')
  }

  if (command === 'skill-info') {
    const skill = requireArg(args, 'skill')
    return callAndSave(config, `skill-${skill}`, 'GET', `/api/skills/${encodeURIComponent(skill)}`)
  }

  if (command === 'catalog') {
    const out = {
      ok: true,
      apiPreferred: [...PREFERRED_API_SKILLS].sort(),
      sideEffectSkills: [...SIDE_EFFECT_SKILLS].sort(),
      cliFallbacks: KNOWN_CLI_FALLBACKS.sort(),
      safeCliCommands: [...SAFE_CLI_COMMANDS].sort(),
      note: 'API is the primary integration. `run-skill` accepts any skill present in the live /api/skills/list catalog; side-effecting skills force dryRun unless confirmed.',
    }
    out.savedTo = saveRun(config.slug, 'catalog', out)
    console.log(JSON.stringify(out, null, 2))
    return
  }

  if (command === 'outbound-command') {
    const payload = withAsyncCallback(readPayload(args), args)
    const commandName = typeof payload.command === 'string' ? payload.command : ''
    if (commandName !== 'outbound.status') {
      requireConfirmation(args, command)
    }
    const label = `outbound-${commandName.replace(/[^a-zA-Z0-9_-]/g, '-') || 'command'}`
    return callMissionControlAndSave(args, label, 'POST', '/api/outbound/command', payload)
  }

  if (command === 'campaigns') {
    return callAndSave(config, 'campaigns', 'GET', '/api/campaigns')
  }

  if (command === 'create-campaign-draft') {
    const payload = readPayload(args)
    assertReviewableEmailDraft(payload, args)
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'campaign'
    return callAndSave(config, `campaign-draft-${title}`, 'POST', '/api/campaigns', payload)
  }

  if (command === 'add-campaign-step') {
    const id = requireArg(args, 'id')
    const payload = readPayload(args)
    return callAndSave(config, `campaign-${id}-add-step`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/steps`, payload)
  }

  if (command === 'campaign-leads-search') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const payload = withAsyncCallback(readPayload(args), args)
    return callAndSave(config, `campaign-${id}-leads-search`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/leads/search`, payload)
  }

  if (command === 'campaign-leads-enrich') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const payload = withAsyncCallback(readPayload(args), args)
    return callAndSave(config, `campaign-${id}-leads-enrich`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/leads/enrich`, payload)
  }

  if (command === 'campaign-leads-personalize') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const payload = withAsyncCallback(readPayload(args), args)
    return callAndSave(config, `campaign-${id}-leads-personalize`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/leads/personalize`, payload)
  }

  if (command === 'today') {
    return callAndSave(config, 'today', 'GET', '/api/today/feed')
  }

  if (command === 'campaign') {
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}`, 'GET', `/api/campaigns/${encodeURIComponent(id)}`)
  }

  if (command === 'campaign-leads') {
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}-leads`, 'GET', `/api/campaigns/${encodeURIComponent(id)}/leads`)
  }

  if (command === 'campaign-lead') {
    const id = requireArg(args, 'id')
    const leadId = requireArg(args, 'leadId')
    return callAndSave(config, `campaign-${id}-lead-${leadId}`, 'GET', `/api/campaigns/${encodeURIComponent(id)}/leads/${encodeURIComponent(leadId)}`)
  }

  if (command === 'campaign-report') {
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}-report`, 'GET', `/api/campaigns/${encodeURIComponent(id)}/report`)
  }

  if (command === 'campaign-timeline') {
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}-timeline`, 'GET', `/api/campaigns/${encodeURIComponent(id)}/timeline`)
  }

  if (command === 'campaign-export') {
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}-export`, 'GET', `/api/campaigns/${encodeURIComponent(id)}/export?format=csv`)
  }

  if (command === 'campaign-chat') {
    const id = requireArg(args, 'id')
    const message = requireArg(args, 'message')
    return callAndSave(config, `campaign-${id}-chat`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/chat`, { message })
  }

  if (command === 'campaign-sequence-update') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const payload = readPayload(args)
    return callAndSave(config, `campaign-${id}-sequence-update`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/sequence/update`, payload)
  }

  if (command === 'campaign-sequence-approve') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const payload = readPayload(args)
    return callAndSave(config, `campaign-${id}-sequence-approve`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/sequence/approve`, payload)
  }

  if (command === 'campaign-sequence-request-changes') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const payload = readPayload(args)
    return callAndSave(config, `campaign-${id}-sequence-request-changes`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/sequence/request-changes`, payload)
  }

  if (command === 'campaign-dry-run') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}-dry-run`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/dry-run`, {})
  }

  if (command === 'campaign-publish') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}-publish`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/publish`, withAsyncCallback({
      ...readPayload(args),
      confirmInstantlyPublish: true,
    }, args))
  }

  if (command === 'campaign-live') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    return callAndSave(config, `campaign-${id}-live`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/live`, {
      ...readPayload(args),
      confirmLiveLaunch: true,
    })
  }

  if (command === 'pause-campaign' || command === 'resume-campaign') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const action = command === 'pause-campaign' ? 'pause' : 'resume'
    return callAndSave(config, `${command}-${id}`, 'POST', `/api/campaigns/${encodeURIComponent(id)}/${action}`, {})
  }

  if (command === 'update-lead-status') {
    requireConfirmation(args, command)
    const id = requireArg(args, 'id')
    const leadId = requireArg(args, 'leadId')
    const lifecycleStatus = requireArg(args, 'status')
    return callAndSave(config, `campaign-${id}-lead-${leadId}-status`, 'PATCH', `/api/campaigns/${encodeURIComponent(id)}/leads/${encodeURIComponent(leadId)}`, { lifecycleStatus })
  }

  if (command === 'brain') {
    return callAndSave(config, 'brain', 'GET', endpointWithTenant('/api/brain/context', config.slug))
  }

  if (command === 'brain-update') {
    requireConfirmation(args, command)
    const pathArg = requireArg(args, 'path')
    if (!args.valueJson) throw new Error('Missing --value-json')
    return callAndSave(config, 'brain-update', 'POST', endpointWithTenant('/api/brain/section', config.slug), {
      path: pathArg,
      value: JSON.parse(args.valueJson),
    })
  }

  if (command === 'gates') {
    return callAndSave(config, 'gates', 'GET', '/api/gates/awaiting')
  }

  if (command === 'approve-gate') {
    requireConfirmation(args, command)
    const runId = requireArg(args, 'runId')
    const payload = withAsyncCallback(readPayload(args), args)
    return callAndSave(config, `gate-${runId}-approve`, 'POST', `/api/gates/${encodeURIComponent(runId)}/approve`, payload)
  }

  if (command === 'reject-gate') {
    requireConfirmation(args, command)
    const runId = requireArg(args, 'runId')
    const reason = requireArg(args, 'reason')
    return callAndSave(config, `gate-${runId}-reject`, 'POST', `/api/gates/${encodeURIComponent(runId)}/reject`, withAsyncCallback({ reason }, args))
  }

  if (command === 'providers') {
    return callAndSave(config, 'providers', 'GET', '/api/keys/list')
  }

  if (command === 'provider-knowledge') {
    return callAndSave(config, 'provider-knowledge', 'GET', '/api/keys/knowledge')
  }

  if (command === 'provider-test') {
    const provider = requireArg(args, 'provider')
    return callAndSave(config, `provider-${provider}-test`, 'POST', `/api/keys/test/${encodeURIComponent(provider)}`, {})
  }

  if (command === 'setup-preview') {
    return callAndSave(config, 'setup-preview', 'GET', endpointWithTenant('/api/setup/preview', config.slug))
  }

  if (command === 'setup-update-preview') {
    requireConfirmation(args, command)
    const section = requireArg(args, 'section')
    const payload = readPayload(args)
    return callAndSave(config, `setup-preview-${section}`, 'PUT', endpointWithTenant(`/api/setup/preview/${encodeURIComponent(section)}`, config.slug), payload)
  }

  if (command === 'setup-regenerate') {
    requireConfirmation(args, command)
    const section = requireArg(args, 'section')
    const payload = args.hint ? { hint: args.hint } : {}
    return callAndSave(config, `setup-regenerate-${section}`, 'POST', endpointWithTenant(`/api/setup/regenerate/${encodeURIComponent(section)}`, config.slug), payload)
  }

  if (command === 'setup-commit') {
    requireConfirmation(args, command)
    return callAndSave(config, 'setup-commit', 'POST', endpointWithTenant('/api/setup/commit', config.slug), readPayload(args))
  }

  if (command === 'dashboard-list') {
    return callAndSave(config, 'dashboard-list', 'GET', '/api/dashboard/list')
  }

  if (command === 'dashboard') {
    const archetype = requireArg(args, 'archetype')
    return callAndSave(config, `dashboard-${archetype}`, 'GET', `/api/dashboard/${encodeURIComponent(archetype)}`)
  }

  if (command === 'visualizations') {
    return callAndSave(config, 'visualizations', 'GET', '/api/visualize/list')
  }

  if (command === 'visualization') {
    const viewId = requireArg(args, 'viewId')
    return callAndSave(config, `visualization-${viewId}`, 'GET', `/api/visualize/${encodeURIComponent(viewId)}`)
  }

  if (command === 'run-skill') {
    const skill = args.skill
    if (!skill) throw new Error('Missing --skill')
    let liveIds = null
    try {
      liveIds = await fetchLiveSkillIds(config)
    } catch (err) {
      if (!args.allowUnverifiedSkill) {
        throw new Error(`Could not verify live YALC skill catalog: ${err.message}. Run health first or use --allow-unverified-skill for an intentionally allowlisted fallback.`)
      }
    }
    if (liveIds && !liveIds.has(skill)) {
      throw new Error(`Skill "${skill}" is not present in live YALC /api/skills/list. Run "skills" and use one of the returned ids.`)
    }
    if (!liveIds && !PREFERRED_API_SKILLS.has(skill)) {
      throw new Error(`Skill "${skill}" is not in Sancho's preferred YALC catalog and live verification failed.`)
    }
    const payload = readPayload(args)
    const sideEffecting = isSideEffectingSkill(skill)
    if (sideEffecting && !args.confirmSideEffect) {
      payload.dryRun = true
    }
    if (sideEffecting && payload.dryRun !== true && !args.confirmSideEffect) {
      throw new Error(`Skill "${skill}" can modify external systems. Re-run with --confirm-side-effect after user approval.`)
    }
    // Skill runs are long ops on the YALC side — attach the callback so a 202
    // job can re-engage the originating chat thread when it finishes.
    const body = withAsyncCallback(payload, args)
    const data = await request(config, 'POST', `/api/skills/run/${encodeURIComponent(skill)}`, body)
    const out = {
      ok: true,
      data,
      request: {
        skill,
        dryRunForced: sideEffecting && !args.confirmSideEffect,
        sideEffecting,
      },
    }
    if (data && data.async === true) {
      out.async = true
      out.jobId = data.jobId
      out.statusUrl = data.statusUrl
    }
    out.savedTo = saveRun(config.slug, `run-${skill}`, out)
    console.log(JSON.stringify(out, null, 2))
    return
  }

  if (command === 'api') {
    const { method, endpoint } = assertSafeGenericApi(args)
    return callAndSave(config, `api-${method}-${endpoint.replace(/[^a-zA-Z0-9_-]/g, '-')}`, method, endpoint, method === 'GET' ? undefined : readPayload(args))
  }

  if (command === 'cli') {
    return runCliFallback(args, config)
  }

  usage()
  throw new Error(`Unknown command: ${command}`)
}

function countRows(data) {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) return data.length
  for (const key of ['skills', 'items', 'campaigns', 'sections', 'providers', 'archetypes']) {
    if (Array.isArray(data[key])) return data[key].length
  }
  if (typeof data.total === 'number') return data.total
  return null
}

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    error: err.message,
    status: err.status || null,
    data: err.data || undefined,
  }, null, 2))
  process.exit(1)
})
