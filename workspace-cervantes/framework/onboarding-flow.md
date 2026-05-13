# Onboarding Flow

## Flujo de 6 Minutos

1. Cliente crea servidor Discord desde template (14 canales listos)
2. Cliente invita al bot via OAuth URL
3. Admin ejecuta `new-client.sh --slug X --name Y --guild Z`
4. Script crea: `brand/{slug}/`, foundation-state.json, integrations.json
5. Script inserta cliente en Supabase (multi-tenant)
6. Script actualiza clients.json, regenera MC (data en memory/mc/)

## Recursos

- **Plantilla Discord**: Template con 14 canales pre-configurados
- **OAuth Bot**: URL con permissions=8, integration_type=0, scope=bot
- **Script**: `new-client.sh` en workspace-sancho/scripts/
- **Procedimiento**: `workspace-sancho/_system/client-onboarding.md`

## Post-Onboarding

- Config guild en openclaw.json (14 channel overrides con systemPrompts)
- Gateway restart para aplicar config
- Sancho arranca en #onboarding con sancho-start skill (conversacional)

## Notas

- `new-client.sh` NO configura openclaw.json automáticamente (pendiente)
- Guild faltante en openclaw.json = error silencioso más común. Brand dir puede existir pero si la guild no está en config, Sancho no responde. Siempre verificar ambos.
