/**
 * Client registry for Mission Control.
 * Add new clients here. The dashboard reads this to populate the selector
 * and connect to the right Supabase per client.
 *
 * To add a new client:
 * 1. Copy a client block
 * 2. Fill in the details
 * 3. Reload Mission Control
 */
const CLIENTS = {
  "hospital-capilar": {
    name: "Hospital Capilar",
    emoji: "🏥",
    url: "https://hospitalcapilar.com",
    discord_guild: "1475635138108063746",
    supabase: {
      url: "https://psapmujzxhaxraphddlv.supabase.co",
      anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI",
    },

    phase: 0,
  },

  "growth4u": {
    name: "Growth4U",
    emoji: "🏢",
    url: "",
    discord_guild: "1477741643762241548",
    supabase: {
      url: "https://psapmujzxhaxraphddlv.supabase.co",
      anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI",
    },

    phase: 0,
  },

  "paymatico": {
    name: "Paymatico",
    emoji: "💳",
    url: "",
    discord_guild: "1477995837719056458",
    supabase: {
      url: "https://psapmujzxhaxraphddlv.supabase.co",
      anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI",
    },

    phase: 0,
  },

  "sanchocmo": {
    name: "SanchoCMO",
    emoji: "🐴",
    url: "",
    discord_guild: "1477997446885019670",
    supabase: {
      url: "https://psapmujzxhaxraphddlv.supabase.co",
      anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI",
    },

    phase: 0,
  },

  "kleva": {
    name: "KLEVA",
    emoji: "🏢",
    url: "",
    discord_guild: "1481229949238120519",
    supabase: {
      url: "https://psapmujzxhaxraphddlv.supabase.co",
      anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI",
    },

    phase: 0,
  },

  "masabo": {
    name: "Masabo",
    emoji: "🏢",
    url: "",
    discord_guild: "1483424292824940659",
    supabase: {
      url: "https://psapmujzxhaxraphddlv.supabase.co",
      anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI",
    },

    phase: 0,
  },

  "dealcar": {
    name: "Dealcar",
    emoji: "🏢",
    url: "",
    discord_guild: "1483765888761991178",
    supabase: {
      url: "https://psapmujzxhaxraphddlv.supabase.co",
      anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI",
    },

    phase: 0,
  },

  // === TEMPLATE: Copy this block for new clients ===
  // "client-slug": {
  //   name: "Client Name",
  //   emoji: "🏢",
  //   url: "https://client.com",
  //   discord_guild: "GUILD_ID",
  //   supabase: {
  //     url: "https://PROJECT_REF.supabase.co",
  //     anon_key: "ANON_KEY_HERE",
  //   },
  //   workspace: "~/Projects/sanchocmo-client-slug",
  //   phase: 0,
  // },
};
