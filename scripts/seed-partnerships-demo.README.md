# Seed · Partnerships demo (SAN-78 + SAN-80)

Siembra el **Yalc local** con los 9 creators canónicos del mockup
(`OUTPUTS/sanchocmo/mockups-partnerships/contactos-lista.html`) + las
conversaciones del Inbox (`inbox.html`) para desarrollar y verificar la UI de
Outreach·Partnerships: Encuentra, Contactos (kanban/lista), drawer (con calc
break-even), Inbox de negociación y Plantillas.

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
# Defaults: YALC_BASE_URL=http://localhost:3847 · DB=~/.gtm-os/gtm-os.db ·
# sin token · SANCHO_SLUG=monzo (cliente cuyo brand/ recibe búsquedas+plantillas)
npx tsx scripts/seed-partnerships-demo.ts

# Con token y/o rutas custom
YALC_API_TOKEN=<token> YALC_BASE_URL=http://localhost:3847 \
YALC_DB=~/.gtm-os/gtm-os.db SANCHO_SLUG=<slug> \
npx tsx scripts/seed-partnerships-demo.ts
```

> SAN-80 necesita la rama Yalc de SAN-80 (`alfonso/san-80-contacto-inbox-yalc`):
> trae `lead_messages`, `POST /api/webhooks/reply` y el flujo
> `partner-contact` + framework `partner-outreach` (gates).

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

- **(SAN-80)** Búsquedas registradas en Sancho (`brand/{SANCHO_SLUG}/outreach/searches/`)
  con la secuencia **"Primer contacto creators fintech" instanciada** en la búsqueda
  activa, biblioteca de plantillas del mockup (3 secuencias + 3 briefs) y 6
  conversaciones del Inbox (mensajes out en dry-run + replies vía
  `POST /api/webhooks/reply`):

  | Hilo | Estado Inbox | Detalle |
  |---|---|---|
  | @finanzasconlucia | Negociando | reply con **3.500€** → panel break-even + borrador contraoferta |
  | @davidfintech | Respondió | reply con 1.200€ |
  | @ahorroconmarta | Contactado | primer toque enviado, sin respuesta |
  | @elclubdelahorro (extra) | Reunión | Demo_Booked + calendly |
  | @podcastdinero (extra) | Parado | No_Reply tras 2 follow-ups |
  | @criptoclara (extra) | Rebotado | email bounced (prioridad sobre lifecycle) |

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

## Verificar SAN-80 (Plantillas · Contacto · Inbox)

6. **Plantillas** — biblioteca con 3 secuencias + 3 briefs; hover en una línea:
   ⬇️ descarga el .md · 📄 doc renderizado (doc-slideover) · 💬 chat con Sancho
   (hilo de la plantilla, Rocinante) · 📋 va a la búsqueda que la instancia.
   Click en línea = editor (pasos + delays + variables insertables); ＋ Nueva.
7. **Encuentra** — fila "Plantillas de esta búsqueda" con chips de instancias y
   "＋ asignar plantilla" (picker de la biblioteca → Instanciar).
8. **Contactar** — en Contactos·Lista selecciona leads en Shortlist → bulk
   "📨 Contactar" (o mueve una card a Contacted): se instancia la secuencia y
   se abre el GATE (GateItem). "✅ Aprobar y enviar" = envío **dry-run** (jamás
   email real) → el lead pasa a Contactado y su hilo aparece en el Inbox.
9. **Inbox** — chips con contadores (Negociando/Respondió/Contactado/Reunión/
   Parado/Rebotado encendidos por el seed); el hilo de @finanzasconlucia
   muestra el panel "🧮 Sancho ha detectado un precio: 3.500€" con el
   break-even real (44 necesarias · ~52 alcanzables · VIABLE · contraoferta
   4.100€), "📎 Insertar análisis" añade el P.D. al borrador, y 📨 Enviar
   abre el gate de la respuesta.
10. **Drawer** — calc break-even interactiva (posts/formato/precio/estructura/
    CPA/CAC/incentivo) recalculando en vivo + contact log con el hilo real.
