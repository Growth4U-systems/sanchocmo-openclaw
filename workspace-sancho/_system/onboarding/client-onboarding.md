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

**👉 `https://discord.com/oauth2/authorize?client_id={BOT_CLIENT_ID}&permissions=8&integration_type=0&scope=bot`**

> ⚠️ Reemplazar `{BOT_CLIENT_ID}` con el valor de `_system/instance.json → discord.bot_client_id`.
> `new-client.sh --help` muestra el link correcto automáticamente.

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
- Crea `foundation-state.json` v2.0 con 4 secciones (company-brief, market-and-us, go-to-market, brand-identity)
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
| OAuth Bot | Dinámico — ver `instance.json → discord.bot_client_id` |
| Supabase | Dinámico — ver `instance.json → supabase.url` |
| Mission Control | Dinámico — ver `instance.json → mc_base_url` |
| Docs (público) | Dinámico — ver `instance.json → mc_base_url` + `/docs/` |
