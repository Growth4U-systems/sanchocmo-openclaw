# Dispatch Bot — SanchoCMO

Bot de Discord (discord.js v14) que automatiza el dispatch de tareas desde **#campaigns** a los canales de agentes especializados.

## Flujo

1. Sancho publica un brief en `#campaigns` con formato estándar
2. Alfonso (o Sancho) reacciona con ✅
3. El bot parsea el brief → extrae tipo, agente, deadline
4. Crea un thread en el canal del agente destino (via `dispatch-map.json`)
5. Confirma en `#campaigns` con link al thread

## Formato de brief esperado

```
**Tipo**: seo-content
**Agente**: El Redactor
**Deadline**: 2026-03-01

## Brief
Escribir artículo sobre X con keywords Y, Z...
```

## Setup

```bash
cp .env.template .env
# Editar .env con el token del bot y ajustar si es necesario
npm install
```

## Ejecución

```bash
# Directo
node index.js

# Con PM2
pm2 start ecosystem.config.js
pm2 logs dispatch-bot
pm2 stop dispatch-bot
```

## Mapeo tipo → canal

El bot lee `dispatch-map.json` (raíz del workspace de Sancho) para resolver qué persona maneja cada tipo de tarea, y luego mapea persona → canal de Discord:

| Persona | Canal |
|---------|-------|
| explorador | #prospecting |
| redactor | #content |
| comunicador | #content |
| creativo | #creative |
| amplificador | #paid-ads |
| conector | #partners |
| comercial | #prospecting |
| arquitecto | #web |
| investigador | #research |

## Logs

Con PM2, los logs van a `./logs/`. Sin PM2, stdout/stderr.
