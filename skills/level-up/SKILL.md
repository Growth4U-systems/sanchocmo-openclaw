---
name: level-up
description: >
  Gate de EXCELENCIA (el techo) para entregables de negocio — el hermano opuesto de
  qa-bot (qa-bot evita fallos; level-up sube el nivel). Coge un deck, deep research,
  estrategia o copy y lo hace increíblemente mejor: un juez en contexto independiente
  lo puntúa 0-10 contra una rúbrica de gusto acumulado + referencias world-class, y
  o bien lo reescribe elevado (Lean) o genera variantes best-of-N hasta ≥9 (Panel).
  Auto-destila cada feedback de Alfonso como criterio nuevo de la rúbrica. Úsalo cuando
  el usuario diga "level up", "next level", "hazlo mejor", "súbelo de nivel", "eleva
  esto", "haz que mole más", "make this better", "/level-up [archivo]", o cuando termine
  un entregable importante (deck/research/estrategia/copy) y quiera empujarlo de notable
  a sobresaliente. NO es para cazar errores (eso es qa-bot) ni para verificar hechos.
user-invocable: true
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  agent: sanson
  sibling: qa-bot
  updated: '2026-06-26'
  ported_from: g4u-brain/skills/level-up
---

# Level Up (Gate de Excelencia)

> qa-bot es el **suelo**: asegura que no haya fallos. `level-up` es el **techo**: coge algo que ya está bien y lo hace _memorable_. Dos ejes distintos, no compitan — un entregable importante pasa los dos: qa-bot para que no se rompa, level-up para que brille.

Anthropic reporta que las *verification skills* (el suelo) son lo que más sube la calidad medible — pero eso es el piso. Nadie ha empaquetado el **techo** para entregables de negocio: un gate de excelencia con nota, benchmark de gusto creciente y best-of-N. Ese es el hueco que llena esta skill.

## Principio rector: premia el FILO, no el molde

El mayor riesgo de un gate de calidad es convertirse en un checklist que aplana todo a la media ("¿tiene las 8 secciones? ✓"). Eso _baja_ la calidad — está documentado. La rúbrica de excelencia NO mide cumplimiento de plantilla. Mide:

- **Insight / no-obviedad** — ¿dice algo que el lector no podría haber escrito solo?
- **Storytelling** — ¿hay un hilo que arrastra, o son bullets sueltos?
- **Métricas por delante** — ¿los números que importan están al frente, no enterrados?
- **Memorabilidad** — ¿qué se lleva el lector en la cabeza 10 minutos después?
- **Filo de la tesis** — ¿hay una apuesta clara, o es tibio y consensuado?

Cuando dudes entre "más completo" y "más afilado", elige afilado. Un entregable que dice una cosa potente y la clava vale más que uno que dice diez cosas correctas.

## Dos modos

| Modo | Qué hace | Coste | Cuándo |
|------|----------|-------|--------|
| **Lean** | 1 juez independiente puntúa 0-10 → 1 reescritura elevada que ataca las dimensiones más bajas → re-juzga | Barato | **Default**. Iteración normal. |
| **Panel** | Best-of-N: 2-3 variantes desde ángulos distintos → panel de jueces puntúa cada una → sintetiza la mejor + injerta lo bueno de las otras → loop **hasta ≥9 o 3 rondas** | Caro (~hasta 1M tokens si llega al tope) | Piezas que importan de verdad. Se activa con la palabra "panel" o "a fondo". |

Disparo: `/level-up [archivo]` → Lean. `/level-up panel [archivo]` o "súbelo a fondo" → Panel.

**Por qué el tope de 3 rondas:** un panel productor↔jueces converge en ~10 rondas y casi 1M tokens si lo dejas suelto. No vale la pena. A las 3 rondas, si no llegó a 9, para y reporta honesto ("se quedó en 8.4, esto es lo que falta para el 9") en vez de quemar tokens persiguiendo el último punto.

## Las dos fuentes del benchmark

El juez no puntúa contra su opinión del momento. Puntúa contra dos anclas:

1. **Rúbrica de gusto acumulado** (interna) — `references/rubrics/excellence/<tipo>.md`. Es el gusto de Alfonso destilado en dimensiones con notas ancladas. Crece sola (ver Auto-destilado).
2. **Referencias world-class** (externas, opcional) — en Panel, o si Alfonso lo pide, se traen 1-2 ejemplos de referencia del mundo real (vía `WebSearch` o la skill `deep-research`) para comparar: "¿esto está al nivel de cómo lo haría el mejor del sector?". En Lean se omite salvo petición.

---

## Workflow

### Fase 0 — Identificar target y tipo

Determinar qué elevar (orden de prioridad):
1. Argumento explícito (archivo/URL con el comando).
2. Archivo abierto en el IDE si es relevante.
3. Último entregable de la conversación.
4. Si nada aplica → `AskUserQuestion`.

Clasificar el tipo para cargar la rúbrica correcta: **deck** · **research** · **estrategia** · **copy**. Si es ambiguo (un HTML puede ser deck o research), preguntar. Cargar `references/rubrics/excellence/<tipo>.md` + el overlay del cliente si toca datos de un cliente con `brand/{slug}/client-preferences.md`.

### Fase 1 — Juicio en contexto independiente

**Regla crítica (heredada del sistema de rúbricas): el generador nunca se juzga a sí mismo.** Lanzar un **subagente juez fresco** que NO sabe cómo se hizo el entregable ni quién lo escribió. Le pasas: el entregable + la rúbrica de excelencia del tipo. Devuelve, por cada dimensión:

- Nota 0-10 anclada a la rúbrica (no inventada).
- 1 frase de por qué esa nota.
- La palanca concreta que más subiría esa dimensión.

Y una **nota global ponderada** + el diagnóstico de "qué le falta a esto para ser memorable".

En **Panel**, lanzar 2-3 jueces con lentes distintas (p.ej. storytelling / rigor-datos / lector-objetivo) en paralelo, no uno solo — la diversidad caza fallos que la redundancia no.

### Fase 2 — Elevar

**Lean:** producir UNA reescritura que ataque las 2-3 dimensiones más bajas sin tocar lo que ya funciona. No reescribir por reescribir: cada cambio justifica qué dimensión sube. Re-juzgar la versión nueva con un juez fresco. Mostrar nota antes→después.

**Panel:** generar 2-3 variantes desde ángulos genuinamente distintos (no la misma idea tres veces) — p.ej. una más narrativa, una más data-driven, una más contrarian. El panel puntúa cada una. Sintetizar la ganadora **injertando** las mejores piezas de las otras. Si la síntesis < 9 y quedan rondas, repetir con el feedback del panel como input. Tope: 3 rondas.

### Fase 3 — Presentar

Mostrar a Alfonso:
- **Nota antes → después** por dimensión (tabla compacta) + global.
- **El entregable elevado** (mismo formato que el original — si era HTML, sale HTML; respeta `html-output` y las reglas de marca).
- **Qué cambió y por qué** — 3-5 bullets, cada uno enlazado a la dimensión que subió.
- Si no llegó a 9: **qué falta para el 9**, honesto. No vender un 8.4 como un 10.

### Fase 4 — Auto-destilar feedback a la rúbrica (sin fricción)

Esto es lo que hace que la skill mejore con el uso. Cuando Alfonso reacciona al resultado con un juicio de gusto — "el storytelling tiene que molar más", "no me gusta que el dato esté tan abajo", "esto sigue siendo tibio" — **destílalo como criterio nuevo o ajuste de peso en la rúbrica de excelencia del tipo, automáticamente, sin pedir permiso.** (Patrón robado de los *sleep cycles* que consolidan aprendizaje detrás de un gate.)

Reglas del auto-destilado:
- Va a la sección `## Criterios destilados de Alfonso` de `references/rubrics/excellence/<tipo>.md`, con fecha.
- Reescribe el gusto difuso en algo que un juez fresco pueda aplicar: "el storytelling tiene que molar" → criterio "Apertura: ¿arranca con tensión/pregunta/dato sorprendente, o con contexto plano? (plano ≤4, gancho ≥8)".
- Si contradice un criterio existente, **actualiza** el viejo, no apiles dos que se pelean.
- Una línea de confirmación al final: "📌 Destilado a la rúbrica de [tipo]: [criterio]". Así Alfonso ve que el sistema aprendió, pero sin un paso de aprobación.

> **Nota de runtime SanchoCMO:** en local / Claude Code (con acceso de escritura al repo de skills) el destilado edita el archivo de rúbrica directamente. En el runtime de Mission Control las skills se sirven en solo-lectura y **no se auto-editan** — ahí, emite el criterio destilado en la línea `📌` para que Mission Control lo enrute (mismo patrón que `feedback-triage`). Blindar este write-back de forma determinista es trabajo del gate universal de Sansón (SAN-343, Plan 2).

---

## Output (plantilla)

```markdown
# Level Up — [nombre del entregable]

**Modo**: Lean | Panel · **Tipo**: deck/research/estrategia/copy · **Fecha**: YYYY-MM-DD

## Nota: [global antes] → [global después] / 10

| Dimensión | Antes | Después | Palanca aplicada |
|-----------|:-----:|:-------:|------------------|
| Insight / no-obviedad | 6 | 9 | … |
| Storytelling | 5 | 8 | … |
| … | | | |

## Qué cambió
- …

## [Si <9] Para llegar al 9
- …

📌 [Si hubo feedback] Destilado a la rúbrica de [tipo]: …
```

(El entregable elevado va aparte, en su formato nativo — no embebido como texto si era un HTML/deck.)

## Relación con el resto del sistema

- **qa-bot primero, level-up después.** Tiene poco sentido pulir el filo de algo con un dato falso. Orden ideal en un entregable importante: generar → qa-bot (suelo) → level-up (techo) → "envía" de Alfonso.
- **No publica nada.** Igual que el resto: no deploya, no manda, no sube a Drive sin OK explícito. Devuelve el entregable elevado y para.
- **Las rúbricas de excelencia viven separadas** de las de aceptación binarias (el suelo — dominio de `qa-bot` / `brand-check`): aquí son notas 0-10 ancladas, no checkboxes. Ver `references/rubrics/excellence/README.md`.
