#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '..', '..', '..')

const SIDE_EFFECT_SKILLS = new Set([
  'send-email-sequence',
])

const ALLOWED_SKILLS = new Set([
  'find-companies',
  'find-people',
  'enrich-leads',
  'qualify-leads',
  'email-sequence',
  'send-email-sequence',
  'personalize',
  'competitive-intel',
  'monthly-campaign-report',
  'visualize-campaigns',
  'research',
])

function usage() {
  console.error(`Usage:
  yalc-client health --slug <slug>
  yalc-client skills --slug <slug>
  yalc-client campaigns --slug <slug>
  yalc-client brain --slug <slug>
  yalc-client run-skill --slug <slug> --skill <id> --input <json-file> [--confirm-side-effect]

Options:
  --base-url <url>              Override YALC base URL
  --token <token>               Override bearer token (avoid in shell history; prefer env)
  --json '<json>'               Inline JSON payload for run-skill
`)
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      args._.push(a)
      continue
    }
    const key = a.slice(2)
    if (key === 'confirm-side-effect') {
      args.confirmSideEffect = true
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

  const res = await fetch(`${config.baseUrl}${endpoint}`, {
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
  return data
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
  return JSON.parse(fs.readFileSync(abs, 'utf8'))
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
    const data = await request(config, 'GET', '/api/skills/list')
    const out = { ok: true, data }
    out.savedTo = saveRun(config.slug, 'skills', out)
    console.log(JSON.stringify(out, null, 2))
    return
  }

  if (command === 'campaigns') {
    const data = await request(config, 'GET', '/api/campaigns')
    const out = { ok: true, data }
    out.savedTo = saveRun(config.slug, 'campaigns', out)
    console.log(JSON.stringify(out, null, 2))
    return
  }

  if (command === 'brain') {
    const data = await request(config, 'GET', '/api/brain/context')
    const out = { ok: true, data }
    out.savedTo = saveRun(config.slug, 'brain', out)
    console.log(JSON.stringify(out, null, 2))
    return
  }

  if (command === 'run-skill') {
    const skill = args.skill
    if (!skill) throw new Error('Missing --skill')
    if (!ALLOWED_SKILLS.has(skill)) {
      throw new Error(`Skill "${skill}" is not allowlisted for Sancho. Add it intentionally before use.`)
    }
    const payload = readPayload(args)
    const sideEffecting = SIDE_EFFECT_SKILLS.has(skill)
    if (sideEffecting && !args.confirmSideEffect) {
      payload.dryRun = true
    }
    if (sideEffecting && payload.dryRun !== true && !args.confirmSideEffect) {
      throw new Error(`Skill "${skill}" can modify external systems. Re-run with --confirm-side-effect after user approval.`)
    }
    const data = await request(config, 'POST', `/api/skills/run/${encodeURIComponent(skill)}`, payload)
    const out = {
      ok: true,
      data,
      request: {
      skill,
      dryRunForced: sideEffecting && !args.confirmSideEffect,
      sideEffecting,
      },
    }
    out.savedTo = saveRun(config.slug, `run-${skill}`, out)
    console.log(JSON.stringify(out, null, 2))
    return
  }

  usage()
  throw new Error(`Unknown command: ${command}`)
}

function countRows(data) {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) return data.length
  for (const key of ['skills', 'items', 'campaigns', 'sections']) {
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
