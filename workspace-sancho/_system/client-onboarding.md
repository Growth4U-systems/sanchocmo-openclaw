# Client Onboarding — Procedimiento

## Prerequisitos
- Cuenta de Supabase activa (proyecto compartido)
- Bot SanchoCMO corriendo

## Paso 1: Discord Server (el cliente)

El cliente crea su servidor de Discord desde nuestra plantilla:

**👉 https://discord.new/mnXBVkNQqFBk**

Esto crea automáticamente todos los canales y categorías estándar de SanchoCMO.

## Paso 2: Añadir Bot (el cliente)

El cliente añade el bot a su servidor:

**👉 https://discord.com/oauth2/authorize?client_id=1475635406610628769&permissions=8&integration_type=0&scope=bot**

## Paso 3: Configurar OpenClaw (Cervantes)

1. Obtener el **Guild ID** del nuevo servidor Discord
2. Ejecutar `new-client.sh` con los datos del cliente:

```bash
bash ~/.openclaw/workspace-sancho/scripts/new-client.sh \
  --slug "nuevo-cliente" \
  --name "Nombre del Cliente" \
  --guild "GUILD_ID"
```

Esto hace:
- Crea carpeta `brand/{slug}/`
- Crea `foundation-state.json` con 15 pilares en `not-started`
- Crea `integrations.json` vacío
- Inserta cliente en Supabase (`clients` table)
- Añade guild + channel bindings a `openclaw.json`
- Añade systemPrompts con contexto del cliente a todos los canales

## Paso 4: Gateway Restart (Cervantes)

```bash
openclaw gateway restart
```

## Paso 5: Verificar (Cervantes)

- Bot responde en #general del nuevo servidor
- Foundation pillars visibles en MC
- Sancho conoce el contexto del cliente

## URLs de Onboarding

| Qué | URL |
|-----|-----|
| Plantilla Discord | https://discord.new/mnXBVkNQqFBk |
| OAuth Bot | https://discord.com/oauth2/authorize?client_id=1475635406610628769&permissions=8&integration_type=0&scope=bot |
| Supabase | https://psapmujzxhaxraphddlv.supabase.co |
| Mission Control | https://sancho-cmo.taild48df2.ts.net/mc |
| Docs (público) | https://sancho-cmo.taild48df2.ts.net:8443/mc/docs/ |
