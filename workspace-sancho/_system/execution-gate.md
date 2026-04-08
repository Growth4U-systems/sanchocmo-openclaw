# Execution Gate — Protocol

> Regla global: cualquier acción de ejecución pasa primero por Strategic Plan.

## Aplica a

Todas las skills de fase "Execution" — trust-engine, content generation, outreach, bots, etc.
NO aplica a: Foundation skills, Strategic Plan itself, diagnostics, conversación normal.

## Regla

Cuando el usuario pide ejecutar algo que genera trabajo (contenido, audit, outreach, etc.):

1. **¿Hay proyecto activo para esto?**
   - Escanear `brand/{slug}/projects/P*/project.json`
   - Proyecto activo = mismo tipo + status "active"

2. **SI hay proyecto activo** → ejecutar dentro de ese proyecto
   - Usar el project_id y discord_thread_id del proyecto
   - Reportar progreso en el hilo del proyecto

3. **SI NO hay proyecto** → delegar a Strategic Plan
   - Strategic Plan evalúa alineación con el plan actual:
     - **SÍ alineado** → "Encaja con tu plan. Lo creo como P{XX}."
     - **PARCIAL** → "Tiene sentido pero tienes P{XX} abiertos. ¿Primero terminar esos?"
     - **NO alineado** → "No está en tu plan. ¿Lo añadimos? Implica desviar foco de [objetivos]."
   - Esperar confirmación del usuario
   - Strategic Plan crea proyecto + hilo Discord
   - Luego ejecutar el skill dentro del proyecto creado

## Excepciones

- Si el usuario dice explícitamente "sin proyecto" o "rápido" → ejecutar sin proyecto pero avisar que los resultados no quedarán trackeados.
- Foundation skills NO pasan por este gate (tienen su propio flujo).
- Preguntas de diagnóstico rápido ("¿cómo está mi SEO?") NO necesitan proyecto — solo ejecución que requiere trabajo significativo.
