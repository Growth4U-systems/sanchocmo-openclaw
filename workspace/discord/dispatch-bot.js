// dispatch-bot.js
// Bot de auto-dispatch para campañas SanchoCMO
// NO es un agente AI — es pura lógica de routing
//
// Cuando alguien reacciona con ✅ a una campaña propuesta en #campaigns,
// este bot crea threads en los canales destino con el brief correspondiente.
// Los agentes OpenClaw de esos canales responden automáticamente.

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

// ─────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CAMPAIGNS_CHANNEL = process.env.CAMPAIGNS_CHANNEL || 'campaigns';
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN) {
  console.error('[ERROR] Falta DISCORD_BOT_TOKEN en .env');
  process.exit(1);
}

if (!GUILD_ID) {
  console.error('[ERROR] Falta GUILD_ID en .env');
  process.exit(1);
}

// ─────────────────────────────────────────────
// Inicialización del cliente Discord
// ─────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
  ],
});

// ─────────────────────────────────────────────
// Parser del formato de campaña
// ─────────────────────────────────────────────

/**
 * Extrae el nombre de la campaña del mensaje.
 * Busca el patrón: [CAMPAÑA PROPUESTA] "Nombre"
 * @param {string} content - Contenido del mensaje
 * @returns {string|null} - Nombre de la campaña o null
 */
function parseCampaignName(content) {
  const match = content.match(/\[CAMPAÑA PROPUESTA\]\s*"([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Extrae los canales destino y sus briefs de la sección CANALES A ACTIVAR.
 * Cada línea sigue el formato: → #canal (Agente): Brief de texto
 * @param {string} content - Contenido del mensaje
 * @returns {Array<{channel: string, agent: string, brief: string}>}
 */
function parseChannelBriefs(content) {
  const results = [];

  // Buscar la sección "CANALES A ACTIVAR"
  const sectionMatch = content.match(/CANALES A ACTIVAR:\s*\n([\s\S]*?)(?:\n\n|$)/i);
  if (!sectionMatch) {
    return results;
  }

  const section = sectionMatch[1];

  // Parsear cada línea con formato: → #canal (Agente): Brief
  const lineRegex = /→\s*#([\w-]+)\s*\(([^)]+)\):\s*(.+)/g;
  let lineMatch;

  while ((lineMatch = lineRegex.exec(section)) !== null) {
    results.push({
      channel: lineMatch[1].trim(),
      agent: lineMatch[2].trim(),
      brief: lineMatch[3].trim(),
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// Dispatch: crear threads en canales destino
// ─────────────────────────────────────────────

/**
 * Crea un thread en el canal destino con el brief de la campaña.
 * @param {import('discord.js').Guild} guild - El servidor Discord
 * @param {string} campaignName - Nombre de la campaña
 * @param {{channel: string, agent: string, brief: string}} target - Canal destino con brief
 * @returns {Promise<boolean>} - true si el thread se creó correctamente
 */
async function dispatchToChannel(guild, campaignName, target) {
  // Buscar el canal por nombre
  const channel = guild.channels.cache.find(
    (ch) => ch.name === target.channel && ch.type === ChannelType.GuildText
  );

  if (!channel) {
    console.warn(`[WARN] Canal #${target.channel} no encontrado en el servidor`);
    return false;
  }

  // Verificar permisos para crear threads
  const botMember = guild.members.me;
  if (!channel.permissionsFor(botMember).has('CreatePublicThreads')) {
    console.warn(`[WARN] Sin permisos para crear threads en #${target.channel}`);
    return false;
  }

  try {
    // Crear el thread con el nombre de la campaña
    const threadName = `${campaignName} — ${target.agent}`;
    // Discord limita nombres de thread a 100 caracteres
    const truncatedName = threadName.length > 100
      ? threadName.substring(0, 97) + '...'
      : threadName;

    const thread = await channel.threads.create({
      name: truncatedName,
      autoArchiveDuration: 1440, // 24 horas de inactividad antes de archivar
      reason: `Auto-dispatch de campaña: ${campaignName}`,
    });

    // Publicar el brief como primer mensaje del thread
    const briefMessage = [
      `**Campaña:** ${campaignName}`,
      `**Agente asignado:** ${target.agent}`,
      ``,
      `**Brief:**`,
      target.brief,
    ].join('\n');

    await thread.send(briefMessage);

    console.log(`[OK] Thread creado en #${target.channel}: "${truncatedName}"`);
    return true;

  } catch (error) {
    console.error(`[ERROR] No se pudo crear thread en #${target.channel}:`, error.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────

client.once('ready', () => {
  console.log(`[BOT] Dispatch bot conectado como ${client.user.tag}`);
  console.log(`[BOT] Escuchando reacciones ✅ en #${CAMPAIGNS_CHANNEL}`);
  console.log(`[BOT] Servidor: ${GUILD_ID}`);
});

client.on('messageReactionAdd', async (reaction, user) => {
  // Ignorar reacciones del propio bot
  if (user.bot) return;

  // Si la reacción es parcial (mensaje no cacheado), intentar fetch
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('[ERROR] No se pudo obtener la reacción parcial:', error.message);
      return;
    }
  }

  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (error) {
      console.error('[ERROR] No se pudo obtener el mensaje parcial:', error.message);
      return;
    }
  }

  // Solo procesar reacciones ✅ (unicode: ✅, nombre emoji: white_check_mark)
  const isCheckmark = reaction.emoji.name === '✅' || reaction.emoji.name === 'white_check_mark';
  if (!isCheckmark) return;

  // Solo procesar mensajes del canal #campaigns
  const message = reaction.message;
  if (message.channel.name !== CAMPAIGNS_CHANNEL) return;

  console.log(`\n[DISPATCH] Reacción ✅ detectada de ${user.tag} en #${CAMPAIGNS_CHANNEL}`);

  // Parsear el contenido de la campaña
  const content = message.content;
  const campaignName = parseCampaignName(content);

  if (!campaignName) {
    console.warn('[WARN] No se encontró nombre de campaña en el mensaje. Ignorando.');
    return;
  }

  console.log(`[DISPATCH] Campaña detectada: "${campaignName}"`);

  const targets = parseChannelBriefs(content);

  if (targets.length === 0) {
    console.warn('[WARN] No se encontraron canales destino en CANALES A ACTIVAR. Ignorando.');
    return;
  }

  console.log(`[DISPATCH] ${targets.length} canal(es) destino encontrado(s)`);

  // Obtener el servidor (guild)
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error(`[ERROR] No se encontró el servidor con ID ${GUILD_ID}`);
    return;
  }

  // Dispatch a cada canal destino
  let dispatched = 0;
  let failed = 0;

  for (const target of targets) {
    const success = await dispatchToChannel(guild, campaignName, target);
    if (success) {
      dispatched++;
    } else {
      failed++;
    }
  }

  // Resumen del dispatch
  console.log(`[DISPATCH] Completado: ${dispatched} thread(s) creado(s), ${failed} fallido(s)`);

  // Confirmar en el canal de campañas con reacción
  try {
    if (dispatched > 0) {
      await message.react('🚀');
    }
    if (failed > 0) {
      await message.react('⚠️');
    }
  } catch (error) {
    console.warn('[WARN] No se pudo añadir reacción de confirmación:', error.message);
  }
});

// ─────────────────────────────────────────────
// Manejo de errores globales
// ─────────────────────────────────────────────

client.on('error', (error) => {
  console.error('[ERROR] Error del cliente Discord:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('[ERROR] Promesa no manejada:', error);
});

// ─────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────

console.log('[BOT] Iniciando dispatch bot de SanchoCMO...');
client.login(BOT_TOKEN);
