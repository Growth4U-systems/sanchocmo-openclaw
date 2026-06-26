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

## Criterios de paso (objetivos, deterministas)

Un entregable **pasa** cuando:

1. **Outputs presentes y no vacíos.** Cada ruta declarada en el `context_writes`
   de la skill (∪ el `deliverable_file` de la task) que se pueda resolver existe
   y es no-vacía:
   - Fichero → existe y `size > 0`.
   - Directorio (la entrada acaba en `/`) → existe y **no está vacío**.
2. **Status válido** (si se escribe uno): ∈ `VALID_TASK_STATUSES` (o un alias
   legacy reconocido). Mismo criterio que la API `pillar-status` — el gate nunca
   es *más estricto* que la validación de status de hoy.
3. **Step válido** (si se pasa uno): se normaliza contra `VALID_PIPELINE_STEPS`.
4. **Stamp de trazabilidad** presente (skill · agent · model · `at`), escrito en
   `task.done_stamp` al completar.

### Reglas que evitan falsos positivos (nunca bloquean)

- Entrada con **placeholder sin resolver** tras sustituir `{slug}` + `vars`
  (`{ideaId}`, `{asset-slug}`, `{YYYY-MM-DD}`…) → **N/A (skipped)**, no MISSING.
- Entrada **glob/wildcard** (`*.json`, `keywords/*.yml`) → **N/A (skipped)**: es
  una intención, no un entregable con nombre.
- **Sin `context_writes` ni `deliverable_file`** → **pasa** (una skill puede
  legítimamente no escribir ficheros).
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
