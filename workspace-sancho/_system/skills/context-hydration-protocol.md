# Context Hydration Protocol

> Antes de preguntar, lee. Antes de leer, mapea. Antes de generar, confirma.

**Version:** 1.0 (Mar 2, 2026)
**For:** Toda skill que tenga `context_required` en su YAML
**Apply:** SIEMPRE como Step 0, antes de cualquier pregunta al usuario

---

## Principio

Ninguna skill debería preguntar algo que otra skill ya capturó. Los datos fluyen downstream por el DAG de Foundation. Cada skill hereda lo que ya existe y solo pregunta lo genuinamente nuevo.

---

## Step 0: Context Hydration (obligatorio)

### 0.1 — Leer upstream docs

```
Para cada archivo en context_required:
  1. Leer el archivo (ej: brand/{slug}/company-brief/company-brief.current.md, brand/{slug}/market-and-us/*.md)
  2. Si no existe → degradar gracefully (ver Pattern 5 del skill-communication-protocol)
  3. Si existe → extraer campos según el hydration_map de esta skill

Nota: en Foundation v2.0 los docs están en 4 secciones:
  - company-brief/     → company-brief.current.md (§ Company Identity, § Business Model, § Budget)
  - market-and-us/     → market-analysis.md, competitor-{x}.md, self-analysis.md, swot.md
  - go-to-market/      → ecps.md, positioning-{ecp}.md, pricing.md
  - brand-identity/    → voice-profile.md, visual-identity.md
```

### 0.2 — Pre-rellenar campos

Cada skill define un `hydration_map` en su SKILL.md o en `references/hydration.md`:

```yaml
hydration_map:
  # source_file.field → this_skill.field
  company-brief.b2b_b2c → b2b_b2c              # exacto (from § Company Identity)
  company-brief.team_size → team_structure       # inferir (from § Company Identity)
  company-brief.goal_3_6_months → timeline       # interpretar (from § Business Model)
  company-brief.budget_monthly → budget_range    # exacto (from § Budget & Resources)
```

Tipos de mapeo:
- **exacto**: campo idéntico, copiar directo
- **inferir**: campo relacionado, derivar (ej: team_size=3 → team_structure=small_team)
- **interpretar**: campo que da contexto pero necesita pregunta específica

### 0.3 — Presentar al usuario

Agrupar datos pre-rellenados y presentar:

```
"De [company-context] ya tengo esto:
  • B2B/B2C: B2B ✅
  • Equipo: 3 personas ✅
  • Revenue model: Suscripción ✅
  • Ticket medio: €X ✅

¿Correcto? ¿Quieres ajustar algo?

Lo que me falta (nuevo para esta skill):
  • Presupuesto mensual de marketing
  • Herramientas que usáis
  • ..."
```

### 0.4 — Solo preguntar gaps

Preguntar SOLO los campos que:
1. No existen en ningún doc upstream
2. Necesitan más detalle que lo upstream capturó
3. El usuario indicó que quiere actualizar

---

## Reglas

1. **NUNCA re-preguntar un campo exacto** que ya existe upstream con status "approved"
2. **Campos inferidos**: presentar la inferencia y pedir confirmación, no re-preguntar desde cero
3. **Freshness check**: si el doc upstream tiene >30 días, flaggear: "Esto viene de hace X días, ¿sigue vigente?"
4. **Override explícito**: si el usuario da un valor diferente, usar el nuevo y notar la discrepancia
5. **Documento hydration en output**: incluir sección `## Datos heredados` con fuente de cada campo pre-rellenado

---

## Formato del hydration_map

Cada skill que implementa hydration debe tener un archivo `references/hydration.md` con:

```markdown
# Hydration Map — [skill-name]

## Fuentes upstream

| Doc upstream | Campo upstream | → Campo esta skill | Tipo mapeo | Notas |
|-------------|---------------|-------------------|------------|-------|
| company-brief (§ Company Identity) | b2b_b2c | b2b_b2c | exacto | |
| company-brief (§ Company Identity) | team_size | team_structure | inferir | 1→founder_only, 2-5→small_team, etc |
| company-brief (§ Business Model) | revenue_model | revenue_model | exacto | Sección dentro del mismo doc |

## Campos genuinamente nuevos (siempre preguntar)

| Campo | Por qué no existe upstream | Pregunta sugerida |
|-------|--------------------------|-------------------|
| budget_monthly_range | Ningún pilar previo captura esto | "¿Cuánto invertís en marketing/mes?" |
```

---

## Anti-patterns

```
❌ Leer company-context y luego preguntar "¿B2B o B2C?"
❌ Tener datos de team_size=3 y preguntar "¿Quién se encarga del marketing?"
❌ Ignorar upstream y arrancar con lista de preguntas completa
❌ Pre-rellenar sin mostrar al usuario (no transparency)

✅ Leer, mapear, presentar, confirmar, preguntar solo gaps
✅ "De tu perfil veo que sois B2B con equipo de 3. Lo que necesito saber es..."
✅ Flaggear datos viejos: "Esto es de hace 45 días, ¿sigue vigente?"
```

---

## Implementación por skill

Cada skill modifica su flujo de ejecución:

**Antes:**
```
Step 1: Preguntar Block 1
Step 2: Preguntar Block 2
...
```

**Después:**
```
Step 0: Context Hydration (leer upstream → mapear → presentar → confirmar)
Step 1: Preguntar SOLO campos nuevos del Block 1
Step 2: Preguntar SOLO campos nuevos del Block 2
...
```

El Step 0 es universal. Los steps siguientes se adaptan per-skill según su hydration_map.
