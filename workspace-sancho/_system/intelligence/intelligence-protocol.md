# Intelligence Protocol — SanchoCMO

> Como Sancho recopila, analiza y usa inteligencia de mercado.

> ⚠️ **OBLIGATORIO**: Antes de publicar output de inteligencia en un canal de cliente, aplica `_system/governance/client-context-isolation.md`. Solo contenido relevante al cliente. CERO info interna del sistema.

---

## Intelligence Engine (Unified)

Daily Pulse y Aprende son DOS CARAS del MISMO sistema:

| Face | Activo desde | Actualiza |
|------|-------------|-----------|
| **Daily Pulse** | Phase 1 onwards | Context Lake (what we KNOW) — positioning, ICP signals, competitor moves, objections |
| **Aprende** | Phase 3 onwards | Execution strategy (what we DO) — content performance, outreach conversion, channel priority |

### 5 Data Sources Compartidos

1. **Meeting data** (primary) — client calls, sales calls
2. **Slack / team communication**
3. **Notion / task & doc activity**
4. **Google Workspace activity**
5. **Sancho proactive questions**

---

## Metodologia: 3 Lenses

Cuando se analiza cualquier entidad (competitor, self, market):

| Lens | Que Captura | Fuente |
|------|------------|--------|
| **Lens 1** | What they SAY about themselves | Homepage, product pages, social, ads |
| **Lens 2** | What OTHERS say about them | Influencers, reviewers, journalists |
| **Lens 3** | What CUSTOMERS say | Trustpilot, App Store, G2, Capterra |

**Conflict resolution:** Lens 3 (highest) > Lens 2 > Lens 1 (lowest)

**Principio:** Behavior beats opinions beats marketing copy.

---

## Data Architecture

Para detalle completo de los 3 data layers (Context Lake, Content Ideas, People/Outreach), ver `_system/intelligence/brand-memory.md`.

**Resumen rapido:**

| Layer | Contenido | Populated By |
|-------|-----------|-------------|
| **Context Lake** | Foundation pillars en 3 tiers (Constitution, Strategic, Transitory) | Foundation skills + monitoring |
| **Content Ideas** | Ideas → Content (1 idea → many formats) con metricas | Content skills + Playbook runs |
| **People/Outreach** | Company → Contact → List → Sequence | Outreach module + Referral |

**Promotion rules:**
- Tier 3 data con patrones consistentes (3+ data points) → promovida a Tier 2
- Tier 2 insights confirmados como verdades fundacionales → promovidos a Tier 1

**Directory rules:**
- `brand/` = referencia READ-ONLY para ejecucion. Solo Foundation escribe ahi.
- `campaigns/` = outputs de ejecucion GTM. Cada campana en su propio subdirectorio.

---

## Deduplication Protocol (T-040)

**OBLIGATORIO** para Meeting Intelligence y Daily Pulse crons.

### Tracker File

`_system/intelligence-tracker.json` — registro de items ya procesados.

### Meeting Intelligence — Dedup Flow

1. **Before processing**: Read `_system/intelligence-tracker.json`
2. **For each meeting found** (Google Drive, Notion, etc.):
   - Generate slug: `YYYY-MM-DD-title-slugified` (same as .md filename without extension)
   - Check if slug exists in `tracker.meetings`
   - If exists AND file hasn't changed → **SKIP** (ya reportado)
   - If exists BUT file has been modified (compare file mtime vs `processedAt`) → **RE-PROCESS** as update
   - If NOT exists → **PROCESS** as new
3. **After processing**: Update tracker with new/updated entries:
   ```json
   {
     "processedAt": "ISO timestamp",
     "client": "slug",
     "hash": null
   }
   ```
4. **Report only new/updated meetings** to #intelligence

### Daily Pulse — Dedup Flow

1. **Before processing**: Read `_system/intelligence-tracker.json`
2. **Check today's date** in `tracker.dailyPulse`
   - If today exists → already ran today → **SKIP entire pulse** (or only process new signals since `processedAt`)
   - If today NOT exists → **PROCESS** normally
3. **After processing**: Add today's entry:
   ```json
   {
     "processedAt": "ISO timestamp",
     "client": "slug",
     "insightsCount": N
   }
   ```

### Rules

- **Read tracker FIRST, before any scan.** This is step 0.
- **Write tracker LAST, after successful processing.** Never write before confirming delivery.
- **If tracker file is missing or corrupt**, treat as empty (process everything, recreate file).
- **Never delete entries** from tracker. It's append-only.
- **Log skips**: When skipping a meeting, log "⏭️ Skipping [slug] — already processed on [date]" for debugging.
