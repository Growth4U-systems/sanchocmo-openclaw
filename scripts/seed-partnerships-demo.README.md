# Seed · Partnerships demo (SAN-78)

Siembra el **Yalc local** con los 9 creators canónicos del mockup
(`OUTPUTS/sanchocmo/mockups-partnerships/contactos-lista.html`) para desarrollar
y verificar la UI de Outreach·Partnerships: Encuentra, Contactos (kanban/lista)
y el drawer del partner.

## Prerrequisitos

1. **Yalc local en la rama de SAN-77** (es la que tiene `type=Partnerships`,
   el enum extendido de `lifecycleStatus` y `PATCH /api/leads/:id/stage`):

   ```bash
   cd ../Yalc-Growth4U   # clon hermano del repo
   git checkout alfonso/san-77-data-layer-yalc
   corepack enable && pnpm install
   pnpm server           # ≈ npx tsx scripts/run-server.mjs · puerto 3847
   ```

   El server aplica migraciones al arrancar y crea la SQLite en
   `~/.gtm-os/gtm-os.db` (o donde apunte `DATABASE_URL=file:<ruta>`).
   Si defines `GTM_OS_API_TOKEN` en `~/.gtm-os/.env`, la API exige bearer.

2. **`sqlite3` en el PATH** (macOS lo trae de serie). El seed lo usa para los
   creator-fields (handle/red/followers/ER/tier/precio/quality components):
   la API de escritura de esos campos llega con el discovery runner (SAN-79);
   hasta entonces el seed escribe directamente lo que el runner escribirá.

## Uso

Desde la raíz de `sanchocmo-openclaw`:

```bash
# Defaults: YALC_BASE_URL=http://localhost:3847 · DB=~/.gtm-os/gtm-os.db · sin token
npx tsx scripts/seed-partnerships-demo.ts

# Con token y/o rutas custom
YALC_API_TOKEN=<token> YALC_BASE_URL=http://localhost:3847 \
YALC_DB=~/.gtm-os/gtm-os.db \
npx tsx scripts/seed-partnerships-demo.ts
```

Es **idempotente**: re-ejecutarlo actualiza (ancla `provider_id='seed:<handle>'`)
en lugar de duplicar.

## Qué crea

- 3 búsquedas = campañas `type=Partnerships` (modo `hybrid`, umbral 40):
  - **Creators finanzas personales ES · IG+TikTok** — status `active` (card Running)
  - **YouTubers inversión ES** — status `completed` (card Done)
  - **Podcasts fintech** — status `draft` (card Draft → abre el chat de discovery)
- 9 leads/creators con quality score **calculado por calc-creator-core (SAN-75)**
  — paridad exacta con el mockup — repartidos por el pipeline:

  | Handle | Quality | Stage (yalc) |
  |---|---|---|
  | @finanzasconlucia | 87 | Negotiating (Negotiating) · 3.500€ |
  | @elinversorprudente | 91 | Signed (Deal_Created) · 2.800€ |
  | @ahorroconmarta | 74 | Contacted (Queued) |
  | @davidfintech | 82 | Replied (Replied) · 1.200€ |
  | @cuentasclaras_es | 58 | Discovered (Sourced) |
  | @lauraylasfinanzas | 79 | Shortlist (Qualified) |
  | @money_pau | 88 | Active (Closed_Won) · 5.000€ |
  | @pelotazo_cripto | 31 | Descartado — `auto · hybrid: score < 40` |
  | @cuentasclaras_es2 | 52 | Descartado — `manual · 11 jun` |

  Los 2 descartados NO salen en el kanban (Descartado no es columna): se ven en
  Contactos · Lista con el filtro Stage → 🗑 Descartados, y son reversibles.

## Verificar la UI (DoD SAN-78)

```bash
# .env de Sancho: YALC_BASE_URL=http://localhost:3847 (+ YALC_API_TOKEN si toca)
npm run dev
```

Abre `/dashboard/<slug>/yalc` (cliente demo; Outreach en el sidebar):

1. **Encuentra** — 3 cards de búsqueda; click en una con candidatos → Contactos ·
   Lista con banner `?busqueda=` y ✕ quitar filtro; la draft abre el chat.
2. **Contactos · Kanban** — columnas Discovered→Closed con sublabel `yalc: …`;
   en Discovered, ✓ Shortlist mueve y persiste (PATCH stage), 🗑 descarta con
   nota; drag&drop entre columnas; toggle 🏆 Roster = Signed+Active.
3. **Contactos · Lista** — Quality badge (verde ≥85 · ámbar 70-84 · rojo <70),
   Sector fit, Precio, Break-even/Veredicto "—" (Ola 2), Stage; orden por
   columnas; filtro 🗑 Descartados; multi-select + bulk Mover/Descartar.
4. **Drawer** — click en card/fila: quality grande + 5 componentes con barras,
   datos del creator, hueco calc break-even (Ola 2) y contact log placeholder;
   botón ⤢ Expandir a pantalla completa.
5. Selector **Tipo: B2B** → el cockpit YALC de siempre, intacto.
