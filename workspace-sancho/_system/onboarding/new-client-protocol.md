# Protocolo: Crear Nuevo Cliente

> Este protocolo es OBLIGATORIO cuando alguien pide crear un cliente nuevo desde #nuevo-cliente.
> NUNCA improvisar. NUNCA crear servidores Discord manualmente. SIEMPRE seguir estos pasos.

## Flujo Completo

### Paso 1: Recopilar datos mínimos
Preguntar (si no los dan):
- **Nombre del cliente** (ej: "Masabo")
- **Slug** (ej: "masabo" — minúsculas, sin espacios, guiones permitidos)
- **Guild ID** del servidor Discord del cliente

### Paso 2: Discord Server (lo hace el CLIENTE, no tú)
El cliente debe:
1. Crear servidor desde plantilla: `https://discord.new/9nbefJmU7YKy`
2. Añadir bot: `https://discord.com/oauth2/authorize?client_id={BOT_CLIENT_ID}&permissions=8&integration_type=0&scope=bot` (leer `BOT_CLIENT_ID` de `config/instance.json → discord.bot_client_id`)

⚠️ Si el cliente NO tiene servidor todavía:
- Envíale los dos links de arriba
- Pídele el Guild ID cuando lo tenga
- **NO crees tú el servidor**

### Paso 3: Ejecutar `new-client.sh`
```bash
bash ~/.openclaw/workspace-sancho/scripts/new-client.sh \
  --slug "<slug>" \
  --name "<nombre>" \
  --guild "<guild_id>"
```

Este script hace TODO automáticamente:
- ✅ Crea `brand/{slug}/` con toda la estructura de carpetas
- ✅ Crea `foundation-state.json` v2.0
- ✅ Crea `integrations.json`
- ✅ Inserta en Supabase
- ✅ Actualiza `clients.json`
- ✅ Regenera Mission Control (`regenerate.py`)
- ✅ Auto-bind Discord channels + systemPrompts (`auto-bind.py`)
- ✅ Aplica restricciones de seguridad (tools.deny)
- ✅ Reinicia gateway

### Paso 4: Verificar
Después del script:
1. Confirmar que el bot responde en #general del nuevo servidor
2. Confirmar que `brand/{slug}/foundation-state.json` existe
3. Confirmar que aparece en `clients.json`

### Paso 5: Reportar resultado
Informar al usuario con:
- ✅ Qué se creó
- 📁 Ruta del brand dir
- 🔗 Link de MC (si aplica)
- ⚠️ Cualquier error o paso manual pendiente

## Lo que NUNCA debes hacer
- ❌ Crear un servidor Discord tú mismo
- ❌ Crear canales Discord manualmente
- ❌ Editar `openclaw.json` manualmente (lo hace auto-bind.py)
- ❌ Saltar pasos del script
- ❌ Crear estructura de brand/ a mano (lo hace new-client.sh)
- ❌ Inventar procesos que no están aquí

## Scripts relacionados
- `scripts/new-client.sh` — Onboarding completo
- `scripts/auto-bind.py` — Bind channels + systemPrompts
- `scripts/create-client-crons.sh` — Crons per-client (post-onboarding)
- `scripts/regenerate.py` — Regenerar Mission Control
