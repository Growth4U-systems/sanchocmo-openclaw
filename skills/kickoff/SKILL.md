---
name: kickoff
description: "Sesión de intake rápida (~30 min) que genera los cimientos mínimos viables para un cliente. Modo URL (95%): scrape web + sociales → pre-fill → validar → completar gaps. Modo manual (5%): preguntas conversacionales. Produce UN único archivo company-brief.current.md con secciones H2: Company Identity, Business Model, Budget & Resources, Self Intelligence L1, Market Intelligence L1, Brand Voice Snapshot, Niche / ECPs. Es el primer skill que se ejecuta para cualquier cliente nuevo. Absorbe: sancho-start, company-context, business-model-audit, budget-constraints, brand-voice Quick, self-intelligence Lens 1, market-intelligence L1, niche-discovery básico."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '3.1'
  system: SanchoCMO
  phase: Foundation
  pillar: company-brief
  layer: '0'
  updated: '2026-06-12'
  changes: |
    v3.1 — SAN-3: regla de ejecución explícita — el Kickoff DEBE escribir el fichero con la
           Write tool (no solo imprimirlo en el chat) y actualizar foundation-state; escribe el
           draft pronto y re-escribe al validar. Antes la skill se quedaba conversando sin persistir.
    v3.0 — SAN-3 W4: renombrado fast-foundation→kickoff; output fastcontext→company-brief/company-brief.current.md;
           absorbe company-context/business-model/budget (retiradas).
    v2.0 — SAN-13: FF escribe UN único archivo `fastcontext/fastcontext.current.md`
           (grounding desechable, secciones H2). NO toca ninguna carpeta de pilar.
           Las skills full lo leen como seed opcional. Archivos lite por pilar retirados.
    v1.1 — Outputs lite se guardaban en archivos por pilar (nunca `{carpeta}.current.md`).
           Evitaba path collision con skills Full Foundation (self-intelligence,
           market-intelligence, brand-voice, niche-discovery-100x, etc.).
           `{carpeta}.current.md` quedaba reservado para outputs full.
    v1.0 — Merge de 8 skills en 1 sesión de intake unificada.
context_required: []
context_writes:
- brand/{slug}/company-brief/company-brief.current.md
---

# Kickoff — Intake Rápido

> Una sesión. Una URL. Un documento de grounding base. Todo lo que necesitas para empezar a ejecutar.

**Input**: URL del sitio web (o conversación manual si no hay URL)
**Output**: `brand/{slug}/company-brief/company-brief.current.md` (grounding inicial desechable)
**Duración**: ~30 minutos
**Thread**: `{slug}:kickoff`

---

## ⛔ Contrato de estado (LEER ANTES DE ESCRIBIR NADA)

El dashboard, el Brand Brain y las APIs de foundation **solo leen** `brand/{slug}/foundation-state.json` en el **schema canónico v3.0**:

```
{ "version": "3.0", "sections": { "<section>": { "pillars": { "<pillar>": { "status", "output_file" } } } }, "brand_summary": {...} }
```

Si el estado no tiene `sections[*].pillars[*].output_file`, **la marca queda invisible en la UI aunque los `.md` existan en disco**. Por eso:

1. **Kickoff tiene PROHIBIDO tocar carpetas de pilares analíticos** — las rutas `market-and-us/`, `brand-voice/`, `go-to-market/` y análogas son territorio exclusivo de las skills Full Foundation. Kickoff opera únicamente bajo `brand/{slug}/company-brief/`.
2. Kickoff produce **un único** `company-brief/company-brief.current.md` (+ versionado `company-brief.v{N}.md` + `history.json`), con secciones H2.
3. La sección de estado `company-brief` tiene **un solo pilar** `company-brief` cuyo `output_file` es `brand/{slug}/company-brief/company-brief.current.md`. Lo mantiene el `foundation-orchestrator`.
4. Si se corrió en otro schema, recuperá con `scripts/rebuild-foundation-state.mjs <slug> --apply`.

---

## 🚨 Regla de ejecución (NO negociable)

El Kickoff produce un **fichero en disco**, no un mensaje de chat. El brief que generes
**no cuenta** hasta que exista `brand/{slug}/company-brief/company-brief.current.md`.

- **USA TU HERRAMIENTA DE ESCRITURA (Write) para crear el fichero.** Imprimir el brief en
  la conversación **NO lo persiste**: el dashboard y el Brand Brain leen el disco, no el
  chat. Si solo lo escribes en el chat, el pilar se queda en 0% y el cliente no ve nada.
- **Escribe el draft en cuanto tengas las secciones rellenas** (tras el scrape en modo URL,
  o tras las preguntas en modo manual). NO esperes a una validación "perfecta": el Company
  Brief es **vivo y provisional** (nunca source of truth) → se escribe pronto y se
  **re-escribe** al refinar. Validar viene DESPUÉS de tener el draft en disco, no antes.
- Tras escribir, **actualiza `foundation-state.json`**:
  `sections["company-brief"].pillars["company-brief"].status = "generated"` y
  `output_file = "brand/{slug}/company-brief/company-brief.current.md"`. Así el dashboard lo
  muestra como generado / pendiente de revisión.
- El Kickoff **NO está completo** —y **NO ofrezcas avanzar a Full Foundation**— hasta que el
  fichero exista en disco y el estado esté actualizado. "Lo tengo redactado en el chat" ≠ completado.

---

## Dos modos de entrada

### Modo URL (95% de los casos)
El usuario introduce la URL de su web en el dashboard. El skill:
1. Scrapea homepage, about, pricing, producto, blog (3-5 posts)
2. Revisa perfiles sociales (LinkedIn, Twitter/X, Instagram)
3. Pre-rellena las secciones del company-brief con lo que encuentra
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
2. Genera `company-brief.current.md` desde las respuestas

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

**1c. Pre-fill secciones**
Con lo extraído, pre-rellenar las secciones H2 de `company-brief.current.md`:
- Company Identity: identidad, producto, modelo de negocio estimado
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

> Para entonces el **draft ya está escrito en disco** (ver "🚨 Regla de ejecución"). Validar
> sirve para refinar y **re-escribir**, no es un requisito previo a crear el fichero.

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

### Step 5: Escribir `company-brief.current.md` (con tu Write tool)

> **Regla de paths (v3.0 / SAN-3)**: Kickoff escribe SIEMPRE y SOLO a
> `brand/{slug}/company-brief/company-brief.current.md`. NUNCA toca carpetas de pilares analíticos.

**Esto NO es opcional ni "más tarde": usa tu herramienta de escritura para crear el fichero
AHORA.** Idealmente ya escribiste el draft tras el Step 1 (ver "🚨 Regla de ejecución"); aquí
lo confirmas o lo re-escribes con lo validado, y actualizas el `status` en foundation-state.json.
Si terminas el turno sin que el fichero exista en disco, el Kickoff ha FALLADO.

Un único archivo con secciones H2. Header obligatorio, luego las secciones:

```markdown
# Company Brief — {Cliente}
<!-- mode: grounding | source: kickoff -->
<!-- Company Brief inicial desechable. NUNCA source of truth. Se refina al avanzar la Foundation. -->

## Company Identity
## Business Model
## Budget & Resources
## Self Intelligence L1
## Market Intelligence L1
## Brand Voice Snapshot
## Niche / ECPs
```

Versionado (mismo patrón que las skills de pilar):
- **Primera corrida** (no existe `company-brief/`): crear `company-brief/company-brief.current.md` + `company-brief/company-brief.v1.md` (copia idéntica) + `company-brief/history.json` con una entrada inicial.
- **Re-corrida** (ya existe): copiar la actual a `company-brief/company-brief.v{N+1}.md`, sobrescribir `company-brief/company-brief.current.md`, y añadir la entrada a `history.json`.

`history.json` = lista de `{ "version": N, "date": "YYYY-MM-DD", "note": "..." }`.

### Step 6: Resumen & Siguiente Paso

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ KICKOFF — Completado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Company Brief  ✅ brand/{slug}/company-brief/company-brief.current.md (grounding inicial)

Siguiente paso: Full Foundation. Las skills full leen company-brief.current.md como
seed opcional (si no existe, corren standalone). Las skills full escriben en sus
propias carpetas de pilar con {carpeta}.current.md como fuente de verdad.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Contenido de cada sección H2

Las secciones siguientes describen qué va en cada H2 de `company-brief.current.md`.
Las skills full leen estas secciones como grounding opcional antes de profundizar.

### `## Company Identity`

- The Core Three: quién eres, qué vendes, a quién
- Elevator pitch (2-3 frases)
- Producto/servicio principal + diferenciadores
- Historia y contexto (año fundación, hitos)
- Equipo (tamaño, roles clave)
- URLs y perfiles sociales
- Fuentes por campo (extracted from URL, user input, etc.)

### `## Business Model`

- Clasificación: B2B/B2C/Hybrid + modelo de revenue
- Growth motion: Sales-Led, Marketing-Led, Product-Led, Community-Led
- Funnel actual mapeado (etapas, conversiones conocidas)
- Unit economics básicos (si disponibles): ACV, churn estimado, LTV estimado
- Canales actuales de adquisición

### `## Budget & Resources`

- Presupuesto mensual marketing (rango)
- Timeline: horizonte para primeros resultados
- Equipo: quién está disponible, horas/semana
- Herramientas actuales (CRM, analytics, ads, etc.)
- Constraints: lo que NO se puede hacer

### `## Self Intelligence L1`

Solo Lens 1 (autopercepción). Formato detallado en la sección "Self Intelligence L1 — Solo Lens 1" más abajo.

### `## Market Intelligence L1`

- Tamaño y tendencias principales del sector (búsqueda rápida, NO deep dive)
- Posición estimada en el mercado (por lo que sabemos de competidores)
- Regulación relevante si aplica

### `## Brand Voice Snapshot`

Quick snapshot. Formato detallado en la sección "Brand Voice Snapshot — Formato Quick" más abajo.

### `## Niche / ECPs`

- 2-3 ECPs preliminares (Extreme Customer Profiles)
- Para cada ECP: dolor principal, cómo busca solución, dónde está
- Sin validación exhaustiva — primer mapa

---

## Brand Voice Snapshot — Formato de la sección H2

El contenido siguiente va en la sección `## Brand Voice Snapshot` de `company-brief.current.md`:

```markdown
## Brand Voice Snapshot
<!-- mode: grounding | source: kickoff -->

### Tres Adjetivos
[adj1], [adj2], [adj3]

### Espectro de Tono
Formal ◻◻◼◻◻ Casual
Técnico ◻◼◻◻◻ Simple
Serio ◻◻◻◼◻ Playful

### Patrones Detectados
- **Vocabulario**: [palabras frecuentes, jerga del sector]
- **POV**: [1a persona plural / 3a persona / directo al usuario]
- **Ritmo**: [frases cortas / largas / mixto]

### Do / Don't
| Do | Don't |
|----|-------|
| [patrón positivo 1] | [patrón a evitar 1] |
| [patrón positivo 2] | [patrón a evitar 2] |
| [patrón positivo 3] | [patrón a evitar 3] |

### Ejemplos por Canal
- **Social**: "[ejemplo de post]"
- **Email**: "[ejemplo de subject + primer párrafo]"
- **Landing**: "[ejemplo de headline + CTA]"
```

---

## Self Intelligence L1 — Formato de la sección H2

El contenido siguiente va en la sección `## Self Intelligence L1` de `company-brief.current.md`:

```markdown
## Self Intelligence L1
<!-- mode: grounding | source: kickoff -->

### Lo que dicen de sí mismos
- **Web**: [resumen de messaging en homepage/about]
- **LinkedIn**: [bio, descripción, tono de posts]
- **Twitter/X**: [bio, tono, temas]
- **Instagram**: [bio, estética, temas]

### Assets Encontrados
| Asset | Canal | Estado |
|-------|-------|--------|
| [blog] | Web | [activo/inactivo] |
| [newsletter] | Email | [existe/no] |
| [perfil LinkedIn] | Social | [seguidores, frecuencia] |

### Positioning Declarado
- **Tagline**: "[lo que dicen en la web]"
- **UVP implícita**: "[lo que parece ser su propuesta]"
- **Tono general**: [profesional/casual/técnico/etc.]

### Gaps para Full Foundation
- Lens 2 (percepción terceros): pendiente
- Lens 3 (percepción clientes): pendiente
```

---

## Cross-Pillar Data Flow

```
KICKOFF genera company-brief.current.md (grounding inicial desechable)
    ↓ seed opcional ↓
FULL FOUNDATION lee company-brief.current.md y profundiza en sus propias carpetas:
  market-intelligence   ← lee § Market Intelligence L1, amplía con 3+ fuentes
  competitor-intelligence ← nuevo (no hay sección en company-brief)
  self-intelligence     ← lee § Self Intelligence L1, añade Lens 2 + Lens 3
  brand-voice           ← lee § Brand Voice Snapshot, genera Full Guide + AI Brand Kit
  niche-discovery-100x  ← lee § Niche / ECPs, valida con 100+ empresas
```

Si `company-brief.current.md` no existe, las skills full corren standalone sin seed.

---

## Almacenamiento

`company-brief.current.md` se guarda con versionado estándar:
```
brand/{slug}/company-brief/
├── company-brief.current.md      ← versión activa (grounding inicial)
├── company-brief.v{N}.md         ← snapshot de cada regeneración
└── history.json                  ← log de versiones
```

Las carpetas de pilar analíticas (`market-and-us/`, `brand-voice/`, `go-to-market/`) son propiedad exclusiva de las skills Full Foundation y sus orquestadores. Kickoff nunca escribe en ellas.

---

## Edge Cases

### Pre-launch (sin URL, sin clientes, sin revenue)
- Modo manual obligatorio
- Budget: puede ser 0 — registrar como constraint en `## Budget & Resources`
- Self Intelligence L1: no hay web que analizar → skip, marcar como pendiente en `## Self Intelligence L1`
- Brand Voice: Path B (5 Quick Questions) en vez de scrape → resultado en `## Brand Voice Snapshot`
- Niche Discovery: basado en hipótesis del fundador → resultado en `## Niche / ECPs`

### Multi-producto
- Elegir el producto/servicio estrella para Foundation
- Registrar los otros como contexto futuro en `## Company Identity`

### URL pero web muy básica (1 pager, under construction)
- Scrape lo que haya
- Complementar con modo manual para gaps
- Marcar `## Self Intelligence L1` como "baja confianza"
