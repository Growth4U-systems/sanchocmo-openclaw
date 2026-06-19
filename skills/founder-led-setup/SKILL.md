---
name: founder-led-setup
description: "Define y gestiona las VOCES de Founder-Led Content. Una voz = una persona en una red (p.ej. Alfonso·LinkedIn, Martín·LinkedIn, Alfonso·X). Captura quién + en qué red + handle + cadencia + cuenta de publicación (metricool_profile_id) + tono, y las escribe como profiles[] bajo el canal correcto en cadence-config.yml. Úsala SIEMPRE que haya que crear, añadir o editar voces founder-led: 'añadir voz', 'añade a Martín en X', 'da de alta una voz/founder en LinkedIn o Twitter', 'configura quién publica founder-led', o conectar la cuenta de publicación de una voz. Se invoca standalone o desde content-engine-setup (Step 4, cadencia)."
user-invocable: true
context_required:
- brand/{slug}/content/configs/cadence-config.yml      # canales existentes + voces ya definidas
- brand/{slug}/content/content-pillars.md              # para pillars_slant (hint de reparto por autor)
- brand/{slug}/brand-voice/brand-voice.current.md      # voice_doc por defecto
context_writes:
- brand/{slug}/content/configs/cadence-config.yml      # profiles[] bajo channels.{red}
- brand/{slug}/content/voices/{voiceId}-voice.md       # doc de tono por-founder (opcional, SAN-160)
---

# Founder-Led Setup — Voces (persona × red)

> Dueña de las **voces** founder-led. Una **voz = una persona en una red**. El mismo founder en dos
> redes son **dos voces** (dos entradas, una por canal). Es la única fuente de verdad de las voces:
> lo que escribe aquí lo leen la vista **Canales** (`channel-loops.ts`), el reparto por autor
> (`persona-loops.ts` · `suggestAuthor`) y la publicación (`metricool_profile_id` por voz).

**Invocación:** standalone ("añadir voz", alta/edición de una voz) **o** desde `content-engine-setup`
(Step 4, cadencia) en el setup inicial. Mismo comportamiento en ambos casos.

## Modelo de datos (no inventes campos)
Cada voz es una entrada en `cadence-config.yml` → `channels.{red}.profiles[]`. Campos del
`PersonaProfile` (`src/types/index.ts`):

| Campo | Qué | Origen |
|---|---|---|
| `id` | clave estable (slug del nombre si no se da) | derivado |
| `name` | quién | preguntar |
| `role` | rol (Co-founder, CEO…) | preguntar |
| `handle` | @ en esa red | preguntar |
| `metricool_profile_id` | cuenta de publicación de **esta** voz | preguntar |
| `pillars_slant` | temas que sesga (hint de `suggestAuthor`) | preguntar / derivar de pillars |
| `voice_doc` | doc de tono | por defecto la brand voice; por-founder opcional |
| `owner`, `primary_kpi` | opcionales | opcional |

`posts_per_week` (cadencia) va en el YAML del profile, **no** en el tipo `PersonaProfile`.

## Workflow

### 0. Contexto
- Identifica `slug`. Lee `cadence-config.yml` (canales + voces existentes) y `content-pillars.md`.
- Mapea **red → canal**: LinkedIn → `linkedin`, X/Twitter → `twitter`. Usa la **clave de canal que ya
  exista** en el YAML (no crees `x` si ya hay `twitter`). Blog/newsletter no llevan voces founder-led.

### 1. Por cada voz, pregunta (voz-first)
1. **¿Quién?** nombre + rol.
2. **¿En qué red?** (LinkedIn / X / …). El mismo founder en dos redes = **una voz por red**.
3. **Handle** en esa red.
4. **Cadencia** (posts/semana; días/horas si aplica).
5. **Cuenta de publicación** = `metricool_profile_id` (el perfil/blogId de Metricool de **esta** voz
   y red). Es lo que usará la publicación para enrutar a la cuenta correcta. Si aún no existe, déjalo
   vacío y avisa: *"sin cuenta → esta voz no se podrá programar hasta conectarla"*.
6. *(Opcional)* `pillars_slant` (1-3 temas, derivados de `content-pillars.md`).
7. **Voz propia del founder (recomendado).** Ofrece crear un doc de tono por-founder en
   `content/voices/{id}-voice.md` y apunta ahí `voice_doc`. **Ligero** (no un brand-voice completo):
   3 adjetivos de tono · 3-5 do/don't · 2-3 frases de muestra · en qué se diferencia de las otras
   voces. Derívalo de la brand voice (`brand-book/brand-voice/brand-voice.current.md`) + rol/handle/
   muestras de esa persona. Si la declina, deja `voice_doc` vacío → el writer usa la brand voice.

Presenta lo capturado como matriz **voz × red → cuenta** y pide confirmación antes de escribir.

### 2. Escribe en `cadence-config.yml`
- Asegura que el canal de la red existe y está `active: true` (créalo mínimo si falta: una voz en X
  implica el canal X activo).
- Inserta/actualiza la voz en `channels.{red}.profiles[]`:
  - **match por `id`** (o `name`) para **editar** una existente; si no hay match, **añade**.
  - `id` = el dado, o slug del nombre (minúsculas, sin acentos, `-`).
  - **Preserva** las demás voces del canal y el resto de la config del canal y del fichero.
- No toques otros canales ni otros configs.

### 3. Confirma
Resume qué voces quedaron por red + su cuenta. Recuerda que la vista **Canales** ya las pinta
(una tarjeta por voz: persona + logo de red + handle) y que el reparto de ideas usa `pillars_slant`.

## Ejemplo (Growth4U)
Resultado esperado en `cadence-config.yml` (Alfonso en LinkedIn y en X = dos voces):
```yaml
channels:
  linkedin:
    active: true
    profiles:
      - { id: alfonso, name: Alfonso, role: Co-founder, handle: "@alfonsosb", metricool_profile_id: "<li-alfonso>", posts_per_week: 3, pillars_slant: ["growth ops","AI agents"] }
      - { id: martin,  name: Martín,  role: Co-founder, handle: "@martin",    metricool_profile_id: "<li-martin>",  posts_per_week: 2, pillars_slant: ["pricing"] }
  twitter:
    active: true
    profiles:
      - { id: alfonso, name: Alfonso, role: Co-founder, handle: "@alfonsosb", metricool_profile_id: "<x-alfonso>", posts_per_week: 2, pillars_slant: ["growth ops"] }
```

## Reglas
- **Una voz = una (persona, red).** La misma persona en 2 redes = 2 entradas (una por canal). Captura
  `metricool_profile_id` **por voz**, así soporta tanto "una cuenta Metricool por persona" como "una
  por persona×red" sin decidirlo aquí.
- **No dupliques la estrategia.** Pillars y POV son compartidos y **READ-ONLY** aquí (los posee el
  track de contenido/blog). Esta skill solo escribe las voces.
- **No pises** otras voces, otros canales ni otros configs del fichero.
- **`metricool_profile_id` por voz** = la cuenta real de publicación; sin ella la voz no publica. El
  enrutado multi-cuenta al publicar se aborda aparte (SAN-162) — aquí solo se **captura**.
- **Doble superficie:** escribes el mismo `cadence-config.yml` que lee `channel-loops.ts`, así que MC
  (vista Canales), MCP y Sancho/Dulcinea ven exactamente las mismas voces.
