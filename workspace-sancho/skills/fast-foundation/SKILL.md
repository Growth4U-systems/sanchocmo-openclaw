---
name: fast-foundation
description: "Sesión de intake rápida (~30 min) que genera los cimientos mínimos viables para un cliente. Modo URL (95%): scrape web + sociales → pre-fill → validar → completar gaps. Modo manual (5%): preguntas conversacionales. Produce 5 docs lite: Company Brief, Self Intelligence L1, Market Intelligence L1, Brand Voice Snapshot, Niche Discovery básico. Es el primer skill que se ejecuta para cualquier cliente nuevo. Absorbe: sancho-start, company-context, business-model-audit, budget-constraints, brand-voice Quick, self-intelligence Lens 1, market-intelligence L1, niche-discovery básico."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Foundation
  pillar: fast-foundation
  layer: '0'
  updated: '2026-03-27'
  changes: v1.0 — Merge de 8 skills en 1 sesión de intake unificada.
context_required: []
context_writes:
- brand/{slug}/company-brief/current.md
- brand/{slug}/market-and-us/self/current.md
- brand/{slug}/market-and-us/market/current.md
- brand/{slug}/brand-voice/current.md
- brand/{slug}/go-to-market/ecps/current.md
---

# Fast Foundation — Intake Rápido

> Una sesión. Una URL. Cinco documentos base. Todo lo que necesitas para empezar a ejecutar.

**Input**: URL del sitio web (o conversación manual si no hay URL)
**Output**: 5 docs lite en las carpetas del cliente
**Duración**: ~30 minutos
**Thread**: `{slug}:fast-foundation`

---

## Dos modos de entrada

### Modo URL (95% de los casos)
El usuario introduce la URL de su web en el dashboard. El skill:
1. Scrapea homepage, about, pricing, producto, blog (3-5 posts)
2. Revisa perfiles sociales (LinkedIn, Twitter/X, Instagram)
3. Pre-rellena los 5 documentos con lo que encuentra
4. Presenta al usuario para validar y completar gaps

### Modo Manual (5% — sin URL)
Para empresas pre-lanzamiento o sin presencia web:
1. 6 preguntas conversacionales (heredado de sancho-start):
   - Paso 1: ¿Qué hace tu empresa?
   - Paso 2: ¿Qué producto/servicio quieres impulsar?
   - Paso 3: ¿Quién es tu cliente ideal?
   - Paso 4: ¿Quiénes son tus competidores?
   - Paso 5: ¿Qué presupuesto y equipo tienes?
   - Paso 6: ¿Qué has probado antes en marketing?
2. Genera los 5 docs lite desde las respuestas

---

## Flujo de Ejecución

### Step 0: Detectar modo
```
if URL proporcionada:
    mode = "URL"
    → Step 1: Scrape & Infer
elif usuario dice "no tengo web" / "pre-lanzamiento":
    mode = "MANUAL"
    → Step 1b: Preguntas conversacionales
```

### Step 1: Scrape & Infer (Modo URL)

**1a. Scrape web**
- Homepage: nombre, tagline, producto principal, CTA
- About: misión, equipo, historia
- Pricing: modelo, tiers, value metric
- Producto: features, beneficios, casos de uso
- Blog (3-5 posts): temas, tono, frecuencia
- Footer: links sociales, legal, dirección
- Meta tags: title, description, keywords, OG

**1b. Scrape sociales**
- LinkedIn empresa: descripción, sector, tamaño, seguidores, últimos posts
- Twitter/X: bio, tono, frecuencia, engagement
- Instagram: bio, estética, frecuencia, engagement

**1c. Pre-fill documentos**
Con lo extraído, pre-rellenar:
- Company Brief: identidad, producto, modelo de negocio estimado
- Self Intelligence L1: qué dicen de sí mismos, assets encontrados, tono
- Brand Voice Snapshot: patrones de voz (tono, vocabulario, POV, ritmo)

### Step 1b: Preguntas Conversacionales (Modo Manual)

Una pregunta a la vez. Tono CMO cercano. Follow-up si respuesta vaga (max 1).

1. **La Empresa**: "¿Qué hace tu empresa? Cuéntamelo como se lo dirías a alguien en un café."
2. **El Producto**: "¿Qué producto o servicio específico quieres impulsar ahora mismo?"
3. **El Cliente Ideal**: "¿Quién es tu cliente ideal? Piensa en tu mejor cliente actual."
4. **Los Competidores**: "¿Quiénes son tus principales competidores?"
5. **Recursos**: "¿Qué presupuesto y equipo tienes para marketing?"
6. **Historial**: "¿Qué has probado antes en marketing? Lo que funcionó y lo que no."

### Step 2: Validar & Completar Gaps

Presentar lo inferido agrupado (NO campo por campo):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 COMPANY BRIEF — Lo que he encontrado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 Empresa: [nombre] — [tagline]
📦 Producto: [descripción corta]
💼 Modelo: [B2B/B2C] — [SaaS/Services/etc.]
🎯 Cliente ideal: [inferido o "necesito que me cuentes"]
💰 Presupuesto: [inferido o "necesito que me cuentes"]

¿Esto es correcto? ¿Qué falta o está mal?
```

**Gaps a completar siempre** (si no se infirieron):
- The Core Three: ¿Quién eres? ¿Qué vendes? ¿A quién?
- Modelo de negocio: B2B/B2C, cómo monetiza
- Budget: rango mensual, equipo disponible
- Competidores: al menos 2-3 nombres
- Objetivo principal a 3-6 meses

### Step 3: Market Intelligence L1 (búsqueda rápida)

Con el contexto validado:
1. Búsqueda rápida del sector: tamaño mercado, tendencias principales, regulación relevante
2. Posición estimada en el mercado (por lo que sabemos de competidores)
3. NO deep dive — solo datos básicos para orientar

### Step 4: Niche Discovery Básico

De la conversación y el scraping:
1. Identificar 2-3 ECPs preliminares (Extreme Customer Profiles)
2. Para cada ECP: dolor principal, cómo buscan solución, dónde están
3. NO validación exhaustiva — es un primer mapa

### Step 5: Generar 5 Docs Lite

Escribir los 5 documentos en sus carpetas:

| Doc | Path | Contenido |
|-----|------|-----------|
| Company Context (standalone) | `brand/{slug}/company-context/current.md` | Identidad — fuente de verdad de company-context skill |
| Business Model (standalone) | `brand/{slug}/business-model/current.md` | Modelo — fuente de verdad de business-model-audit skill |
| Budget & Resources (standalone) | `brand/{slug}/budget/current.md` | Resources — fuente de verdad de budget-constraints skill |
| Company Brief (merge view) | `brand/{slug}/company-brief/current.md` | Vista consolidada auto-regenerada de los 3 standalones. Warning header: `<!-- DO NOT EDIT — auto-generated -->`. |
| Self Intelligence L1 | `brand/{slug}/market-and-us/self/current.md` | Lens 1 only: autopercepción (web, sociales, assets). Header: `<!-- mode: lite | source: fast-foundation -->` |
| Market Intelligence L1 | `brand/{slug}/market-and-us/market/current.md` | Datos básicos del mercado. Header: `<!-- mode: lite | source: fast-foundation -->` |
| Brand Voice Snapshot | `brand/{slug}/brand-voice/current.md` | Quick snapshot: 3 adjetivos, espectro formal↔casual, Do/Don't (3+ pares), ejemplos (3 canales). Header: `<!-- mode: quick | source: fast-foundation -->` |
| Niche Discovery | `brand/{slug}/go-to-market/ecps/current.md` | 2-3 ECPs preliminares con dolores y canales. Header: `<!-- mode: lite | source: fast-foundation -->` |

**Headers `<!-- mode: lite -->` son importantes**: los skills de Full Foundation los leen para saber que hay un doc lite que ampliar (hydration).

### Step 6: Resumen & Siguiente Paso

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ FAST FOUNDATION — Completada
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Company Context     ✅ brand/{slug}/company-context/current.md (standalone)
📋 Business Model      ✅ brand/{slug}/business-model/current.md (standalone)
📋 Budget & Resources  ✅ brand/{slug}/budget/current.md (standalone)
📋 Company Brief       ✅ brand/{slug}/company-brief/current.md (merge view auto-generated)
🔍 Self Intelligence   ✅ brand/{slug}/market-and-us/self/current.md (L1)
📊 Market Intelligence ✅ brand/{slug}/market-and-us/market/current.md (L1)
🎨 Brand Voice         ✅ brand/{slug}/brand-voice/current.md (Snapshot)
👥 Niche Discovery     ✅ brand/{slug}/go-to-market/ecps/current.md (básico)

Siguiente paso: Full Foundation para profundizar en cada pilar.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Company Brief — Arquitectura "standalone + merge view"

### Principio

Cada una de las 3 skills (company-context, business-model-audit, budget-constraints) es **standalone autoritativa** sobre su propio doc:
- `brand/{slug}/company-context/current.md` ← fuente de verdad de company-context
- `brand/{slug}/business-model/current.md` ← fuente de verdad de business-model-audit
- `brand/{slug}/budget/current.md` ← fuente de verdad de budget-constraints

Cada una versiona (`v{N}.md` + `history.json`) **por separado** — permite re-correr una sin afectar a las otras.

### Merge view

`brand/{slug}/company-brief/current.md` es una **vista consolidada auto-regenerada** de los 3 standalones. NO es editable a mano (se sobreescribe en cada regeneración).

**Quién regenera el merge view:**
1. **fast-foundation** al final del flujo inicial (después de los 3 intakes)
2. **Cada skill productora** al final de su step 6 (cuando se re-corre standalone)

**Formato del merge view:**
```markdown
# Company Brief — {Cliente}
<!-- auto-generated from: company-context/, business-model/, budget/ -->
<!-- DO NOT EDIT HERE — edits will be overwritten on next regeneration -->
<!-- regenerated: YYYY-MM-DD by {skill-name} -->

## Company Identity
{contenido de company-context/current.md, sin frontmatter}

## Business Model
{contenido de business-model/current.md, o placeholder "_pendiente — correr business-model-audit_"}

## Budget & Resources
{contenido de budget/current.md, o placeholder "_pendiente — correr budget-constraints_"}
```

**Por qué este diseño:**
- Permite correr cada skill standalone con versionado granular propio
- Los consumers que necesitan info parcial leen el standalone directamente (`company-context/`)
- Los consumers que necesitan la foto completa leen el merge view (`company-brief/`)
- No duplica información canónica — el merge view es view, no storage

### Contenido de cada standalone

**company-context/current.md** (Identity)
- The Core Three: quién eres, qué vendes, a quién
- Elevator pitch (2-3 frases)
- Producto/servicio principal + diferenciadores
- Historia y contexto (año fundación, hitos)
- Equipo (tamaño, roles clave)
- URLs y perfiles sociales
- Fuentes por campo (extracted from URL, user input, etc.)

**business-model/current.md** (Model)
- Clasificación: B2B/B2C/Hybrid + modelo de revenue
- Growth motion: Sales-Led, Marketing-Led, Product-Led, Community-Led
- Funnel actual mapeado (etapas, conversiones conocidas)
- Unit economics básicos (si disponibles): ACV, churn estimado, LTV estimado
- Canales actuales de adquisición

**budget/current.md** (Resources)
- Presupuesto mensual marketing (rango)
- Timeline: horizonte para primeros resultados
- Equipo: quién está disponible, horas/semana
- Herramientas actuales (CRM, analytics, ads, etc.)
- Constraints: lo que NO se puede hacer

---

## Brand Voice Snapshot — Formato Quick

```markdown
# Brand Voice — Quick Snapshot
<!-- mode: quick | source: fast-foundation -->

## Tres Adjetivos
[adj1], [adj2], [adj3]

## Espectro de Tono
Formal ◻◻◼◻◻ Casual
Técnico ◻◼◻◻◻ Simple
Serio ◻◻◻◼◻ Playful

## Patrones Detectados
- **Vocabulario**: [palabras frecuentes, jerga del sector]
- **POV**: [1a persona plural / 3a persona / directo al usuario]
- **Ritmo**: [frases cortas / largas / mixto]

## Do / Don't
| Do | Don't |
|----|-------|
| [patrón positivo 1] | [patrón a evitar 1] |
| [patrón positivo 2] | [patrón a evitar 2] |
| [patrón positivo 3] | [patrón a evitar 3] |

## Ejemplos por Canal
- **Social**: "[ejemplo de post]"
- **Email**: "[ejemplo de subject + primer párrafo]"
- **Landing**: "[ejemplo de headline + CTA]"
```

---

## Self Intelligence L1 — Solo Lens 1

```markdown
# Self Intelligence — Lens 1: Autopercepción
<!-- mode: lite | source: fast-foundation -->

## Lo que dicen de sí mismos
- **Web**: [resumen de messaging en homepage/about]
- **LinkedIn**: [bio, descripción, tono de posts]
- **Twitter/X**: [bio, tono, temas]
- **Instagram**: [bio, estética, temas]

## Assets Encontrados
| Asset | Canal | Estado |
|-------|-------|--------|
| [blog] | Web | [activo/inactivo] |
| [newsletter] | Email | [existe/no] |
| [perfil LinkedIn] | Social | [seguidores, frecuencia] |

## Positioning Declarado
- **Tagline**: "[lo que dicen en la web]"
- **UVP implícita**: "[lo que parece ser su propuesta]"
- **Tono general**: [profesional/casual/técnico/etc.]

## Gaps para Full Foundation
- Lens 2 (percepción terceros): pendiente
- Lens 3 (percepción clientes): pendiente
```

---

## Cross-Pillar Data Flow

```
FAST FOUNDATION genera docs lite
    ↓ hydration ↓
FULL FOUNDATION lee docs lite y profundiza:
  market-intelligence   ← lee market L1, amplía con 3+ fuentes
  competitor-intelligence ← nuevo (no hay lite)
  self-intelligence     ← lee Self L1, añade Lens 2 + Lens 3
  brand-voice           ← lee Snapshot, genera Full Guide + AI Brand Kit
  niche-discovery-100x  ← lee ECPs básicos, valida con 100+ empresas
```

---

## Almacenamiento

Cada doc se guarda con versionado estándar:
```
brand/{slug}/{carpeta}/
├── current.md      ← versión activa
├── v1.md           ← primera versión (= fast-foundation output)
└── history.json    ← log de versiones
```

---

## Edge Cases

### Pre-launch (sin URL, sin clientes, sin revenue)
- Modo manual obligatorio
- Budget: puede ser 0 — registrar como constraint
- Self Intelligence L1: no hay web que analizar → skip, marcar como pendiente
- Brand Voice: Path B (5 Quick Questions) en vez de scrape
- Niche Discovery: basado en hipótesis del fundador

### Multi-producto
- Elegir el producto/servicio estrella para Foundation
- Registrar los otros como contexto futuro

### URL pero web muy básica (1 pager, under construction)
- Scrape lo que haya
- Complementar con modo manual para gaps
- Marcar Self Intelligence L1 como "baja confianza"
