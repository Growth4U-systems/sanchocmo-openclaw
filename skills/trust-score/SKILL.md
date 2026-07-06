---
name: trust-score
description: "Audita la confianza digital del cliente (Trust Score, 6 pilares) corriendo el Trust Score Analyzer en modo compare (self-score + gap vs competidores) y deja el diagnóstico como doc del pilar Site Audit. Corre en el kickoff (tras Company Brief) y se refresca periódicamente. Triggers: trust score, auditoría de confianza, site audit, confianza digital, gap vs competidores."
metadata:
  author: Growth4U
  version: '1.0'
  system: SanchoCMO
  phase: Foundation
  context_required:
    - brand/{slug}/company-brief/company-brief.current.md
  context_writes:
    - brand/{slug}/site-audit/trust-score/trust-score.current.md
---

# Trust Score (auditoría de confianza digital)

El Trust Score evalúa la confianza digital de una marca desde su URL en 6 pilares: Borrowed Trust, SERP Trust, Brand Assets, GEO Presence (IA), Outbound Readiness y Demand Engine. Es el diagnóstico de apertura: sus pilares mapean casi 1:1 con el programa de growth, así que enmarca el plan completo.

No reimplementes el análisis. El motor vive detrás del endpoint `/api/trust-score`, que corre el modo compare, persiste la métrica diaria en `metric_snapshots` (`source=trust_score`) y escribe este doc.

## Pasos

1. **Token.** Leé el `adminToken` de la raíz de `clients.json`.
2. **Disparar.** POST `{MC_BASE}/api/trust-score` con header `x-admin-token: <adminToken>` y body `{ "slug": "{slug}" }`.
   - Si no hay set de competidores fijado, el endpoint los auto-descubre, corre compare y los fija para que el gap sea comparable en el tiempo.
   - Para fijar competidores a mano: body `{ "slug": "{slug}", "competitors": [{ "url": "...", "name": "..." }] }`.
   - La llamada tarda ~3-4 min (corre todas las marcas en paralelo). Esperá; no reintentes a ciegas.
3. **Verificar.** Confirmá que `site-audit/trust-score/trust-score.current.md` existe con los 6 pilares, el score global y el verdict.
4. **Completar.** Marcá el pilar como hecho para que no quede colgado en "todo": POST `{MC_BASE}/api/brand-brain/pillar-status` con header `x-admin-token` y body `{ "slug": "{slug}", "section": "site-audit", "pillar": "trust-score", "status": "completed" }`.
5. **Resumir.** Al usuario: score global, los 2-3 pilares más flojos (con su score) y la brecha principal vs competidores.

## Cómo siembra el plan

Cada pilar flojo es un workstream del Strategic Plan (el de menor score, primer proyecto). El Strategic Plan lee este doc y ordena los pilares de menor a mayor score. No dupliques esa lógica acá: solo dejá el doc completo y machine-readable (el frontmatter trae los scores).

## Errores

- 409: no se pudieron fijar competidores (ni a mano ni auto-descubiertos). Avisá y pará.
- 502: el auto-descubrimiento falló (no se pudo contactar al analyzer). Avisá y pará.
- `_stale: true`: el analyzer falló y se devolvió un dato viejo. Avisá que el dato es stale.
