---
name: pov-bank-builder
description: "Builds and refreshes the POV Bank (point-of-view database) for a brand. Synthesizes brand-voice + content-pillars + clarify-history into per-pillar opinions: core beliefs, what we say yes/no to, preferred angles, and evidence we cite. Used by idea-builder to derive non-generic, brand-aligned angle drafts."
context_required:
- brand/{slug}/content/content-pillars.md
- brand/{slug}/brand-voice/brand-voice.current.md
- brand/{slug}/company-brief/company-brief.current.md
context_optional:
- brand/{slug}/content/clarify-history.json
- brand/{slug}/content/idea-queue.json
- brand/{slug}/content/pov-bank.json
context_writes:
- brand/{slug}/content/pov-bank.json
- brand/{slug}/content/pov-bank-history.json
---

# POV Bank Builder

> Genera la BD de puntos de vista del cliente, **opinión por pillar**.
> Es la fuente que `idea-builder` consulta para producir angle_drafts
> diferenciados (no genéricos).

El POV Bank no es brand-voice (eso es tono/estilo). Es **lo que pensamos**
sobre cada pillar: las posturas, los frames preferidos, lo que NO diríamos,
y la evidencia que solemos citar.

## ⚠️ Prerequisite check (ANTES de ejecutar)

Esta skill SOLO debe ejecutarse si **content-strategy** + **content-pillars** ya se completaron en este brand:

1. Lee `brand/{slug}/projects/P14-Content-Engine/tasks.json`
2. Verifica que existen y están `status: completed`:
   - La task con `skill: "content-strategy"` (P14-T01)
   - La task con `skill: "content-pillars"` (P14-T02)
3. Si alguna NO está completed:
   - **NO ejecutes la skill**
   - Responde al humano:
     > "❌ Pre-requisito no cumplido: la task **{taskId} ({skill})** está en `status: {status}`. El POV Bank se construye DESPUÉS de tener strategy + pillars aprobados, porque el POV es por pillar y se ancla en el posicionamiento. Completa primero esa task y vuelve."
   - Termina sin escribir nada
4. Si ambas completed → continúa con el workflow abajo
5. **Recordatorio importante**: este skill se ejecuta ANTES de `content-engine-setup`. Los configs (news prompts, perfiles, keywords, cadencia) deben estar alineados con el POV — por eso el POV se decide primero.

## Schema de pov-bank.json

```json
{
  "version": 2,
  "global": {
    "one_liner": "We design growth systems your team can keep running after we leave.",
    "villain": "The 18-month agency retainer that produces no compound asset",
    "voice_traits": ["plain-spoken", "data-driven", "founder-empathetic"]
  },
  "pov_per_pillar": {
    "P1": {
      "pillar_name": "Sistemas de Growth Repetibles",
      "core_belief": "Growth is a system, not a sequence of tactics. Every startup needs a 90-day runway plan with an exit date.",
      "we_say_yes_to": [
        "Frameworks que sobrevivan al cambio de CMO",
        "Storytelling con números (CAC, LTV, payback)",
        "Founder-led hasta 50 personas"
      ],
      "we_say_no_to": [
        "Hype tactics ('this 1 hack')",
        "Vanity metrics",
        "Eternal retainers"
      ],
      "preferred_angles": [
        "Contrarian: 'el growth team que vas a contratar va a fallar'",
        "Framework: '3 preguntas antes de escalar growth'",
        "Proof: 'Bnext 0→400K, qué funcionó y qué no'"
      ],
      "evidence_we_cite": [
        "Bnext 0→400K usuarios bajo CNMV",
        "Bit2Me LTV 3x bajo regulación",
        "Estudios de unit economics de B2B SaaS post-PMF"
      ]
    }
  },
  "updated_at": "2026-04-27T...",
  "version_history": [
    { "version": 1, "date": "2026-04-27", "trigger": "initial setup", "changes": "Bootstrap" }
  ]
}
```

## Cuándo se ejecuta

1. **Setup inicial** (task P14-T04 "Build POV Bank"):
   - Triggered tras P14-T03 (Setup configs)
   - Lee brand-voice + pillars + (clarify-history si tiene >5 entries)
   - Crea pov-bank.json desde cero
2. **Refresh continuo** (cron mensual "POV Bank Refresh"):
   - Analiza nuevas entries del clarify-history del último mes
   - Detecta patrones (qué ángulos elige el humano, qué reescribe, qué descarta)
   - Refina pov-bank.json (incremental, versionado)
3. **Manual** (botón ▶ Ejecutar en sección POV Bank de MC UI o pidiendo en chat)

## Workflow

### 1. Read inputs

- `content-pillars.md` — los 3-5 pillars con pain_origin, expertise, related_topics
- `brand-voice.current.md` — tono, vocabulario, voicing rules
- `company-brief.current.md` — sector, posicionamiento
- `clarify-history.json` — si existe, las 50 últimas entries (qué ángulos eligió el humano vs los que se le propusieron)
- `pov-bank.json` previo (si existe) — para hacer un refresh incremental, no overwrite total
- `idea-queue.json` — para ver qué ideas se aprobaron y cuáles se descartaron (señal de POV)

### 2. Sintetizar el POV global

Del company-brief + brand-voice extraer:
- `one_liner`: el statement de posicionamiento más afilado (1 frase)
- `villain`: contra qué nos posicionamos (la otra opción del mercado, no el competidor literal)
- `voice_traits`: 3-5 rasgos del tono (plain-spoken, data-driven, etc.)

### 3. Sintetizar el POV por pillar

Para cada pillar en content-pillars.md:

- `core_belief`: una frase con LA POSTURA central. Principio que argumentamos. NO descripción del tema.
  - Mal: "Growth systems for startups"
  - Bien: "Growth is a system, not a sequence of tactics"
- `we_say_yes_to`: 3-5 ítems concretos que abrazamos
  - Mal: "Buenas prácticas"
  - Bien: "Frameworks que sobrevivan al cambio de CMO"
- `we_say_no_to`: 3-5 ítems concretos que rechazamos
- `preferred_angles`: 3-5 patrones de ángulo que típicamente usamos en este pillar (con prefijo de tipo: Contrarian/Framework/Proof/Personal/etc.)
- `evidence_we_cite`: 3-5 fuentes de evidencia recurrentes (case studies del cliente, datos, estudios, citas literales)

### 4. Si hay clarify-history (>5 entries)

Analizar patrones:
- ¿Qué tipos de ángulo el humano APROBÓ vs DESCARTÓ?
- ¿Qué evidencia añadió el humano cuando reescribió ángulos?
- ¿Qué frases o conceptos se repiten en los ángulos finales?

Aplicar esos patrones para refinar `preferred_angles` y `evidence_we_cite`.

### 5. Versionar

Si ya existe pov-bank.json:
- Append entry a `version_history` con: version (incrementar), date, trigger ("manual" / "cron" / "setup"), changes (resumen 1-2 frases)
- Mantener máximo 10 entries en version_history

Backup del pov-bank.json anterior a `pov-bank-history.json` (append-only).

### 6. Validar antes de escribir

- Cada pillar tiene los 5 campos rellenos
- core_belief no es descripción del tema (debe ser una postura argumentable)
- we_say_yes_to / we_say_no_to son concretos (no buzzwords)
- preferred_angles tienen prefijo de tipo
- updated_at = now ISO

### 7. Confirmar al humano

Al terminar:
- Resume en 3-5 líneas qué cambió respecto al pov-bank previo (o "bootstrap inicial" si es el primero)
- Da el path al doc para que lo abra desde MC UI → Inputs → 🎯 POV Bank

## Rules

- **NUNCA escribir copy ni angle_drafts aquí** — esto es la BD, no el output
- **Las opiniones son del CLIENTE, no del modelo** — extraer de brand-voice + clarify-history, no inventar
- **Si no hay suficiente data** (clarify-history vacío Y brand-voice débil), marcar el pillar con `core_belief: null` y pedirle al humano que aporte la opinión
- **Versionar siempre** — append a version_history, no overwrite
- **No tocar otros configs** — solo pov-bank.json + pov-bank-history.json
