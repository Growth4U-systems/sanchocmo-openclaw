---
name: od-refine
description: |
  Surgical edit sobre un artifact existente generado previamente con od-generate. Usa el comment
  overlay del daemon de OD: el usuario indica qué elemento cambiar (ej: "el headline más serio")
  y la skill envía la instrucción al agente OD que modifica solo esa parte. Versión nueva que
  reemplaza la anterior tras aprobación. Triggers: "ajustar imagen", "cambiar copy del slide",
  "mejorar contraste", "hacer más serio", "refinar mockup".
metadata:
  layer: "5"
  pillar: "brand"
  agent: "maese-pedro"
  workspace: "workspace-maese-pedro"
  type: "wrapper"
  wraps_endpoint: "POST /api/chat (mode=refine)"
  daemon_url_env: "OD_DAEMON_URL"
  version: "1.0"
triggers:
  - "ajustar"
  - "refinar"
  - "mejorar copy"
  - "cambiar paleta"
  - "od-refine"
inputs:
  - name: brand_slug
    type: string
    required: true
  - name: artifact_id
    type: string
    required: true
    description: "ID del artifact existente a refinar (od_artifact_id del meta.json canónico)."
  - name: instruction
    type: string
    required: true
    description: "Qué cambiar y cómo. Single-shot, no chat conversacional."
  - name: scope
    type: string
    required: false
    default: "auto"
    description: "auto | element | global. element=cambia solo el elemento referenciado; global=regenera la pieza."
outputs:
  primary: artifact_revision
context_required:
  - brand/{slug}/brand-book/visual-identity/DESIGN.md
  - brand/{slug}/.od/artifacts/{artifact_id}/
context_writes:
  - brand/{slug}/.od/artifacts/{artifact_id}_v{N}/ (nueva versión OD)
  - brand/{slug}/brand-book/visual-identity/{kind}/{id}/ (canónico, tras aprobación humana)
---

# od-refine — surgical edit de un artifact existente

> Modifica un artifact ya generado sin regenerarlo desde cero. Usa el comment overlay de OD para enfocar el cambio en el elemento referenciado.

## Workflow

### 1. Localizar artifact
- Lee `meta.json` del artifact canónico en `brand/{slug}/brand-book/visual-identity/{kind}/{id}/meta.json`.
- Extrae `od_artifact_id` original.

### 2. Disparar refinement
```http
POST ${OD_DAEMON_URL}/api/chat
{
  "projectId": "<od-project-id>",
  "mode": "refine",
  "artifactId": "<od_artifact_id>",
  "instruction": "<instruction>",
  "scope": "<scope>"
}
```

OD detecta capacidades del CLI subyacente:
- Claude Code → tool loop nativo, edita región específica.
- Codex / API fallback → regenera el archivo con constraint "only change element X".

### 3. Consumir SSE
Mismo modelo que `od-generate`. Reportar progreso al thread MC.

### 4. Versión nueva
- OD escribe el artifact refinado en `.od/artifacts/{id}_v{N}/`.
- Crea diff visible (HTML side-by-side) en el thread.

### 5. Aprobación humana
- El usuario decide en el editor (iframe OD) si aprueba o descarta.
- Si aprueba → la versión nueva sustituye al artifact canónico (mismo path, sobreescribe).
  - El artifact viejo queda como histórico en `.od/artifacts/{id}/` (no se borra).
  - `meta.json` canónico actualiza: `version`, `last_refined_at`, `refine_history` array.
- Si descarta → no se promociona. Queda solo en `.od/artifacts/{id}_v{N}/`.

## Reglas

1. **Sin artifact_id existente, falla.** Esta skill no genera desde cero — eso es `od-generate`.
2. **Single-shot.** No conversación libre. Una instrucción → una versión.
3. **Aprobación explícita.** Nunca sustituye canónico sin aprobación del humano.
4. **Histórico siempre preservado.** Cada `.od/artifacts/{id}_v{N}/` queda en disco para auditoría.

## Referencias
- Endpoint mode `refine`: `/Users/ragi/open-design/docs/architecture.md` §4 (data flow)
- Comment overlay: `/Users/ragi/open-design/docs/architecture.md` §3.1
