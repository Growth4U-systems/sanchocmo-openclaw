# Definition-of-Done gate — contrato universal (SAN-344)

> Contrato compartido por TODAS las skills. Vive **fuera** de las skills a
> propósito: un único checklist objetivo que cada entregable cruza antes de
> "done", en vez de que cada skill haga QA por su cuenta (y el generador se
> juzgue a sí mismo).
>
> Código: `src/lib/qa/done-gate.ts`. No es obediencia del agente — es una
> comprobación de **disco** que el modelo no puede confabular.

## Objetivo

Convertir "el agente dice que terminó" en "los ficheros demuestran que terminó".
Determinista, sin LLM, ≈gratis. Cierra el modo de fallo recurrente: declarar un
entregable hecho habiendo escrito **nada / un fichero vacío o huérfano**, o
escribir un status/step que el modelo de datos no reconoce.

## Cuándo dispara

En el momento "done" del entregable: la transición de una task **`→ completed`**
(`POST /api/projects/task-status`). **No** corre en cada mensaje de chat — eso
sería carísimo y ruidoso, y queda reservado para la futura capa Sansón (LLM).

## HARD floor vs ADVISORY (clave)

- **HARD (bloquea, 422)** = el **`deliverable_file` de la propia task** — el
  contrato específico de ESA task. Si falta o está vacío, no hay "done".
- **ADVISORY (no bloquea)** = el **`context_writes` de la skill**. Los outputs
  declarados de una skill son *genéricos* a TODAS sus invocaciones, así que una
  task concreta no tiene por qué haber producido cada uno (p.ej. una task
  `newsletter` no debe bloquearse porque falte `campaigns/` o
  `operational/assets.md`, que son outputs de OTRAS ejecuciones). Se reportan en
  `result.advisories` (log + futura capa Sansón LLM); **nunca** bloquean.

## Criterios de paso (objetivos, deterministas)

Un entregable **pasa** cuando:

1. **Deliverable presente y no vacío (HARD).** Cada ruta del `deliverable_file`
   de la task que se pueda resolver existe y es no-vacía:
   - Fichero → existe y `size > 0`.
   - Directorio (entrada con `/`, o una ruta que en disco ES un directorio) →
     existe y **no está vacío**.
   - Un fichero que solo resuelve a un `lite.md` preliminar (no al canónico
     declarado) → **MISSING** (el output real no se escribió).
2. **Status válido** (si se escribe uno): ∈ `VALID_TASK_STATUSES` (o un alias
   legacy reconocido). Mismo criterio que la API `pillar-status` — el gate nunca
   es *más estricto* que la validación de status de hoy.
3. **Step válido** (si se pasa uno): se normaliza contra `VALID_PIPELINE_STEPS`.
4. **Stamp de trazabilidad** presente (skill · agent · model · `at`), escrito en
   `task.done_stamp` al completar.

El `context_writes` de la skill se evalúa con los MISMOS criterios pero su
resultado va a `advisories` (soft), no bloquea.

### Reglas que evitan falsos positivos (nunca bloquean)

- Entrada con **placeholder sin resolver** tras sustituir `{slug}` + `vars`
  (`{ideaId}`, `{asset-slug}`, `{YYYY-MM-DD}`…) → **N/A (skipped)**, no MISSING.
- Entrada **glob/wildcard** (`*.json`, `keywords/*.yml`) → **N/A (skipped)**: es
  una intención, no un entregable con nombre.
- **Sin `deliverable_file`** (ni `context_writes` resoluble) → **pasa** (una task
  puede legítimamente no declarar entregable).
- Anotaciones inline en la declaración (`ruta.md (vía API)`, `ruta # comentario`,
  `ruta — nota`) se recortan antes de resolver.

## Códigos de fallo (→ 422, hard-block)

| Código | Significa | Cómo arreglarlo |
|---|---|---|
| `MISSING_OUTPUT` | Una ruta declarada no existe en disco | Produce el fichero/dir antes de cerrar, o corrige la ruta en `context_writes` |
| `EMPTY_OUTPUT` | Existe pero está vacío (0 bytes / dir vacío) | Escribe contenido real; un fichero vacío = no se escribió nada |
| `INVALID_STATUS` | Status fuera del vocabulario canónico | Usa uno de `VALID_TASK_STATUSES` |
| `INVALID_STEP` | Step no reconocido | Usa un step de `VALID_PIPELINE_STEPS` (o su alias) |

## Cómo declarar outputs correctamente

- Escribe **rutas de fichero concretas** en `context_writes` (relativas a la raíz
  del workspace; `brand/{slug}/...` para lo de marca, `campaigns/`… para lo no-marca).
- Usa placeholders (`{ideaId}`, `{channel}`…) solo cuando el caller pase su valor
  en `vars`; si no, el gate los salta (no los puede afirmar).
- Una entrada con **slash final** = "escribo dentro de este directorio".

## Escape hatch

`DONE_GATE=off` (default **ON**) convierte el gate en *audit-only*: computa el
veredicto pero no lanza. Úsalo solo ante un fallo catastrófico (p. ej. el
resolver da falsos positivos a escala). Espejo de `CONTENT_RESEARCH_GATE`.

## Qué NO valida (y por qué)

La **calidad** del contenido, el número de fuentes, la veracidad de los claims —
nada de eso. Ese es trabajo de la **capa Sansón / qa-bot (LLM)**, una verificación
en contexto independiente (el generador no se juzga a sí mismo), soft-flag, que se
añadirá después en el webhook de chat. Este gate es solo el **suelo** determinista.
Mantener la frontera evita re-litigar criterios skill por skill.
