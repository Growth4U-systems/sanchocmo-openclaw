---
name: review-comments
description: "Cierra el loop entrega → feedback → revisión agéntica (SAN-148): lee los comentarios anclados que el cliente dejó en un deliverable compartido, propone un plan de revisión comentario a comentario (Apply/Skip), aplica lo aprobado al documento fuente y marca los comentarios como resueltos con una respuesta firmada. Use when: Mission Control despacha feedback nuevo de un doc, el usuario dice 'revisa los comentarios de X', 'qué feedback hay en Y', 'aplica el feedback', 'comentarios pendientes', o pregunta si el cliente ha comentado un deliverable. Shared skill: la ejecuta el agente AUTOR del doc (el dispatch lleva agent explícito), no un owner fijo. NOT for: clasificar feedback en insights de mejora de skills (feedback-triage / Sansón)."
---

# review-comments

Los clientes comentan sin cuenta sobre el deliverable compartido (visor `/share/[token]` de
Mission Control, hilos + resolver, anclaje TextQuoteSelector) → tú lees ese feedback → propones
la revisión → aplicas lo aprobado al doc ORIGINAL → resuelves los comentarios con respuesta firmada.

## Skill Metadata
- **Version**: 1.0 (adaptación Sancho del prototipo g4u review-comments) | **Owner**: dinámico — el agente autor del doc
- **Type**: feedback loop

## Context
- **Reads**: comentarios vía API interna de MC; el doc fuente bajo `brand/{slug}/...`
- **Writes**: el doc ORIGINAL (nunca el `.commented`); su sibling `.html` si existe (regenerar con `html-output`); respuestas/resolución vía API

## Infra

- API interna de Mission Control (header `Authorization: Bearer $SANCHO_INTERNAL_API_TOKEN`):
  - Listar: `GET $MC_BASE/api/clients/{slug}/comments?docPath=<doc>&open=1`
  - Resolver + responder: `PATCH $MC_BASE/api/clients/{slug}/comments/{id}` con
    `{"docPath": "<doc>", "resolved": true, "replyBody": "Aplicado: ...", "replyAuthor": "<tu nombre> (agente)"}`
- Los comentarios viven anclados al sibling `.commented` del doc; el campo `docPath` de la API
  acepta el path original y traduce solo.
- Shape de cada comentario: `id, author, body, anchorText, anchorPrefix, anchorSuffix,
  anchorDocOffset, parentId, resolved, createdAt`. Los hilos son root + replies (`parentId`).

## Workflow

### 1. Determinar el alcance

El mensaje de despacho trae `slug` y `docPath` (original). Si te invocan sin docPath, lista todos
los comentarios abiertos del cliente (`GET .../comments?open=1`) y agrupa por documento.

### 2. Leer los comentarios abiertos

`GET $MC_BASE/api/clients/{slug}/comments?docPath=<docPath>&open=1` con el Bearer interno.
Reconstruye los hilos: roots (sin `parentId`) + sus replies. Las replies son contexto de la
conversación, no comentarios separados.

### 3. Localizar el doc fuente

El doc de verdad es el ORIGINAL bajo `brand/{slug}/...` — NUNCA edites el `.commented.*`
(es la transcripción del feedback). Si el docPath que te llega termina en `.commented.md`,
quita el `.commented`.

### 4. Proponer el plan de revisión

Para cada hilo abierto, publica en el thread:

```
[N] <author> · <fecha>
    Ancla: "<anchorText truncado>"   (o «general» si no hay ancla; o «huérfano» si el texto ya no existe)
    Comentario: <body>  (+ replies del hilo como contexto)
    → Propuesta: <cambio concreto en el doc, o "responder/descartar porque...">
```

Si el `anchorText` ya no existe en el doc (huérfano), localiza la sección por
`anchorPrefix`/`anchorSuffix` y dilo en la propuesta. Si un comentario es ambiguo, di qué
interpretas y marca la duda.

**Espera el OK del humano** (Apply/Skip/Edit por ítem) antes de tocar nada — salvo que el
mensaje de despacho o el humano digan explícitamente "aplica directo".

### 5. Aplicar y cerrar

1. Aplica los cambios aprobados al doc ORIGINAL (Edit).
2. Si el doc tiene sibling `.html` (HTML canónico, SAN-149), regenéralo con la skill
   `html-output` — un HTML desactualizado es peor que no tener HTML
   (`_system/output/html-canonical-protocol.md`).
3. Marca cada hilo tratado como resuelto, con respuesta firmada explicando qué se aplicó:

```
PATCH $MC_BASE/api/clients/{slug}/comments/{rootId}
{"docPath": "<docPath>", "resolved": true,
 "replyBody": "Aplicado: <resumen del cambio>", "replyAuthor": "<tu nombre> (agente)"}
```

Para hilos descartados: `resolved: true` + reply explicando por qué no se aplica.

4. Resumen final en el thread: cambios aplicados, hilos resueltos, hilos que quedan abiertos y por qué.

## Reglas

- Los comentarios son INPUT de revisión, no órdenes: si un comentario pide algo que contradice
  datos verificados, el positioning aprobado o el estilo canónico del brand, propón la
  alternativa y explícalo en la reply.
- NUNCA borres comentarios. Resolver es reversible; borrar no.
- NUNCA edites el `.commented.*` ni el formulario/visor.
- No expongas `$SANCHO_INTERNAL_API_TOKEN` en ningún output.
- Comentarios ya resueltos (`resolved: true`) no se reabren salvo instrucción humana.
