// setup-channels.js — Crea categorías y canales del servidor SanchoCMO
require('dotenv').config({ path: '../.env' });
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const STRUCTURE = [
  {
    category: '📁 ESTRATEGIA',
    channels: ['el-toboso', 'campaigns', 'intelligence'],
  },
  {
    category: '📁 OUTREACH',
    channels: ['partners', 'prospecting'],
  },
  {
    category: '📁 CONTENT',
    channels: ['organic-content', 'social', 'paid-ads', 'web'],
  },
  {
    category: '📁 SOPORTE',
    channels: ['sales', 'design', 'research'],
  },
  {
    category: '📁 SISTEMA',
    channels: ['learning', 'admin'],
  },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Conectado como ${client.user.tag}`);
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error('Servidor no encontrado');
    process.exit(1);
  }

  for (const group of STRUCTURE) {
    // Crear categoría
    const category = await guild.channels.create({
      name: group.category,
      type: ChannelType.GuildCategory,
    });
    console.log(`✅ Categoría: ${group.category}`);

    // Crear canales dentro
    for (const ch of group.channels) {
      await guild.channels.create({
        name: ch,
        type: ChannelType.GuildText,
        parent: category.id,
      });
      console.log(`   #${ch}`);
    }
  }

  console.log('\n🎉 Todos los canales creados. Puedes cerrar esto.');
  process.exit(0);
});

client.login(BOT_TOKEN);
