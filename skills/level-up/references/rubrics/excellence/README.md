---
type: rubric-system
author: alfonso
date: 2026-06-23
client: internal
tags: [rubrics, excellence, level-up, quality, taste]
abstract: Rúbricas de EXCELENCIA (el techo) — notas 0-10 ancladas que la skill /level-up usa para elevar entregables de notable a sobresaliente. Distintas de las rúbricas de aceptación binarias (el suelo) de la carpeta padre.
---

# Rúbricas de excelencia — el techo

Estas rúbricas son **distintas** de las de la carpeta padre (`rubrics/*.md`), y a propósito viven separadas.

| | Rúbricas de **aceptación** (`rubrics/`) | Rúbricas de **excelencia** (`rubrics/excellence/`) |
|---|---|---|
| Pregunta | ¿Está bien? ¿Sin fallos? | ¿Es memorable? ¿Está al máximo nivel? |
| Eje | El **suelo** | El **techo** |
| Criterios | Binarios y comprobables (sí/no) | Dimensiones puntuadas **0-10** con notas ancladas |
| La usa | qa-bot, el verificador independiente | `/level-up` |
| Riesgo que evita | Errores, datos falsos, omisiones | Quedarse en "correcto pero olvidable" |

## Principio: premian el filo, no el molde

Una rúbrica de excelencia que premia "tiene todas las secciones" mata lo que intenta medir — aplana al promedio. Estas miden **insight, no-obviedad, storytelling, filo de la tesis y memorabilidad**. Cuando un criterio empuje hacia "más completo" en vez de "más afilado", está mal escrito: reescríbelo.

## Anatomía de una rúbrica de excelencia

1. **Dimensiones** con peso (suman 100%). Cada una con descripción de qué es un **3 (flojo)**, un **6 (correcto)** y un **9 (sobresaliente)** — anclas concretas para que un juez fresco puntúe igual que Alfonso.
2. **`## Criterios destilados de Alfonso`** — sección viva. `/level-up` la rellena sola (Fase 4 de la skill) cada vez que Alfonso da un juicio de gusto sobre un resultado. Es el "benchmark creciente": el gusto se acumula aquí, fechado.

## Cómo crecen (auto-destilado)

No se editan a mano salvo corrección. La skill `/level-up` las alimenta: cuando Alfonso dice "el storytelling tiene que molar más" o "el dato está muy abajo", ese juicio difuso se reescribe como criterio aplicable y se añade a `## Criterios destilados de Alfonso` con fecha. Si contradice algo existente, se actualiza en sitio — nunca dos criterios peleándose.

## Disponibles

| Rúbrica | Tipo de entregable |
|---|---|
| [deck.md](deck.md) | Decks, presentaciones, propuestas visuales |
| [research.md](research.md) | Deep research, análisis de mercado/competitivo, audits |
| [estrategia.md](estrategia.md) | Planes de growth, GTM, estrategias |
| [copy.md](copy.md) | Landing copy, emails, mensajes de venta |
