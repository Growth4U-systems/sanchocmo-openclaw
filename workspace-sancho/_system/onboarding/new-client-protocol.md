# Protocolo: Crear Nuevo Cliente

> Este protocolo es OBLIGATORIO cuando alguien pide crear un cliente nuevo.
> NUNCA improvisar. NUNCA crear estructura de brand a mano. SIEMPRE seguir estos pasos.

## Flujo Completo

### Paso 1: Recopilar datos mínimos
Preguntar (si no los dan):
- **Nombre del cliente** (ej: "Example")
- **Slug** (ej: "example" — minúsculas, sin espacios, guiones permitidos)

### Paso 2: Crear el cliente desde Mission Control
Como admin, en Mission Control → **New client**, cargar slug + nombre.
Esto:
- ✅ Registra el cliente en `config/clients.json` (con su `mcToken`)
- ✅ Crea la carpeta base `brand/{slug}/`

> No se necesita Discord ni Guild ID. Discord es un canal de comunicación
> opcional que se configura aparte (ver canales en MC → Settings).

### Paso 3: Correr Foundation (lo hace Sancho por chat)
Desde el chat del cliente, pedirle a Sancho que corra el **Kickoff** y
luego la **Full Foundation**. Las skills de foundation se auto-bootstrappean:

- ✅ El status de cada pilar vive en su task 1:1 (proyectos P00); el
  `foundation-orchestrator` lo mantiene vía `POST /api/brand-brain/pillar-status`.
- ✅ Cada skill crea su sub-árbol de carpetas y su `current.md` a medida que
  produce output.

### Paso 4: Verificar
1. Confirmar que el cliente aparece en `clients.json` y en Mission Control.
2. Tras correr el Kickoff, confirmar que los pilares se ven en el Brand Brain
   de MC (`GET /api/brand-brain/state?slug={slug}`).

### Paso 5: Reportar resultado
Informar al usuario con:
- ✅ Qué se creó
- 📁 Ruta del brand dir
- 🔗 Link de MC
- ⚠️ Cualquier error o paso manual pendiente

## Lo que NUNCA debes hacer
- ❌ Crear estructura de `brand/` a mano (la generan las skills de foundation)
- ❌ Escribir el status de pilares a mano en JSONs (el status vive en tasks;
  usar `POST /api/brand-brain/pillar-status` con vocabulario canónico)
- ❌ Inventar procesos que no están aquí

## Scripts/Skills relacionados
- Mission Control → **New client** — registra el cliente + carpeta base
- skill `kickoff` / `foundation-orchestrator` — scaffolding + estado
- `scripts/regenerate.py` — regenerar Mission Control (legacy mc-data; no toca status)
