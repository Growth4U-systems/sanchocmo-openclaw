# T-010 — Mission Control → Next.js

> PRD actualizado 2026-03-02. Starter kit: michaelshimeles/nextjs-starter-kit.

## Decisiones clave

1. **Polar.sh se mantiene** — no funcional ahora, pero preparado para cuando los clientes paguen via MC
2. **PostHog se mantiene** — analytics de uso de MC por clientes (qué ven, cuánto tiempo, etc.)
3. **Auth es P0** — Google OAuth. Cada cliente solo ve su marca. Admin (Growth4U) ve todo.
4. **Supabase reemplaza Neon** — ya tenemos las tablas (clients, pillars, meetings, intelligence_log, etc.)
5. **Chatbot OpenAI se elimina** — Sancho es el chatbot vía Discord
6. **R2 uploads se elimina** — no necesitamos file uploads en MC

## Arquitectura de Auth y Roles

```
┌─────────────────────────────────────────────┐
│                   Auth Flow                  │
├─────────────────────────────────────────────┤
│ Google OAuth → Better Auth → Session DB     │
│                                              │
│ Roles:                                       │
│   admin  → @growth4u.io emails              │
│           → Ve TODO: todos los clientes,    │
│             tasks, agents, skills, sistema   │
│                                              │
│   client → email del cliente                │
│           → Ve SOLO su marca:               │
│             Foundation, docs, campaigns      │
│             NO ve: tasks internas, agents,   │
│             skills, otros clientes           │
├─────────────────────────────────────────────┤
│ Tabla: users                                 │
│   id, email, name, role (admin|client),     │
│   client_id (FK → clients, null for admin)  │
│                                              │
│ Middleware:                                   │
│   /dashboard/* → requires auth              │
│   /dashboard/admin/* → requires role=admin  │
│   /dashboard/[slug]/* → requires client_id  │
│                 OR role=admin                │
└─────────────────────────────────────────────┘
```

## Páginas del MC actual → Rutas Next.js

| MC Estático (page-id) | Next.js Route | Quién ve |
|------------------------|---------------|----------|
| page-dashboard | `/dashboard` | Admin: overview global. Client: overview de su marca |
| page-foundation | `/dashboard/[slug]/foundation` | Admin + Client (solo su slug) |
| page-tasks | `/dashboard/admin/tasks` | Solo admin |
| page-skills | `/dashboard/admin/skills` | Solo admin |
| page-agents | `/dashboard/admin/agents` | Solo admin |
| page-data | `/dashboard/[slug]/intelligence` | Admin + Client |
| page-campaigns | `/dashboard/[slug]/campaigns` | Admin + Client |
| page-changelog | `/dashboard/admin/changelog` | Solo admin |
| page-guide | `/dashboard/[slug]/docs/[...path]` | Admin + Client |
| — (nuevo) | `/dashboard/admin/clients` | Solo admin — gestión de clientes |
| — (nuevo) | `/dashboard/settings` | Todos — perfil, preferencias |
| — (nuevo) | `/pricing` | Público — futuro pricing page (Polar) |

## Data Sources

| Dato | Fuente actual | Fuente Next.js |
|------|---------------|----------------|
| Foundation state | `foundation-state.json` (archivo) | Supabase `pillars` table |
| Client list | `clients.json` (archivo) | Supabase `clients` table |
| Tasks | `TASKS.md` (markdown) | Parse markdown → render (no DB) |
| Skills | Scan `skills/*/SKILL.md` | Supabase `skills` table o scan estático |
| Docs/brand files | `brand/{slug}/**/*.md` | File system read via API route |
| Intelligence log | `intelligence-log.json` | Supabase `intelligence_log` table |
| Campaigns | `campaigns/` folder | Supabase `campaigns` table |
| Changelog | `CHANGELOG.md` | Parse markdown → render |
| Agents status | `openclaw status` CLI | API route que ejecuta `openclaw status --json` |
| Costs | `costs-global.json` | Supabase `costs` table |

## Stack

```
Framework:    Next.js 15 (App Router) + TypeScript + Turbopack
Styling:      Tailwind CSS v4 + shadcn/ui + Radix UI
Database:     Supabase PostgreSQL + Drizzle ORM
Auth:         Better Auth v1.2.8 + Google OAuth
Payments:     Polar.sh (desactivado, preparado)
Analytics:    PostHog (desactivado, preparado)
Doc viewer:   react-markdown + rehype-highlight
Doc editor:   MDXEditor o Toast UI React
Deploy:       Vercel (público) + Tailscale Funnel (interno)
```

## Fases de Implementación

### Fase 1: Bootstrap + Auth (3-4h) — P0

1. Clonar starter kit en `~/.openclaw/workspace-cervantes/mission-control-next/`
2. Limpiar:
   - Eliminar `app/dashboard/chat/` (chatbot OpenAI)
   - Eliminar `app/dashboard/upload/` (R2 uploads)
   - Eliminar `components/homepage/` (landing genérica)
   - Mantener Polar (desactivar en UI, mantener código)
   - Mantener PostHog (desactivar tracking, mantener setup)
3. Conectar Drizzle a Supabase (cambiar DATABASE_URL)
4. Schema DB — extender con tablas MC:
   ```sql
   -- Ya existen en Supabase:
   -- clients, pillars, meetings, intelligence_log, integrations, costs, content, campaigns
   
   -- Añadir:
   ALTER TABLE "user" ADD COLUMN role TEXT DEFAULT 'client';
   ALTER TABLE "user" ADD COLUMN client_id TEXT REFERENCES clients(id);
   ```
5. Auth config:
   - Google OAuth (alfonso@growth4u.io = admin)
   - Middleware: role-based routing
   - Regla: emails @growth4u.io → role=admin
   - Otros emails → role=client, asociar a client_id
6. Test: login → redirect por rol → dashboard correcto

### Fase 2: Dashboard Core (3-4h) — P0

1. **Sidebar** — adaptar del starter:
   - Admin: todos los clientes + secciones admin
   - Client: solo su marca + secciones visibles
   - Client selector dropdown (admin only)
2. **Dashboard overview**:
   - Admin: stats globales (clientes, pilares, tareas, costes)
   - Client: stats de su marca (pilares, docs, campaigns)
3. **Foundation page** (`/dashboard/[slug]/foundation`):
   - 15 pilares con progreso visual (5 bloques del DAG)
   - Status icons (✅ ⚠️ ⬜ ➖)
   - Click en pilar → abre doc viewer
   - Datos desde Supabase `pillars` table
4. **Stats cards** — pilares completados, skills activas, tareas pendientes

### Fase 3: Doc Viewer + Editor (2-3h) — P1

1. **API route** `/api/docs/[...path]` → lee archivo markdown del filesystem
2. **Doc viewer** con `react-markdown` + syntax highlight
3. **File tree navigation** — `brand/{slug}/` con carpetas expandibles
4. **WYSIWYG editor** — solo admin, edit inline + save
5. **Links directos** a cada pilar/documento (shareable)

### Fase 4: Vistas secundarias (2-3h) — P1

1. **Tasks** (`/dashboard/admin/tasks`) — parse TASKS.md, filtros por estado/prioridad/categoría
2. **Intelligence log** (`/dashboard/[slug]/intelligence`) — tabla con filtros
3. **Skills catalog** (`/dashboard/admin/skills`) — grid, metadata, versión
4. **Agents status** (`/dashboard/admin/agents`) — cards con estado via API
5. **Changelog** (`/dashboard/admin/changelog`) — render CHANGELOG.md
6. **Client management** (`/dashboard/admin/clients`) — CRUD clientes

### Fase 5: Polish + Deploy (2h) — P2

1. Responsive mobile
2. Polar pricing page (desactivada pero lista)
3. PostHog eventos básicos (page views, doc views)
4. Tailscale Funnel config para MC (reemplaza mc-server.js)
5. Vercel deploy + custom domain (futuro)
6. Migrar datos actuales: foundation-state.json → Supabase pillars

## Lo que se depreca

| Actual | Reemplazado por |
|--------|-----------------|
| `mission-control.html` (2471 líneas) | Next.js app |
| `mc-server.js` (394 líneas) | Next.js API routes + Vercel |
| `mc-data.js` (generado) | Queries directas a Supabase |
| `clients.js` (generado) | Supabase `clients` table |
| `regenerate.py` | Eliminado — datos en tiempo real desde DB |
| LaunchAgent `com.sancho.mc-server` | Eliminado |

## Estimación

| Fase | Horas | Prioridad |
|------|-------|-----------|
| 1. Bootstrap + Auth | 3-4h | P0 |
| 2. Dashboard Core | 3-4h | P0 |
| 3. Doc Viewer + Editor | 2-3h | P1 |
| 4. Vistas secundarias | 2-3h | P1 |
| 5. Polish + Deploy | 2h | P2 |
| **Total** | **12-16h** | |
