#!/usr/bin/env node
/**
 * sync-recurring-tasks-cron.js
 * 
 * Reads recurring-tasks.json for a client and outputs the cron job specs
 * that Sancho should create/update. Used by the idea-generation skill.
 * 
 * Usage: node sync-recurring-tasks-cron.js <slug>
 * Output: JSON array of cron job specs ready for OpenClaw cron tool
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const slug = process.argv[2];

if (!slug) {
  console.error('Usage: node sync-recurring-tasks-cron.js <slug>');
  process.exit(1);
}

// Load clients.json to get client name
let clientName = slug;
try {
  const clients = JSON.parse(fs.readFileSync(path.join(BASE, 'clients.json'), 'utf-8'));
  const client = (clients.clients || []).find(c => c.slug === slug);
  if (client) clientName = client.name || slug;
} catch {}

// Load recurring tasks
const tasksFile = path.join(BASE, 'brand', slug, 'idea-generation', 'recurring-tasks.json');
let tasks = [];
try {
  tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
} catch {
  console.log('[]');
  process.exit(0);
}

// Schedule text → cron expression mapping
function scheduleToCron(schedule) {
  if (!schedule) return '0 9 * * 1'; // default: Monday 9am
  const s = schedule.toLowerCase().trim();
  
  // Already a cron expression
  if (/^\d/.test(s) || s.startsWith('*')) return s;
  
  // Natural language
  if (s.includes('diario') || s.includes('daily') || s.includes('every day') || s.includes('cada día')) return '0 9 * * *';
  if (s.includes('cada 2 día') || s.includes('every 2 day')) return '0 9 */2 * *';
  if (s.includes('cada 3 día') || s.includes('every 3 day')) return '0 9 */3 * *';
  if (s.includes('semanal') || s.includes('weekly') || s.includes('every 7 day') || s.includes('cada 7 día') || s.includes('cada semana')) return '0 9 * * 1';
  if (s.includes('cada 14 día') || s.includes('every 14 day') || s.includes('quincenal') || s.includes('bi-weekly')) return '0 9 1,15 * *';
  if (s.includes('mensual') || s.includes('monthly') || s.includes('cada 30 día') || s.includes('every 30 day')) return '0 9 1 * *';
  
  // "every X days" pattern
  const match = s.match(/(?:every|cada)\s+(\d+)\s+d/i);
  if (match) {
    const days = parseInt(match[1]);
    if (days <= 1) return '0 9 * * *';
    if (days <= 3) return `0 9 */${days} * *`;
    if (days <= 7) return '0 9 * * 1';
    if (days <= 14) return '0 9 1,15 * *';
    return '0 9 1 * *';
  }
  
  return '0 9 * * 1'; // fallback
}

// Generate cron job specs
const cronJobs = tasks
  .filter(t => t.status === 'active')
  .map(t => ({
    taskId: t.id,
    name: `Idea Gen — ${clientName} — ${t.name}`,
    schedule: {
      kind: 'cron',
      expr: scheduleToCron(t.schedule),
      tz: 'Europe/Madrid'
    },
    sessionTarget: 'isolated',
    payload: {
      kind: 'agentTurn',
      message: `Ejecuta idea-generation para ${slug}. Tarea específica: ${t.id}. Lee brand/${slug}/idea-generation/recurring-tasks.json y ejecuta solo la tarea con id=${t.id} (${t.name}). Fuentes: ${(t.config?.sources || []).join(', ') || 'todas'}. Publica resultados en Discord #intelligence del cliente. Aplica _system/governance/client-context-isolation.md.`
    },
    delivery: { mode: 'none' }
  }));

console.log(JSON.stringify(cronJobs, null, 2));
