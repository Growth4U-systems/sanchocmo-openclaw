---
name: od-list-skills
description: |
  Listar el catálogo completo de skills upstream de Open Design (130+ skills). Devuelve metadata
  (id, name, description, mode, design_system requirements). Usado por la sección Media Creation
  de MC para mostrar la "Open Design Library" + por od-generate para validar que upstream_skill existe.
metadata:
  layer: "5"
  pillar: "brand"
  agent: "maese-pedro"
  workspace: "workspace-maese-pedro"
  type: "wrapper"
  wraps_endpoint: "GET /api/skills"
  daemon_url_env: "OD_DAEMON_URL"
  version: "1.0"
triggers:
  - "listar skills de open design"
  - "qué skills hay disponibles"
  - "od-list-skills"
inputs:
  - name: filter
    type: string
    required: false
    description: "Filtro por nombre o descripción (substring match)."
  - name: mode
    type: string
    required: false
    description: "Filtro por mode (design-system | prototype | deck | etc.)."
outputs:
  primary: skills_list (JSON)
  format: |
    [
      {
        "id": "linkedin-quote",
        "name": "LinkedIn Quote",
        "description": "...",
        "mode": "...",
        "designSystemRequires": false,
        "filePath": "/Users/ragi/open-design/skills/linkedin-quote/SKILL.md"
      },
      ...
    ]
context_writes: []
---

# od-list-skills — listar catálogo upstream de Open Design

> Devuelve la lista completa de skills disponibles en el repo OD instalado localmente. Cada item incluye `filePath` absoluto para que la UI de MC linkee directamente al SKILL.md en disco.

## Workflow

### 1. Health check
```bash
curl ${OD_DAEMON_URL:-http://localhost:7456}/api/health
```
Si falla → error claro "OD daemon offline".

### 2. Llamar endpoint
```http
GET ${OD_DAEMON_URL}/api/skills?filter=<filter>&mode=<mode>
```

### 3. Enriquecer con paths absolutos
El daemon devuelve metadata. Para cada skill, añadir `filePath` resolviéndolo desde `${OD_REPO_PATH:-/Users/ragi/open-design}/skills/{id}/SKILL.md`.

### 4. Devolver JSON
La UI de MC usa esto para:
- Renderizar grid de cards en "Open Design Library → Skills".
- Validar que `upstream_skill` de `od-generate` existe.

## Reglas

1. **Read-only.** Esta skill no escribe nada.
2. **Cache razonable.** El daemon cachea internamente; MC puede cachear 5 min sin problema.
3. **Path absoluto siempre.** Para que el panel Settings → Skills muestre links clicables.

## Referencias
- Endpoint: `/Users/ragi/open-design/docs/architecture.md` §7
- Upstream skills source: `/Users/ragi/open-design/skills/`
