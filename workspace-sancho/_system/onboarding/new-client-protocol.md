# Protocolo: Crear Nuevo Cliente

> Este protocolo es OBLIGATORIO cuando alguien pide crear un cliente nuevo.
> NUNCA improvisar. NUNCA crear estructura de brand a mano. SIEMPRE seguir estos pasos.

## Flujo Completo

### Paso 1: Recopilar datos mínimos
Preguntar (si no los dan):
- **Nombre del cliente** (ej: "Masabo")
- **Slug** (ej: "masabo" — minúsculas, sin espacios, guiones permitidos)

### Paso 2: Crear el cliente desde Mission Control
Como admin, en Mission Control → **New client**, cargar slug + nombre.
Esto:
- ✅ Registra el cliente en `config/clients.json` (con su `mcToken`)
- ✅ Crea la carpeta base `brand/{slug}/`

> No se necesita Discord ni Guild ID. Discord es un canal de comunicación
> opcional que se configura aparte (ver canales en MC → Settings).

### Paso 3: Correr Foundation (lo hace Sancho por chat)
Desde el chat del cliente, pedirle a Sancho que corra **Fast Foundation** y
luego la **Full Foundation**. Las skills de foundation se auto-bootstrappean:

- ✅ El `foundation-orchestrator` crea/actualiza `brand/{slug}/foundation-state.json`
  (schema v3.0) si no existe.
- ✅ Cada skill crea su sub-árbol de carpetas y su `current.md` a medida que
  produce output (`regenerate.py` persiste el estado).

### Paso 4: Verificar
1. Confirmar que el cliente aparece en `clients.json` y en Mission Control.
2. Tras correr Fast Foundation, confirmar que `brand/{slug}/foundation-state.json`
   existe y que los pilares se ven en el Brand Brain de MC.

### Paso 5: Reportar resultado
Informar al usuario con:
- ✅ Qué se creó
- 📁 Ruta del brand dir
- 🔗 Link de MC
- ⚠️ Cualquier error o paso manual pendiente

## Lo que NUNCA debes hacer
- ❌ Crear estructura de `brand/` a mano (la generan las skills de foundation)
- ❌ Inventar un `foundation-state.json` con schema propio (lo mantiene el
  `foundation-orchestrator`, schema v3.0)
- ❌ Inventar procesos que no están aquí

## Scripts/Skills relacionados
- Mission Control → **New client** — registra el cliente + carpeta base
- skill `fast-foundation` / `foundation-orchestrator` — scaffolding + estado
- `scripts/regenerate.py` — regenerar Mission Control / persistir estado
- `scripts/rebuild-foundation-state.mjs <slug> --apply` — recuperar
  `foundation-state.json` v3.0 desde los docs en disco (fallback)
