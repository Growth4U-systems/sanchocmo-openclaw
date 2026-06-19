# HTML Canonical Protocol

> Estándar de sistema para los documentos HTML "bonitos" generados con la skill `html-output` (SAN-149). Define cuándo generar HTML y la convención de canónico.

## Los tres tipos de documento

| Tipo | Skill | Cuándo |
|------|-------|--------|
| Presentación HTML | `frontend-slides` / `niche-presentation` | El usuario pide "presentación", "deck", "slides" |
| Documento HTML | `html-output` | El usuario pide "en HTML", "documento bonito", "informe/report para el cliente", o el deliverable es largo y presentable |
| Markdown | (cualquier skill) | Fuente de trabajo; outputs internos y agente↔agente |

## Convención de canónico (sibling .html)

- El HTML se escribe **junto al `.md` con el mismo basename**: `current.md` → `current.html`, `swot.current.md` → `swot.current.html`.
- Cuando existe el sibling `.html`, ese fichero es el **documento canónico**: Mission Control lo abre por defecto, lo comparte con el cliente (share link) y le aplica la capa de comentarios (SAN-148). El `.md` queda como **fuente** editable.
- Contenido nacido en chat sin `.md` previo → generar AMBOS ficheros (`.md` + `.html`).
- Regenerar = sobreescribir el mismo path `.html`. Sin sufijos de versión.

## Reglas para agentes

1. **Si editas un `.md` que tiene sibling `.html`, regenera el `.html`** en la misma sesión (skill `html-output`). Un HTML desactualizado es peor que no tener HTML.
2. Cuando el usuario pide "hazlo en HTML" / "documento bonito" → ejecutar `html-output` sobre el doc. La conversión de un doc existente la hace su **agente autor** (el del thread de la task/pilar) — mismo principio que el loop review-comments. Maese Pedro (owner de la skill) solo entra cuando el contenido nace sin doc/task detrás.
3. El tema visual se resuelve sin preguntar: explícito en mensaje → design system del brand (`brand-book/visual-identity/`) → visual identity (`brand-identity/visual-identity/visual-identity.current.md`) → default Sancho (Parchment + Tinta).
4. NO inyectar scripts de comentarios en el HTML — la capa de comentarios la añade Mission Control al servir el documento compartido.
5. Presentaciones siguen su propio protocolo (`presentation-summary-protocol.md`) y viven en `brand/{slug}/presentations/` — NO usan la convención sibling.
