# Client Onboarding — Procedimiento

## Prerequisitos
- SanchoCMO corriendo (gateway + Mission Control)
- Acceso admin a Mission Control

## Paso 1: Crear el cliente desde Mission Control

Como admin, en Mission Control → **New client**, cargar:
- **Slug** (minúsculas, números, guiones)
- **Nombre** del cliente

Esto registra el cliente en `config/clients.json` (con su `mcToken`) y crea la
carpeta base `brand/{slug}/`. No se necesita Discord ni Guild ID.

## Paso 2: Correr Foundation (Sancho, por chat)

Desde el chat del cliente, pedirle a Sancho que corra **Fast Foundation** y luego
la **Full Foundation**. Las skills hacen el scaffolding y el estado:

- El `foundation-orchestrator` crea `brand/{slug}/foundation-state.json`
  (schema v3.0) si no existe.
- Cada skill crea su sub-árbol de carpetas y su `current.md` a medida que produce
  output.

## Paso 3: Verificar

- El cliente aparece en `clients.json` y en Mission Control.
- Tras Fast Foundation, los pilares se ven en el Brand Brain de MC.
- Sancho conoce el contexto del cliente.

## Comunicación (opcional)

Discord y Slack son canales opcionales. Se configuran aparte (MC → Settings →
APIs / canales). La interfaz primaria es el chat de Mission Control.

## URLs

| Qué | URL |
|-----|-----|
| Mission Control | Dinámico — ver `instance.json → mc_base_url` |
| Docs (público) | Dinámico — ver `instance.json → mc_base_url` + `/docs/` |
