# Setup Guide — SanchoCMO en OpenClaw (Discord)

> De ZIP a CMO funcional con 11 agentes Discord + Supabase en ~30 minutos

**Version:** 2.0 (Feb 23, 2026)

---

## Pre-requisitos

- **OpenClaw** instalado y configurado
- **Node.js** >= 18
- **Python** >= 3.10
- **Cuenta Discord** con permisos para crear servidor y bot
- **Cuenta Supabase** (free tier: 2 proyectos gratis)
- **Cuentas opcionales**: Notion, Google Workspace, OpenRouter (para imágenes)

---

## Paso 1: Extraer y verificar estructura

```bash
mkdir -p ~/PROJECTS/sanchocmo-[cliente]
cd ~/PROJECTS/sanchocmo-[cliente]
unzip /path/to/sanchocmo-openclaw.zip -d .
```

Estructura esperada:
```
sanchocmo-[cliente]/
├── CLAUDE.md                ← System prompt (identidad SanchoCMO)
├── SETUP.md                 ← Este archivo
├── BRAIN.md                 ← Knowledge base (1,385 líneas)
├── ARCHITECTURE-MAP.md      ← Mapa completo del sistema
├── README.md                ← Quick reference
├── MANIFEST.md              ← Inventario de archivos
├── openclaw.config.json     ← Configuración OpenClaw (agentes + bindings)
├── env.example              ← Template de variables de entorno
├── .mcp.json                ← Template MCP servers
│
├── agents/                  ← 11 SOUL.md (personalidad de cada agente)
│   ├── sancho.soul.md
│   ├── el-oraculo.soul.md
│   ├── explorador.soul.md
│   ├── redactor.soul.md
│   ├── comunicador.soul.md
│   ├── creativo.soul.md
│   ├── amplificador.soul.md
│   ├── conector.soul.md
│   ├── comercial.soul.md
│   ├── arquitecto.soul.md
│   └── investigador.soul.md
│
├── discord/                 ← Bot de auto-dispatch
│   ├── dispatch-bot.js
│   ├── package.json
│   └── env.example
│
├── database/                ← Schema Supabase
│   └── init-db.sql
│
├── _system/                 ← Protocolos compartidos
│   ├── brand-memory.md
│   ├── output-format.md
│   ├── skill-communication-protocol.md
│   ├── skill-routing.md
│   └── schemas/             ← 7 JSON contracts
│
├── skills/                  ← 38 skills
├── brand/                   ← Context Lake (se llena por cliente)
└── campaigns/               ← Campañas activas
```

---

## Paso 2: Crear servidor Discord

### 2.1 Crear servidor

1. Discord → "+" → Crear servidor → "Create My Own" → nombre: `SanchoCMO — [Cliente]`

### 2.2 Crear categorías y canales

Crear 5 categorías con 14 canales:

```
📁 ESTRATEGIA
  #el-toboso         (text)
  #campaigns         (text)
  #intelligence      (text)

📁 OUTREACH
  #partners          (text)
  #prospecting       (text)

📁 CONTENT
  #organic-content   (text)
  #social            (text)
  #paid-ads          (text)
  #web               (text)

📁 SOPORTE
  #sales             (text)
  #design            (text)
  #research          (text)

📁 SISTEMA
  #learning          (text)
  #admin             (text)
```

### 2.3 Crear bot Discord (para auto-dispatch)

1. Ir a [Discord Developer Portal](https://discord.com/developers/applications)
2. "New Application" → nombre: `SanchoCMO Dispatch`
3. Bot → "Add Bot" → copiar token
4. OAuth2 → URL Generator → scopes: `bot` → permissions: `Send Messages`, `Create Public Threads`, `Read Message History`, `Add Reactions`, `View Channels`
5. Usar URL generada para invitar bot al servidor

---

## Paso 3: Crear proyecto Supabase

### 3.1 Crear proyecto

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. "New Project" → nombre: `sanchocmo-[cliente]`
3. Copiar: Project URL + Service Role Key + Anon Key

### 3.2 Ejecutar schema

1. Ir a SQL Editor en Supabase Dashboard
2. Copiar contenido de `database/init-db.sql`
3. Ejecutar

O via CLI:
```bash
# Instalar Supabase CLI
brew install supabase/tap/supabase

# Ejecutar migrations
supabase db push --db-url "postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" < database/init-db.sql
```

### 3.3 Verificar tablas

En Supabase Dashboard → Table Editor, verificar 9 tablas:
- `companies`, `contacts`, `outreach_sequences`
- `campaigns`, `content_ideas`, `editorial_calendar`
- `competitor_moves`, `content_performance`, `insights`

---

## Paso 4: Configurar variables de entorno

```bash
cp env.example .env
```

Editar `.env` con credenciales reales:
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (de Paso 3)
- `DISCORD_BOT_TOKEN` y `GUILD_ID` (de Paso 2)
- `ANTHROPIC_API_KEY` (tu API key de Anthropic)

---

## Paso 5: Instalar skills

```bash
# Skills de proyecto (recomendado para aislamiento por cliente)
mkdir -p .claude/skills
cp -r skills/* .claude/skills/

# Verificar
find .claude/skills -name "SKILL.md" | wc -l
# Debería ser 38
```

---

## Paso 6: Configurar MCP Servers

Editar `.mcp.json` con credenciales. Los servers críticos:

| Server | Obligatorio | Para qué |
|--------|-------------|----------|
| **Supabase** | Sí | Datos operacionales (9 tablas) |
| **Notion** | Recomendado | Workspace integration |
| **Playwright** | Recomendado | Web scraping, Infer-First |
| **Nanobanana** | Opcional | Generación de imágenes (El Creativo) |

La config de Supabase ya está en `openclaw.config.json`. Los demás en `.mcp.json`.

---

## Paso 7: Lanzar dispatch bot

```bash
cd discord/
npm install
node dispatch-bot.js
```

El bot escucha reacciones ✅ en #campaigns y crea threads automáticamente en los canales destino.

Para producción, usar PM2:
```bash
npm install -g pm2
pm2 start dispatch-bot.js --name sanchocmo-dispatch
pm2 save
```

---

## Paso 8: Lanzar OpenClaw

```bash
cd ~/PROJECTS/sanchocmo-[cliente]
openclaw start --config openclaw.config.json
```

### Test rápido

En Discord #el-toboso:
```
@El Oráculo, ¿quién eres?
```

Debería responder identificándose como el guardián de la marca.

### Test Foundation Blitz

En Discord #el-toboso:
```
Nuevo cliente: https://ejemplo.com
```

El Oráculo ejecutará:
1. Infer-First → scrape web
2. Foundation Blitz → company-context + self-intelligence + competitor-intel
3. Coverage Report → muestra qué se infirió

### Test Campaign Dispatch

En Discord #campaigns:
```
@Sancho, propón una campaña para generar 100 leads este mes
```

Sancho propondrá campaña. Reaccionar con ✅ para auto-dispatch a canales.

---

## Paso 9: Verificación completa

### Agentes
- [ ] Sancho responde en #campaigns, #intelligence, #learning, #admin
- [ ] El Oráculo responde en #el-toboso
- [ ] El Explorador responde en #prospecting
- [ ] El Redactor responde en #organic-content
- [ ] El Comunicador responde en #social
- [ ] El Creativo responde en #design
- [ ] El Amplificador responde en #paid-ads
- [ ] El Conector responde en #partners
- [ ] El Comercial responde en #sales
- [ ] El Arquitecto responde en #web
- [ ] El Investigador responde en #research

### Base de datos
- [ ] 9 tablas creadas en Supabase
- [ ] RLS policies activas
- [ ] Supabase MCP conectado

### Auto-dispatch
- [ ] Bot corriendo
- [ ] ✅ en campaña crea threads en canales correctos
- [ ] Agentes responden a threads automáticamente

### Brand Memory
- [ ] `brand/` se llena tras Foundation Blitz
- [ ] Skills leen context según Context Matrix

---

## Estructura Multi-Cliente (Modelo Híbrido)

### Arquitectura: Master + Instancias

Un **master** contiene las skills compartidas, agents y protocolos. Cada **instancia** de cliente tiene su propio brand/, campaigns/, .env y Discord/Supabase.

```
~/PROJECTS/
├── sanchocmo-master/               ← SINGLE SOURCE OF TRUTH
│   ├── skills/                     # 38 skills compartidas
│   ├── agents/                     # 11 SOUL.md
│   ├── _system/                    # Protocolos
│   ├── scripts/                    # Herramientas de gestión
│   │   ├── new-client.sh          # Onboard nuevo cliente (~30 seg)
│   │   ├── sync-skills.sh         # Re-sync tras update al master
│   │   └── status.sh              # Estado de todas las instancias
│   └── ...docs, database, discord
│
├── sanchocmo-monzo/                ← INSTANCIA CLIENTE
│   ├── skills-shared → ../sanchocmo-master/skills  (symlink)
│   ├── agents → ../sanchocmo-master/agents          (symlink)
│   ├── _system → ../sanchocmo-master/_system        (symlink)
│   ├── .claude/skills/             # MERGED: symlinks + custom
│   │   ├── seo-content → ...      # Shared (symlink)
│   │   └── monzo-compliance/      # Custom (real dir)
│   ├── brand/                      # PER-CLIENT
│   ├── campaigns/                  # PER-CLIENT
│   ├── .env                        # PER-CLIENT
│   └── openclaw.config.json        # PER-CLIENT (editable)
│
├── sanchocmo-criptan/              ← OTRA INSTANCIA
│   └── ... (misma estructura)
```

### Tres tipos de skills

| Tipo | Ubicación | Se actualiza con master |
|------|-----------|------------------------|
| **Shared** | Symlink a master | Sí, automáticamente |
| **Custom** | Dir real, solo este cliente | No (solo existe aquí) |
| **Override** | Dir real, mismo nombre que shared | No (prevalece la copia local) |

### Setup rápido de nuevo cliente

```bash
# Desde el master:
./scripts/new-client.sh monzo

# El script crea todo en ~30 segundos:
# - Symlinks a 38 skills compartidas
# - Symlinks a agents, _system, docs
# - Directorios propios: brand/, campaigns/
# - Copias editables: .env, openclaw.config.json
```

### Sync tras actualizar skills del master

```bash
# Sync TODOS los clientes:
./scripts/sync-skills.sh

# Sync un solo cliente:
./scripts/sync-skills.sh monzo

# Respeta overrides — nunca sobreescribe dirs reales
```

### Estado de todas las instancias

```bash
./scripts/status.sh
# Muestra: skills shared/custom/overrides, brand files, .env status
```

### Añadir skill custom a un cliente

```bash
mkdir -p sanchocmo-monzo/.claude/skills/mi-skill-custom
# Crear SKILL.md dentro
# Opcionalmente: añadir al agent config en openclaw.config.json
```

### Override de skill compartida

```bash
cd sanchocmo-monzo/.claude/skills/
rm seo-content                         # eliminar symlink
cp -r ../../skills-shared/seo-content . # copiar como real
# Editar la copia local
```

### Costes Supabase

**Zero data leakage**: cada instancia tiene su propio workspace + Supabase.

- **Free tier**: 2 proyectos (2 clientes gratis)
- **Escalado**: 1 proyecto Pro ($25/mes) con schemas separados (`monzo.*`, `criptan.*`) para clientes ilimitados

---

## Troubleshooting

### "Supabase MCP connection failed"
```bash
# Verificar que npx funciona con Supabase MCP
npx -y @supabase/mcp --help

# Verificar credenciales
curl -H "apikey: $SUPABASE_ANON_KEY" "$SUPABASE_URL/rest/v1/"
```

### "Discord bot not responding"
```bash
# Verificar que el bot está en el servidor
# Discord → Server Settings → Integrations → ver bot

# Verificar permisos del bot en cada canal
# El bot necesita: Send Messages, Create Public Threads, Read Message History
```

### "Agent not responding in channel"
- Verificar `bindings` en `openclaw.config.json` — nombre del canal debe coincidir exactamente
- Verificar que el SOUL.md del agente existe en `agents/`
- Verificar que OpenClaw está corriendo

### "Skills not detected"
```bash
find .claude/skills -name "SKILL.md" | wc -l
# Debería ser 38
```

---

## Quick Reference

| Canal | Agente | Modelo | Qué hace |
|-------|--------|--------|----------|
| #campaigns | Sancho | Opus | Propone campañas, goals |
| #intelligence | Sancho | Opus | Radar automático diario |
| #el-toboso | El Oráculo | Opus | Brand identity, Foundation |
| #prospecting | El Explorador | Sonnet | Cold outreach pipeline |
| #organic-content | El Redactor | Sonnet | SEO content |
| #social | El Comunicador | Sonnet | Social media, newsletter |
| #design | El Creativo | Sonnet | Assets visuales |
| #paid-ads | El Amplificador | Sonnet | Paid media |
| #partners | El Conector | Sonnet | Alianzas, partnerships |
| #sales | El Comercial | Sonnet | Propuestas, pricing |
| #web | El Arquitecto | Sonnet | Landing pages, CRO |
| #research | El Investigador | Opus | Deep dives, mercados |
| #learning | Sancho | Opus | Feedback loop semanal |
| #admin | Sancho | Opus | Config, debugging |

---

*Setup complete. Day 1: works. Day 7: works better. Day 14: works like it knows the client.*
