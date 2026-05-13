---
name: od-list-design-systems
description: |
  Listar los design systems brand-grade de Open Design (71+ DESIGN.md de marcas reconocibles:
  airbnb, apple, claude, canva, coinbase, brutalism, claymorphism, etc.). Cada uno con paleta,
  tipografías, layout. Usado por la sección Media Creation para mostrar "Open Design Library →
  Design Systems" y para que od-generate aplique uno como starter.
metadata:
  layer: "5"
  pillar: "brand"
  agent: "maese-pedro"
  workspace: "workspace-maese-pedro"
  type: "wrapper"
  wraps_endpoint: "GET /api/design-systems"
  daemon_url_env: "OD_DAEMON_URL"
  version: "1.0"
triggers:
  - "listar design systems"
  - "qué design systems hay"
  - "od-list-design-systems"
inputs:
  - name: filter
    type: string
    required: false
    description: "Filtro por nombre."
outputs:
  primary: design_systems_list (JSON)
  format: |
    [
      {
        "id": "claude",
        "name": "Claude",
        "description": "...",
        "filePath": "/Users/ragi/open-design/design-systems/claude/DESIGN.md",
        "swatchColors": ["#hex1", "#hex2", ...]
      },
      ...
    ]
context_writes: []
---

# od-list-design-systems — catálogo de design systems upstream

> Lista los DESIGN.md de los 71+ design systems brand-grade que vienen con Open Design. Disponibles para aplicar a una generación como "starter" o como referencia visual.

## Workflow

### 1. Llamar endpoint
```http
GET ${OD_DAEMON_URL}/api/design-systems?filter=<filter>
```

Si el endpoint devuelve 0 (no expone los upstream by default), fallback: leer filesystem directamente desde `${OD_REPO_PATH}/design-systems/` (cada subcarpeta = un design system con `DESIGN.md`).

### 2. Enriquecer con metadata visual
Para cada design system, parsear su `DESIGN.md` y extraer:
- `swatchColors`: array de hex codes principales (Background, Surface, Accent).
- `displayFont`, `bodyFont`: nombres de fuentes.
- `mood`: tag descriptivo.

Esto permite renderizar cards visuales con preview de paleta + tipo en la UI.

### 3. Devolver lista
Cada item incluye `filePath` absoluto al `DESIGN.md` del design system.

## Uso desde MC

- Sección Media Creation → tab "Open Design Library → Design Systems":
  - Grid de cards con swatch colors + nombre + sample tipográfico.
  - CTA "Usar en este brand" → dispara task type=media con `od-generate` aplicando ese design system.
  - Click en path → abre el `DESIGN.md` upstream en VS Code.

## Reglas

1. **Read-only.** No escribe.
2. **Cache 5 min.** Catálogo cambia raramente.
3. **Path absoluto siempre.**

## Referencias
- Design systems source: `/Users/ragi/open-design/design-systems/`
- Schema DESIGN.md: `/Users/ragi/open-design/docs/design-systems.md`
