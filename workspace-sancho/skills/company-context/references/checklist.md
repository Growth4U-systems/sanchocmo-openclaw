# Company Context — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Step 1: Inferencia Autónoma

- [ ] **URL analizada** (homepage, about, producto, pricing, footer, meta tags)
- [ ] **Perfiles sociales analizados** (LinkedIn, Twitter/X, Instagram, otros)
- [ ] **Documentos existentes revisados** (pitch deck, brand guide, estrategia previa)
- [ ] **Cobertura pre-fill calculada** con % y fuente por campo

## Step 2: Validación

- [ ] **Perfil presentado al usuario** agrupado (no campo a campo)
- [ ] **Confianza marcada** por campo (✅ alta, ⚠️ media, vacío desconocido)
- [ ] **Correcciones del usuario incorporadas**

## Step 3: Completar Gaps

- [ ] **Elevator pitch** capturado (qué hacen, en una frase)
- [ ] **Resultado deseado 3-6 meses** documentado (goals)
- [ ] **Diferenciador** articulado (qué os diferencia)
- [ ] **Modelo de revenue** identificado (suscripción, transacción, etc.)
- [ ] **B2B/B2C/Hybrid** clasificado
- [ ] **Ticket medio y LTV** estimados (o marcados como desconocidos)
- [ ] **Canales actuales de adquisición** mapeados
- [ ] **Volumen de clientes/leads** documentado (mensual)
- [ ] **Visión 3 años** capturada
- [ ] **Valores de marca / pilares** articulados
- [ ] **Constraints / non-negotiables** documentados

## Output: Context Profile

- [ ] **Profile Summary generado** (3 párrafos: qué hacen, estado actual, dónde quieren ir)
- [ ] **Lite criteria met**: Core Three + URL + Business model + 1 goal
- [ ] **Cada campo tiene fuente** (extracted from X, user confirmed, etc.)
- [ ] **Edge cases manejados** (pre-launch, pivot, multi-product)

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/company-context/current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada dato tiene fuente inline** (URL, user input, documento)
- [ ] **0 datos inventados** — todo rastreable
- [ ] **Coherencia interna** (elevator pitch alineado con producto, goals con modelo de negocio)
- [ ] **Pregunta "por qué"** explicada para cada pregunta al usuario
- [ ] **Tono conversacional** mantenido (no formulario)

---

## Flujo de uso

```
1. Agente ejecuta Step 1 (inferencia autónoma)
2. Presenta perfil pre-filled (Step 2)
3. Completa gaps con usuario (Step 3)
4. Al terminar, lee este checklist
5. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica o no disponible (con razón)
   - ❌ = falta — volver a investigar/preguntar
6. Si hay ❌ → completar antes de entregar
7. SOLO ENTONCES guardar y entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
