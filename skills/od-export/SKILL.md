---
name: od-export
description: |
  Exportar un artifact existente a formato consumible (HTML self-contained, PDF, PPTX, ZIP, MP4).
  Llama al export pipeline del daemon de OD. Output va a brand/{slug}/brand-book/visual-identity/exports/.
  Triggers: "exportar a PDF", "descargar plantilla", "convertir a PPTX", "generar ZIP del proyecto".
metadata:
  layer: "5"
  pillar: "brand"
  agent: "maese-pedro"
  workspace: "workspace-maese-pedro"
  type: "wrapper"
  wraps_endpoint: "POST /api/artifacts/save (con format)"
  daemon_url_env: "OD_DAEMON_URL"
  version: "1.0"
triggers:
  - "exportar"
  - "descargar plantilla"
  - "convertir a pdf"
  - "convertir a pptx"
  - "od-export"
inputs:
  - name: brand_slug
    type: string
    required: true
  - name: artifact_id
    type: string
    required: true
  - name: format
    type: string
    required: true
    description: "html | pdf | pptx | zip | mp4 | md"
outputs:
  primary: export_file
  canonical_path: "brand/{slug}/brand-book/visual-identity/exports/{artifact_id}.{format}"
context_required:
  - brand/{slug}/.od/artifacts/{artifact_id}/ o brand/{slug}/brand-book/visual-identity/{kind}/{id}/
context_writes:
  - brand/{slug}/brand-book/visual-identity/exports/{artifact_id}.{format}
  - meta.json adyacente (created_by, created_at, source_artifact_id, format)
---

# od-export — exportar artifact a formato final

> Convierte un artifact en un archivo consumible (HTML inline-assets, PDF print-aware, PPTX, ZIP, MP4 motion graphic).

## Pipeline de export (en daemon OD)

| Format | Cómo | Notas |
|---|---|---|
| `html` | Inline CSS + data: URIs para assets | Self-contained, abrible offline |
| `pdf` | Puppeteer `page.pdf()` | Print-aware, tamaños A4/Letter/custom |
| `pptx` | Skills tipo deck producen `slides.json` → `pptxgenjs` | Solo aplica a artifacts deck-shape |
| `zip` | `archiver` sobre `.od/artifacts/{id}/` | Incluye source HTML + assets |
| `mp4` | HyperFrames pipeline (HTML→MP4) | Solo aplica a artifacts con motion |
| `md` | Copia raw si artifact es markdown | O render via skill-defined |

## Workflow

### 1. Validar
- Artifact existe en `.od/artifacts/{id}/` o canónico.
- Format soportado para ese tipo de artifact (consultar `meta.json.kind`).

### 2. Disparar export
```http
POST ${OD_DAEMON_URL}/api/artifacts/save
{
  "artifactId": "<id>",
  "format": "<format>",
  "destination": "brand/{slug}/brand-book/visual-identity/exports/{id}.{format}"
}
```

### 3. Esperar completion
Daemon emite SSE con progreso. Al terminar, verificar archivo escrito en path destino.

### 4. Escribir meta.json
Adyacente al export:
```json
{
  "created_by": "maese-pedro",
  "created_at": "<iso>",
  "source_artifact_id": "<id>",
  "format": "<format>",
  "task_id": "<task_id>"
}
```

## Reglas

1. **Solo formatos compatibles con el artifact.** No exportar PPTX desde un mockup imagen.
2. **Path canónico siempre `exports/`.** No exportar a sitios random.
3. **Reportar size del archivo final.** Si > 50 MB, advertir al usuario.

## Referencias
- Export pipeline: `/Users/ragi/open-design/docs/architecture.md` §3.7
- HyperFrames: `/Users/ragi/open-design/skills/` (buscar skills con kind=motion)
