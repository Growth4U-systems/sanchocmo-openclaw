#!/usr/bin/env node
// Dispatch Bot — SanchoCMO
// Escucha reacciones ✅ en #campaigns y crea threads en canales de agentes.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
} = require('discord.js');

// --- Config ---
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CAMPAIGNS_CHANNEL_ID = process.env.CAMPAIGNS_CHANNEL_ID;
const DISPATCH_MAP_PATH = process.env.DISPATCH_MAP_PATH || '../../dispatch-map.json';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

if (!TOKEN) {
  console.error('[FATAL] DISCORD_TOKEN not set. Copy .env.template → .env and fill it in.');
  process.exit(1);
}

// --- Logger ---
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
function log(level, ...args) {
  if (LEVELS[level] >= LEVELS[LOG_LEVEL]) {
    const ts = new Date().toISOString();
    console[level === 'error' ? 'error' : 'log'](`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}

// --- Load dispatch map ---
function loadDispatchMap() {
  const mapPath = path.resolve(__dirname, DISPATCH_MAP_PATH);
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    log('error', 'Failed to load dispatch-map.json:', err.message);
    return null;
  }
}

// --- Parse brief from message ---
// Expected format in #campaigns (Sancho posts these):
//
//   **Tipo**: seo-content
//   **Agente**: El Redactor
//   **Deadline**: 2026-03-01
//
//   ## Brief
//   <content here>
//
// Falls back to best-effort extraction.
function parseBrief(content) {
  const lines = content.split('\n');
  let tipo = null;
  let agente = null;
  let deadline = null;
  let briefStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const tipoMatch = line.match(/^\*?\*?Tipo\*?\*?\s*:\s*(.+)/i);
    if (tipoMatch) tipo = tipoMatch[1].trim();

    const agenteMatch = line.match(/^\*?\*?Agente\*?\*?\s*:\s*(.+)/i);
    if (agenteMatch) agente = agenteMatch[1].trim();

    const deadlineMatch = line.match(/^\*?\*?Deadline\*?\*?\s*:\s*(.+)/i);
    if (deadlineMatch) deadline = deadlineMatch[1].trim();

    if (/^##?\s*Brief/i.test(line)) {
      briefStart = i + 1;
    }
  }

  const briefBody = briefStart >= 0
    ? lines.slice(briefStart).join('\n').trim()
    : content; // fallback: use entire message

  return { tipo, agente, deadline, briefBody };
}

// --- Resolve target channel from dispatch map ---
function resolveTargetChannel(tipo, dispatchMap) {
  if (!dispatchMap || !tipo) return null;

  // Search personas for which one handles this task type
  for (const [key, persona] of Object.entries(dispatchMap.personas || {})) {
    if (persona.dispatch_for && persona.dispatch_for.includes(tipo)) {
      // Map persona key to a discord channel.
      // Heuristic: persona key → channel name mapping
      const PERSONA_CHANNEL_MAP = {
        explorador: 'prospecting',
        redactor: 'content',
        comunicador: 'content',
        creativo: 'creative',
        amplificador: 'paid-ads',
        conector: 'partners',
        comercial: 'prospecting',
        arquitecto: 'web',
        investigador: 'research',
      };
      const channelKey = PERSONA_CHANNEL_MAP[key];
      const channelId = dispatchMap.discord_channels?.[channelKey];
      return { channelId, personaName: persona.name, channelKey };
    }
  }

  return null;
}

// --- Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.once('ready', () => {
  log('info', `Dispatch bot online as ${client.user.tag}`);
  log('info', `Watching channel: ${CAMPAIGNS_CHANNEL_ID}`);
});

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    // Ignore bot reactions
    if (user.bot) return;

    // Only process ✅ reactions
    if (reaction.emoji.name !== '✅') return;

    // Handle partials (uncached messages)
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        log('error', 'Failed to fetch partial reaction:', err.message);
        return;
      }
    }
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch (err) {
        log('error', 'Failed to fetch partial message:', err.message);
        return;
      }
    }

    const message = reaction.message;

    // Only process reactions in #campaigns
    if (message.channelId !== CAMPAIGNS_CHANNEL_ID) return;

    log('info', `✅ reaction detected on message ${message.id} by ${user.tag}`);

    // Parse the brief
    const { tipo, agente, deadline, briefBody } = parseBrief(message.content);

    if (!tipo) {
      log('warn', `Could not parse task type from message ${message.id}. Skipping.`);
      await message.reply('⚠️ Dispatch failed: no se pudo extraer el **Tipo** de tarea del brief.');
      return;
    }

    // Load dispatch map fresh each time (allows hot-reload of config)
    const dispatchMap = loadDispatchMap();
    const target = resolveTargetChannel(tipo, dispatchMap);

    if (!target || !target.channelId) {
      log('warn', `No channel mapping for tipo="${tipo}".`);
      await message.reply(`⚠️ Dispatch failed: no hay canal mapeado para tipo **${tipo}**.`);
      return;
    }

    // Get target channel
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      log('error', 'Guild not found:', GUILD_ID);
      return;
    }

    const targetChannel = guild.channels.cache.get(target.channelId);
    if (!targetChannel) {
      log('error', `Target channel ${target.channelId} not found in guild.`);
      await message.reply(`⚠️ Dispatch failed: canal #${target.channelKey} no encontrado.`);
      return;
    }

    // Create thread in target channel
    const threadName = `[${tipo}] ${deadline ? `(${deadline})` : ''} ${briefBody.slice(0, 60).replace(/\n/g, ' ')}`.slice(0, 100);

    const thread = await targetChannel.threads.create({
      name: threadName,
      type: ChannelType.PublicThread,
      reason: `Dispatch from #campaigns (msg: ${message.id})`,
    });

    // Post brief in thread
    const threadContent = [
      `# 📋 Brief dispatched`,
      ``,
      `**Tipo**: ${tipo}`,
      agente ? `**Agente**: ${agente}` : null,
      deadline ? `**Deadline**: ${deadline}` : null,
      `**Origen**: [Brief en #campaigns](${message.url})`,
      ``,
      `---`,
      ``,
      briefBody,
    ]
      .filter(Boolean)
      .join('\n');

    // Discord message limit is 2000 chars; split if needed
    if (threadContent.length <= 2000) {
      await thread.send(threadContent);
    } else {
      const chunks = threadContent.match(/[\s\S]{1,1990}/g) || [];
      for (const chunk of chunks) {
        await thread.send(chunk);
      }
    }

    // Confirm in #campaigns
    await message.reply(`✅ Dispatched → <#${target.channelId}> — [${threadName}](${thread.url})`);

    log('info', `Dispatched tipo="${tipo}" → #${target.channelKey} thread="${threadName}"`);
  } catch (err) {
    log('error', 'Dispatch error:', err);
  }
});

// --- Start ---
client.login(TOKEN).catch((err) => {
  log('error', 'Login failed:', err.message);
  process.exit(1);
});
