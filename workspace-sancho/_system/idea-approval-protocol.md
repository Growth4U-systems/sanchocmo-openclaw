# Idea Approval Protocol

> Flujo de aprobacion de ideas en Discord (lightweight gating).
> TODO el trabajo de redaccion ocurre en MC UI, NO en Discord.

---

## Principio

El humano no aprueba todas las ideas igual. Hay que ofrecer varias y
dejarle elegir. Discord es SOLO para gating rapido (si/no). El resto
ocurre en MC UI.

## Flujo

### 1. Calendar Controller selecciona candidatos

`content-calendar-planner` selecciona N (3-5) ideas del `idea-queue.json`
para los slots del dia, priorizando por recency:

```
WHERE pillar_id IN (active pillars)
  AND content_type = type del slot
  AND status = 'ready'
  AND age(created_at) <= 14 days
ORDER BY recency_score DESC, pov_confidence DESC
LIMIT 3-5
```

`recency_score = exp(-age_in_days / 5)` — decay rapido.

### 2. Dispatch a Discord

Dulcinea envia UN mensaje al canal configurado del cliente con
N ideas candidatas. Formato por idea:

```
📰 Esto paso: {signal.summary}
   📅 {signal.date} · 🔗 {signal.source}
✍️ Tu posible angulo: {angle_draft}
🎯 Pillar: {pillar_id} · Canal: {channel} · Tipo: {type}

[✅ Si] [⏰ Mas tarde] [❌ No]
```

### 3. Humano marca

- **✅ Si** → `status = approved`. Dulcinea responde con un
  **link directo al thread del dia en MC UI**. Todo el resto (Clarify +
  Draft + edit + approve) ocurre alli.
- **⏰ Mas tarde** → `status = ready` + flag `revisit_after`. Se vuelve a
  proponer manana.
- **❌ No** → `status = archived`.

### 4. En MC UI (Sancho/Dulcinea)

El humano sigue el link al thread del dia. Alli:
1. Clarify (siempre, ver `clarify-protocol.md`)
2. Writer genera draft
3. Card en thread — edit inline o instrucciones
4. Approve → Metricool

## Reglas

- **Discord = SOLO gating.** Nunca Clarify ni drafts en Discord.
- **N candidatos, no 1.** Siempre ofrecer opciones.
- **Ideas de >14 dias → stale.** Auto-archivadas. Pueden re-promocionarse
  manualmente si siguen relevantes.
- **Multi-canal configurable**: Discord vs Slack vs Telegram, segun
  preferencia del cliente. Configurar en setup (Proceso 1 T03).
- **Link a MC UI obligatorio** con cada ✅. El humano debe poder llegar
  al thread del dia en 1 click.

## Schema en idea-queue.json

Cada idea aprobada se actualiza:

```json
{
  "id": "idea-2026-04-25-001",
  "status": "approved",
  "approved_at": "2026-04-25T08:15:00Z",
  "approved_via": "discord",
  "target_date": "2026-04-25",
  "project_task_id": "P-Content-Semana-17-T01"
}
```
