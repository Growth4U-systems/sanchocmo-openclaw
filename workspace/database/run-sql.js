const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Use pooler (IPv4 reachable) with session mode (port 5432)
const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.psapmujzxhaxraphddlv',
  password: 'FTA.ucm3evp9mrp.tgp',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'init-db.sql'), 'utf8');
  try {
    await client.connect();
    console.log('✅ Conectado a Supabase PostgreSQL');
    await client.query(sql);
    console.log('✅ Schema ejecutado — 9 tablas creadas');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
