# Wildcard Routing

> Árbol de decisión: cuándo Sancho Manager maneja una petición vs la delega a otro skill.
> El Manager es el branch "else" — todo lo que no rutea a un skill específico aterriza aquí.

---

## Árbol de decisión

```
Petición del usuario llega:

1. ¿Involucra Foundation? (crear/completar/revisar pilares)
   SÍ → foundation-orchestrator
   NO → continuar

2. ¿Pide crear un plan estratégico completo desde cero?
   SÍ → strategic-plan (Mode INIT)
   NO → continuar

3. ¿Pide un nuevo ciclo estratégico? (nuevos objetivos, re-planificar)
   SÍ → strategic-plan (Mode UPDATE → Nuevo ciclo)
   NO → continuar

4. ¿Matchea con un skill específico de ejecución?
   (keyword-research, seo-content, company-finder, direct-response-copy, etc.)
   SÍ y es una tarea puntual → ejecutar ese skill directamente
   SÍ pero es parte de algo más grande → sancho-manager (descomponer en proyecto)
   NO → continuar

5. ¿Es gestión de proyecto existente?
   (status, add task, reorder, value review, close)
   SÍ → sancho-manager (Mode PROJECT)

6. ¿Es una petición multi-step que requiere organización?
   SÍ → sancho-manager (Mode GENERAL)

7. ¿Pide status general cross-project?
   SÍ → sancho-manager (Mode STATUS)

8. ¿Es conversacional / pregunta simple / 1-turn?
   SÍ → Sancho responde directamente (sin skill)
```

---

## Señales de que es para Sancho Manager

| Señal | Ejemplo | Modo |
|-------|---------|------|
| Verbo de organización | "organiza", "planifica", "desglosa", "break down" | GENERAL |
| Objetivo multi-paso | "quiero lanzar un podcast", "necesito una estrategia de contenido" | GENERAL |
| Referencia a proyecto | "añade tarea a P03", "status de P01" | PROJECT |
| Pregunta de prioridad | "¿qué hago primero?", "¿qué es más urgente?" | STATUS |
| Value review | "P01 está terminado", "revisemos resultados de P02" | PROJECT |
| Creación explícita | "crea un proyecto para X", "necesito un proyecto nuevo" | GENERAL |

## Señales de que NO es para Sancho Manager

| Señal | Ejemplo | Skill correcto |
|-------|---------|----------------|
| Pide pilar Foundation | "hazme el company brief" | foundation-orchestrator |
| Plan desde cero | "crea mi plan estratégico" | strategic-plan (INIT) |
| Tarea puntual con skill claro | "escribe un artículo SEO sobre X" | seo-content (directo) |
| Research puntual | "investiga a mi competidor X" | competitor-intelligence |
| Conversación | "¿cómo funciona Meta Ads?" | Respuesta directa |
| Bug / soporte | "no funciona el bot" | Cervantes |

---

## Regla de prioridad

Cuando hay ambigüedad entre Manager y otro skill:

1. **Si es multi-step** → Manager (descompone en proyecto, luego delega)
2. **Si es single-step y el skill existe** → Skill directo
3. **Si no hay skill claro** → Manager

El Manager NUNCA ejecuta tareas directamente. Siempre estructura y delega a los skills de ejecución.
