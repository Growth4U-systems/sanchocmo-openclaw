# Budget & Constraints — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Block 1: Budget Range

- [ ] **Inversión mensual actual en marketing** capturada (o confirmado que es 0)
- [ ] **Rango de presupuesto** clasificado (< 1K, 1-5K, 5-15K, 15-50K, > 50K)
- [ ] **Split por categoría** documentado (ads/herramientas/personas) o marcado "unstructured"
- [ ] **Flexibilidad** determinada (techo fijo vs flexible si hay resultados)
- [ ] **Benchmark del sector** ofrecido como contexto (si relevante)

## Block 2: Tiempo & Personas

- [ ] **Equipo de marketing** identificado (interno, freelancers, agencia, solo fundador)
- [ ] **Horas semanales** estimadas para marketing (total y por persona)
- [ ] **Capacidad de creación de contenido** evaluada (escribir, diseñar, video)
- [ ] **Timeline** establecido (short < 30d, medium 1-3m, long 3-6m+)
- [ ] **Expectativas de resultados** alineadas con timeline

## Block 3: Tool Stack

- [ ] **Herramientas actuales listadas** (todas las que usan)
- [ ] **Categorización completa** (Analytics, CRM, Email, Social, Ads, Automation, Content, SEO)
- [ ] **Gaps identificados** con impacto (qué falta y qué bloquea)
- [ ] **Solapamientos detectados** (3+ tools en misma categoría → flag)

## Output: Budget Constraints Profile

- [ ] **Summary generado** (presupuesto, equipo, timeline, stack, implicación)
- [ ] **Implicación estratégica** escrita (1 frase: qué significa para la estrategia)
- [ ] **Lite criteria met**: budget range + timeline + team hours + tools listed
- [ ] **Edge cases manejados** (zero budget, huge budget no team, tool mess)

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/budget/budget-current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada dato tiene fuente** (user input, inferred, estimated)
- [ ] **0 datos inventados** — todo rastreable
- [ ] **Coherencia** con company-context (modelo de negocio alineado con budget)
- [ ] **Tono no-judgment** mantenido (todo presupuesto es válido)
- [ ] **Posibilidades enmarcadas** (no limitaciones: "con X, podemos hacer Y")

---

## Flujo de uso

```
1. Agente ejecuta los 3 bloques de conversación
2. Al terminar, lee este checklist
3. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica o no disponible (con razón)
   - ❌ = falta — volver a preguntar
4. Si hay ❌ → completar antes de entregar
5. SOLO ENTONCES guardar y entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
