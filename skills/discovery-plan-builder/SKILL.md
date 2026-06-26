---
name: discovery-plan-builder
description: "Planifica por chat una búsqueda de creators para Partnerships (SAN-79). Conversación en el chat global de Sancho: recomienda sectores/redes/tiers según el contexto del cliente, itera con el usuario y produce un PLAN estructurado (plan-card). Al confirmar, crea la búsqueda: campaign type=Partnerships en Yalc + tarea Outreach madre + runner de discovery encolado. Usar cuando: 'crear nueva búsqueda', 'busca creators', 'lanza un discovery de influencers', 'programa de creators', o desde el botón 'Crear nueva búsqueda' del tab Encuentra (Outreach). NO usar para: outreach B2B clásico (outreach-playbook), construir secuencias (outreach-sequence-builder), ni ejecutar el scraping (discovery-search-runner)."
metadata:
  author: Growth4U
  version: '0.1'
  system: SanchoCMO
  issue: SAN-79
  owner_agent: rocinante
  chains_to: discovery-search-runner
context_required:
  - brand/{slug}/company-brief/company-brief.current.md
  - brand/{slug}/market-and-us/competitors/competitors.current.md
  - brand/{slug}/go-to-market/ecps/ecps.current.md
context_writes:
  - brand/{slug}/outreach/searches/
---

# Discovery Plan Builder (Partnerships · Encuentra)

> Del chat al plan, del plan a la búsqueda. El usuario conversa, tú recomiendas
> y estructuras; al confirmar se crea la campaign en Yalc, la tarea Outreach y
> el runner queda encolado. En discovery solo se mira CALIDAD (quality score),
> nunca predicción de conversiones ni precio.

## Contexto de superficie

- Este chat es el **chat global de Sancho anclado a la derecha** (no un modal):
  el botón "Crear nueva búsqueda" del tab **Encuentra** lo abre con esta skill.
- Paridad UI = chat = MCP: esta skill llama al MISMO endpoint que la UI y que
  la tool MCP `yalc_create_search`. Una sola lógica.

## Workflow

> **Regla de oro de latencia (SAN-323).** El PRIMER turno NO hace tool calls y NO
> redacta un plan: es una pregunta corta. Solo lees contexto y propones DESPUÉS de
> que el usuario elija el camino. Mantén turnos cortos y conversacionales (pregunta
> → respuesta → respuesta corta → plan-card); nunca vuelques toda la estrategia en
> un único turno. Un turno largo agota la ventana de "pensando" del chat y el
> usuario se queda colgado sin respuesta.

### 1. Abre con UNA pregunta (instantáneo · sin leer ficheros · sin plan)

En cuanto se abre el hilo ("Crear nueva búsqueda"), responde en 2-3 líneas con la
bifurcación, sin tocar ninguna herramienta y sin leer el contexto todavía:

> Vamos a montar una búsqueda de creators para Partnerships. ¿Quieres que te
> proponga yo el plan (sectores, redes, tiers…) a partir del contexto del cliente,
> o ya tienes claro a quién quieres llegar?

Espera su respuesta antes de hacer nada más.

### 2. Según lo que conteste, dos caminos

**A — "Hazlo tú / propónmelo":** ahora sí lee el contexto del cliente (no
preguntes lo que ya sabemos) y propón frentes:

- `company-brief.current.md`: qué vende la marca, mercado, presupuesto si consta.
- `competitors.current.md`: competidores → candidatos a señal "repeat" vía ad-library.
- `ecps.current.md`: a quién queremos llegar → sectores de creators con fit.

Si falta el company brief, dilo y sugiere completar Foundation; puedes seguir si
el usuario te da el contexto a mano. Luego propón 2-3 frentes concretos para ESTE
cliente (sector + red + por qué), estilo:

> Para el programa de creators de **Monzo** (audiencia España) os recomiendo:
> - **Finanzas personales / ahorro** — el sector con mejor fit histórico
> - **Inversión para principiantes** — buen ER en Micro y Mid
> - **Lifestyle + dinero** (estudiantes, nóminas) — volumen barato en TikTok
> ¿Por dónde empezamos, y en qué redes?

**B — "Lo tengo claro":** haz UNA pregunta de encuadre corta que le dé frame para
responder (no un cuestionario), por ejemplo:

> Perfecto. Cuéntame a quién te quieres dirigir y qué objetivo persigues — por
> ejemplo: "creators de finanzas personales en IG/TikTok", o "perfiles de growth
> en YouTube España para captar suscriptores".

Con su respuesta construye el plan; lee el contexto del cliente solo para rellenar
huecos (audiencia España, competidores para la señal repeat, tiers).

**Alcance de discovery (hoy):** el runner solo busca creators en **Instagram,
TikTok y YouTube** (`networks` ⊂ {instagram, tiktok, youtube}). Si el usuario pide
un canal que aún no scrapeamos (podcasts, newsletters, blogs), NO montes un plan
con una red inexistente: dilo en una línea y ofrece **mapearlo a esas redes** — p.
ej. "los podcasters de growth suelen estar en YouTube/IG; busco ahí su presencia"
— o anótalo para cuando se cubra. `networks` nunca lleva un valor que el runner no
pueda buscar.

En ambos caminos el usuario puede elegir, ajustar o guiarte él ("Sorpréndeme tú" →
decide tú con el contexto). Itera lo que haga falta: tiers, redes, volumen,
audiencia.

### 3. Presenta el PLAN (plan-card)

Cuando tengas los ingredientes, presenta el plan con las filas canónicas del
plan-card de Encuentra (en este orden):

| Fila | Contenido |
|---|---|
| **Sectores** | verticales objetivo (finanzas personales · ahorro · inversión básica) |
| **Redes** | instagram + tiktok (+youtube...) |
| **Tiers** | Micro (25–100K) / Mid (100–250K)... con la regla acordada |
| **Audiencia** | ≥ N% España (proxy idioma) |
| **Volumen** | ~N candidatos · scoring completo en 5 componentes |
| **Señales** | repeat con competidores vía ad-library (marcas concretas) |
| **Plantillas** | plantillas a instanciar al lanzar (se cambian aquí o luego en la búsqueda) |

Y debajo el **JSON del plan** (contrato `DiscoveryPlan`, el que se envía):

```json
{
  "title": "Finanzas personales ES · IG+TikTok",
  "sectors": ["finanzas personales", "ahorro", "inversión básica"],
  "networks": ["instagram", "tiktok"],
  "tiers": ["micro", "mid"],
  "audienceEsMinPct": 70,
  "targetVolume": 40,
  "signals": { "adLibrary": true, "competitorBrands": ["N26", "Revolut"] },
  "templates": ["Primer contacto creators fintech", "Brief reel educativo"],
  "qualificationMode": "hybrid",
  "disqualifyThreshold": 40,
  "notes": "Macro solo si Quality ≥ 85"
}
```

Reglas del contrato:
- `title`, `sectors` (≥1) y `networks` (≥1) son obligatorios; el resto opcional.
- `tiers` ⊂ {nano, micro, mid, macro}; vacío = todos.
- `qualificationMode` default `hybrid` (umbral 40): score < umbral entra
  `Disqualified` con nota auto (reversible); el resto entra `Sourced` ya
  scoreado y el humano decide el shortlist. El score es información, no decisión.
- `templates`: nombres de la biblioteca de Plantillas; se instancian al lanzar
  (la materialización es de SAN-80 — aquí solo viajan en el plan).
- **Las plantillas NUNCA bloquean el lanzamiento** (SAN-176): discovery solo
  busca candidatos; el contacto llega después (SAN-80). Si la biblioteca está
  vacía, o ninguna plantilla encaja con el cliente, lanza con `templates: []`
  y dilo en UNA línea («podrás asignar plantillas desde la búsqueda antes de
  Contactar»). No trates las plantillas como requisito, no pidas crearlas ni
  renombrarlas para poder lanzar, y no las marques como "blocker".

Cierra SIEMPRE preguntando si lo lanzas ("decidme si lo lanzo"). No lances sin
confirmación explícita del usuario en este thread.

### 4. Al confirmar: crea la búsqueda

POST al endpoint de búsquedas de Mission Control (mismo host del MC, token
admin de `clients.json` — nunca pidas tokens en el chat):

```bash
curl -s -X POST "http://localhost:3000/api/partnerships/searches" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $MC_ADMIN_TOKEN" \
  -d '{ "slug": "{slug}", "plan": { ...el JSON del plan... } }'
```

Respuesta: `{ ok, search, campaignId, taskId }`. Esto ya ha hecho TODO el
trabajo de creación:
1. Campaign `type=Partnerships` en Yalc (con el modo de cualificación del plan).
2. Tarea **Outreach madre** en el sistema de tasks (plan + campaignId + estado
   del runner guardados en `brand/{slug}/outreach/searches/{searchId}.json`).
3. Runner de discovery **encolado** (`runner.status=queued`).

Para una demo/verificación sin scraping real añade `"run": "fixtures"` al body:
ejecuta el runner inline con los 9 creators fake del mockup.

### 5. Confirma al usuario

Resume en una línea + próximos pasos:

> 🚀 Búsqueda lanzada — Rocinante está ejecutando el discovery ahora (scrapea
> creators según el plan). Cuando termine veréis los candidatos con su quality
> score en **Outreach → Encuentra** (los descartados automáticos quedan
> consultables).

Incluye `searchId` y `campaignId` por si el usuario opera por MCP/CLI después.

## Errores

- `400 plan.*` → el plan no valida; corrige el campo y reintenta (no molestes
  al usuario si puedes arreglarlo tú con lo ya acordado).
- `502/504 YALC` → Yalc no responde; informa y sugiere revisar Conexiones
  (Settings → Providers). NO crees la tarea a mano: el endpoint es atómico.
