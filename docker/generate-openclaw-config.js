#!/usr/bin/env node
/**
 * generate-openclaw-config.js — Auto-generate openclaw.json from env vars
 *
 * Reads DISCORD_BOT_TOKEN from env.
 * Auto-detects Discord guilds via API and creates bindings:
 *   - All guilds → sancho agent
 *
 * Idempotent: merges with existing config, preserves runtime state.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const OPENCLAW_ROOT = process.env.OPENCLAW_HOME || '/root/.openclaw';
const OPENCLAW_JSON = path.join(OPENCLAW_ROOT, '.openclaw', 'openclaw.json');

async function main() {
  // Ensure .openclaw directory exists
  const configDir = path.dirname(OPENCLAW_JSON);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  // Load existing config or start fresh
  let config = {};
  if (fs.existsSync(OPENCLAW_JSON)) {
    try {
      config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf8'));
    } catch (e) {
      console.log('[config] WARNING: existing openclaw.json is corrupt, starting fresh');
      config = {};
    }
  }

  const discordToken = process.env.DISCORD_BOT_TOKEN;
  const cervantesGuildId = process.env.CERVANTES_GUILD_ID || '';
  const mcChatSecret = process.env.MC_CHAT_SECRET || '';

  // --- Auth profiles ---
  // ANTHROPIC_AUTH_MODE selects how Anthropic inference authenticates:
  //   api_key (default) → profile `anthropic:default` (mode "token"); the key
  //                       is read from ANTHROPIC_API_KEY in the env.
  //   subscription      → profile `anthropic:claude-cli` (OAuth via Claude CLI).
  // The subscription enforcement (docker/ensure-anthropic-subscription-auth.js)
  // is gated on the same mode in entrypoint.sh, so the two stay consistent.
  const anthropicAuthMode = (process.env.ANTHROPIC_AUTH_MODE || 'api_key').toLowerCase();
  if (!config.auth) config.auth = {};
  if (!config.auth.profiles) config.auth.profiles = {};
  if (!config.auth.order) config.auth.order = {};
  if (anthropicAuthMode === 'subscription') {
    delete config.auth.profiles['anthropic:default'];
    config.auth.profiles['anthropic:claude-cli'] = {
      provider: 'claude-cli',
      mode: 'oauth'
    };
    config.auth.order.anthropic = ['anthropic:claude-cli'];
  } else {
    delete config.auth.profiles['anthropic:claude-cli'];
    config.auth.profiles['anthropic:default'] = {
      provider: 'anthropic',
      mode: 'token'
    };
    config.auth.order.anthropic = ['anthropic:default'];
  }

  // --- Agent defaults ---
  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};
  config.agents.defaults.workspace = path.join(OPENCLAW_ROOT, 'workspace-sancho');
  config.agents.defaults.model = config.agents.defaults.model || { primary: 'anthropic/claude-opus-4-6' };
  config.agents.defaults.maxConcurrent = config.agents.defaults.maxConcurrent || 4;
  if (!config.agents.defaults.subagents) config.agents.defaults.subagents = {};
  config.agents.defaults.subagents.maxConcurrent = config.agents.defaults.subagents.maxConcurrent || 8;

  // Heartbeat polls (`{ every: "1h" }`) trigger one model turn per agent every
  // hour for proactive checks. In this project periodic work goes through
  // explicit cron jobs, so heartbeats just burn quota — on 2026-05-22 they
  // saturated the Codex subscription rate-limit. Strip the block defensively
  // in case an older config or upstream default reintroduced it.
  if (config.agents.defaults.heartbeat) {
    delete config.agents.defaults.heartbeat;
    console.log('[config] Removed agents.defaults.heartbeat (deprecated in this project)');
  }

  // --- Session agents (escudero, rocinante, yalc) ---
  config.agents.list = [
    { id: 'escudero', workspace: path.join(OPENCLAW_ROOT, 'workspace-escudero') },
    { id: 'rocinante', workspace: path.join(OPENCLAW_ROOT, 'workspace-rocinante') },
    { id: 'yalc', workspace: path.join(OPENCLAW_ROOT, 'workspace-yalc') }
  ];

  // --- Gateway ---
  if (!config.gateway) config.gateway = {};
  config.gateway.port = 18789;
  config.gateway.mode = 'local';
  config.gateway.bind = 'loopback';
  if (!config.gateway.auth) config.gateway.auth = {};
  if (!config.gateway.auth.token) {
    config.gateway.auth.mode = 'token';
    config.gateway.auth.token = require('crypto').randomBytes(24).toString('hex');
  }

  // --- Commands ---
  if (!config.commands) config.commands = {};
  config.commands.native = 'auto';
  config.commands.nativeSkills = 'auto';
  config.commands.restart = true;
  config.commands.ownerDisplay = 'raw';

  // --- Discord channel config ---
  if (!config.channels) config.channels = {};
  if (!config.channels.discord) config.channels.discord = {};
  config.channels.discord.enabled = true;
  if (discordToken) config.channels.discord.token = discordToken;
  config.channels.discord.groupPolicy = 'allowlist';
  config.channels.discord.replyToMode = 'first';
  if (!config.channels.discord.threadBindings) config.channels.discord.threadBindings = {};
  config.channels.discord.threadBindings.enabled = true;
  config.channels.discord.threadBindings.spawnSubagentSessions = true;

  // --- Session config ---
  if (!config.session) config.session = {};
  if (!config.session.threadBindings) config.session.threadBindings = {};
  config.session.threadBindings.enabled = true;
  config.session.threadBindings.idleHours = 24;
  config.session.threadBindings.maxAgeHours = 0;

  // --- Remove tools.profile (blocks non-coding agents like Sancho) ---
  if (config.tools && config.tools.profile) {
    delete config.tools.profile;
    if (Object.keys(config.tools).length === 0) delete config.tools;
    console.log('[config] Removed tools.profile (not compatible with marketing agents)');
  }

  // --- Hooks ---
  if (!config.hooks) config.hooks = {};
  if (!config.hooks.internal) config.hooks.internal = {};
  config.hooks.internal.enabled = true;
  if (!config.hooks.internal.entries) config.hooks.internal.entries = {};
  config.hooks.internal.entries['session-memory'] = { enabled: true };
  config.hooks.internal.entries['boot-md'] = { enabled: true };

  // --- Memory ---
  if (!config.memory) config.memory = {};
  config.memory.backend = 'builtin';

  // --- MC Chat plugin (Mission Control webchat → Sancho) ---
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.load) config.plugins.load = {};
  if (!config.plugins.load.paths) config.plugins.load.paths = [];
  const mcChatPluginPath = path.join(OPENCLAW_ROOT, 'plugins', 'mc-chat');
  if (fs.existsSync(mcChatPluginPath) && !config.plugins.load.paths.includes(mcChatPluginPath)) {
    config.plugins.load.paths.push(mcChatPluginPath);
  }
  if (!config.plugins.entries) config.plugins.entries = {};
  if (!config.plugins.entries['mc-chat']) {
    config.plugins.entries['mc-chat'] = { enabled: true, config: {} };
  }
  if (!config.channels['mc-chat']) {
    config.channels['mc-chat'] = { enabled: true, mcServerUrl: 'http://localhost:18790' };
  }
  config.channels['mc-chat'].enabled = true;
  if (!config.channels['mc-chat'].mcServerUrl) {
    config.channels['mc-chat'].mcServerUrl = 'http://localhost:18790';
  }
  if (mcChatSecret) {
    config.channels['mc-chat'].sharedSecret = mcChatSecret;
  } else if (config.channels['mc-chat'].sharedSecret) {
    delete config.channels['mc-chat'].sharedSecret;
  }
  // Binding: mc-chat → sancho (if not already present)
  if (!config.bindings) config.bindings = [];
  const hasMcBinding = config.bindings.some(b => b.match && b.match.channel === 'mc-chat');
  if (!hasMcBinding) {
    config.bindings.push({ agentId: 'sancho', match: { channel: 'mc-chat' } });
    console.log('[config] MC Chat binding: mc-chat → sancho');
  }

  // --- Auto-detect Discord guilds and create bindings ---
  if (discordToken) {
    try {
      const guilds = await fetchGuilds(discordToken);

      if (Array.isArray(guilds) && guilds.length > 0) {
        if (!config.bindings) config.bindings = [];
        if (!config.channels.discord.guilds) config.channels.discord.guilds = {};

        for (const guild of guilds) {
          // Skip Cervantes guild — managed by Claude Code, not OpenClaw
          if (cervantesGuildId && guild.id === cervantesGuildId) {
            console.log(`[config] Skipping Cervantes guild: ${guild.name} (${guild.id})`);
            continue;
          }

          // Binding: client guilds → sancho
          const existingBinding = config.bindings.find(
            b => b.match && b.match.guildId === guild.id
          );
          if (!existingBinding) {
            config.bindings.push({
              agentId: 'sancho',
              match: { channel: 'discord', guildId: guild.id }
            });
            console.log(`[config] Guild binding: ${guild.name} → sancho`);
          }

          // requireMention: false (bot responds without @mention)
          if (!config.channels.discord.guilds[guild.id]) {
            config.channels.discord.guilds[guild.id] = {};
          }
          config.channels.discord.guilds[guild.id].requireMention = false;
        }
        console.log(`[config] ${guilds.length} guild(s) configured`);
      }
    } catch (e) {
      console.log(`[config] WARNING: Could not auto-detect guilds: ${e.message}`);
      console.log('[config] Bot will start but may not respond to messages.');
    }
  } else {
    console.log('[config] WARNING: DISCORD_BOT_TOKEN not set. No Discord bindings created.');
  }

  // --- Write config ---
  fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(config, null, 2) + '\n');
  console.log(`[config] Written to ${OPENCLAW_JSON}`);
}

function fetchGuilds(token) {
  return new Promise((resolve, reject) => {
    https.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: 'Bot ' + token }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Discord API HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

main().catch(e => {
  console.error('[config] Fatal error:', e.message);
  process.exit(1);
});
