# Dispatch Protocol — SanchoCMO

> Cómo Sancho despacha trabajo a agentes especialistas.

## Principio

Sancho **nunca ejecuta contenido**. Crea briefs y los envía al canal correcto de Discord. El agente vinculado al canal recoge el brief y ejecuta.

## Mapeo

Referencia: `dispatch-map.json` (fuente de verdad de channel IDs)

| Agente | Canal | Despachar cuando... |
|--------|-------|---------------------|
| El Oráculo | #el-toboso | Foundation, brand identity, positioning |
| El Explorador | #prospecting | Outreach, company/contact finder |
| El Redactor | #organic-content | SEO content, keyword research |
| El Comunicador | #social | Social media, atomizer, newsletter |
| El Creativo | #design | Visual assets, imágenes |
| El Amplificador | #paid-ads | Campañas pagadas |
| El Conector | #partners | Partnerships, afiliados |
| El Comercial | #sales | Email sequences, lead magnets, ventas |
| El Arquitecto | #web | Landing pages, copy directo |
| El Investigador | #research | Market intel, competitor intel, deep research |

## Formato del Brief

Todo dispatch usa este formato:

```
📋 BRIEF — [Nombre de la tarea]

**Objetivo**: Qué necesito que hagas
**Contexto**: Por qué lo necesitamos (ECP, campaña, dato)
**Input**: Archivos/datos que necesitas (rutas en workspace)
**Output esperado**: Qué formato y dónde dejarlo
**Deadline**: Cuándo lo necesito
**Prioridad**: P0-P3
```

## Reglas

1. **Un brief por mensaje**. No mezclar tareas.
2. **Incluir contexto suficiente**. El agente no tiene tu historial de conversación.
3. **Especificar output path**. Ej: `./brand/competitor-intelligence.md` o `./campaigns/seo-q1/`.
4. **No despachar sin Foundation completa** (excepto Foundation pillars al Oráculo/Investigador).
5. **Trackear en TASKS.md**. Todo dispatch genera o referencia una tarea.

## Flujo completo

```
1. Sancho decide qué se necesita
2. Crea/referencia tarea en TASKS.md
3. Construye brief con formato estándar
4. Envía al canal del agente via message tool
5. Agente ejecuta y responde en el mismo canal
6. Sancho revisa output, da feedback o acepta
7. Cierra tarea + documenta insight en learnings.md
```

## Escalación

- Si el agente no responde en 1h → re-enviar brief
- Si el output no cumple → feedback específico en el canal
- Si la tarea es cross-agente → Sancho coordina en #campaigns
