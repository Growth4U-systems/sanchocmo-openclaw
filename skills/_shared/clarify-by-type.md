# Clarify by Item Type — preguntas adaptadas que extraen ángulo real

> Doc de referencia compartido por todas las skills de redacción de contenido
> (social-content, seo-content, linkedin-content, instagram-content, etc.).
> Lo invoca Mission Control vía `writer-trigger.ts` durante el paso Clarify.
>
> **Por qué existe**: las preguntas genéricas ("¿qué CTA?", "¿qué cliente?")
> producen drafts blandos. Adaptar las preguntas al tipo de item fuerza al
> humano a contestar con tesis concreta + cifra propia + insight no obvio,
> que es lo único que hace que el draft suene a su voz y no a IA.

---

## 1. Clasificar el item — 7 tipos

Antes de escribir `clarify.md`, lee `proposal.md` + `research.md` y clasifica
el item en UNO de estos tipos. Si es híbrido, elige el dominante (el que
aparece primero en el flow del titular). Escribe el tipo en el frontmatter
de `clarify.md` como `item_type: <tipo>`.

| `item_type` | Cuándo aplica | Señales |
|---|---|---|
| `dato_cifra` | Titular con número fuerte como anchor | "78% de ecommerce calcula mal su CAC", "+233%", "70 USD CPL" |
| `hot_take` | Tesis fuerte u opinión contraria | "X está muerto", "el playbook ya no funciona" |
| `launch` | Anuncio de producto, feature o integración | "lanza", "introduce", "anuncia", "expande", "integra X con Y" |
| `framework_playbook` | Sistema, lista numerada o método | "3 reglas", "5 señales", "checklist", "framework" |
| `caso_historia` | Historia de empresa/persona específica | "[empresa] consiguió X", "el caso Y" |
| `tendencia_report` | Estudio o agregado | "según estudio", "el 67% de", "report 2026" |
| `plataforma_cambia` | Cambio de reglas en plataforma operacional | "Meta retira", "Google actualiza", "TikTok cambia algoritmo" |

Para items manuales (sin noticia), trátalos como `caso_historia` por defecto.

---

## 2. Las 4 preguntas — estructura fija, opciones adaptadas

**Reglas de diseño** (siempre, sea cual sea el tipo):

1. **4 preguntas, no 3.** La cuarta es la que saca el insight no obvio.
2. **Cada pregunta tiene 4 opciones HIPÓTESIS específicas + Other.** Las
   opciones NO son "Confirmo / Contra / Matiz" abstractas. Son tesis
   concretas con cifra/cliente/mecánica que se podrían defender.
   - ❌ Mal: "Confirmo full"
   - ✅ Bien: "Confirmo: en {cliente_ancla} lo medí en X% de campañas y el
     patrón aguantó N meses"
3. **Al menos 1 pregunta espera Other con texto libre.** Diséñala así: las 4
   opciones cerradas son "buenas pero genéricas", y Other es la apuesta por
   la respuesta más específica. Pon un hint explícito: "(escribe tu insight
   propio aquí — esta pregunta es para sacarte la perspectiva única que el
   resto no tiene)".
4. **NUNCA preguntes "¿qué CTA?" como pregunta independiente.** El CTA
   depende de la tesis. Lo derivas a partir del take + audiencia + cliente.
5. **Lee `proposal.md → angle_draft` y `research.md` ANTES de redactar las
   preguntas.** Las opciones deben empujar al humano a refinar o desafiar el
   ángulo propuesto, no a aceptarlo.

### Q1 — La PROVOCACIÓN (fuerza posición)

Cuatro tesis posibles MUY distintas entre sí, cada una con anchor implícito.
Ejemplo para una noticia de "Adobe lanza agents":

```
- "El problema no es Adobe, es el workflow viejo debajo del agente — vi 3% adoption en CRMs heredados"
- "Adobe llega tarde — Salesforce y HubSpot ya tienen mejor agent en producción 6 meses"
- "Lo que importa no es el agente, es la API que expone — sin acceso al data layer es un chatbot bonito"
- "Es marketing puro: agentic == funnel para vender Firefly y suite cara, no un cambio operacional"
```

Cualquiera de las 4 produce un post diferente.

### Q2 — La EVIDENCIA propia (obligar a anclar con dato)

Cuatro evidencias específicas que el humano podría tener, con cifras
propuestas que él valida o ajusta. Las cifras tienen que sonar a su negocio,
basadas en los `anchor_clients` del brand-book / company-brief.

```
- "{ANCHOR_CLIENT_HISTORICAL} 2022: probamos X y vimos Y% en N días"
- "{ANCHOR_CLIENT_CURRENT} ahora mismo: medí Z y el patrón es W"
- "Cliente fintech anónimo: 1.380 EUR de CAC, 4.200 EUR de LTV, payback 11 meses"
- "Agregado de mi consultoría: el 60% del trabajo de mes 1 es positioning, no growth"
- Other: "(tienes una cifra mejor — escríbela)"
```

Si no estás seguro de la cifra, marca con `[verifica]` en la opción.

### Q3 — Lo que NADIE más está diciendo (Other esperado)

La pregunta clave. Diseñada para que NINGUNA opción cerrada sea suficiente.
Las descripciones de las 4 opciones DEBEN decir explícitamente que escribir
en Other es la opción premium.

```
"¿Qué insight ves en este tema que NADIE en LinkedIn está contando?"
- A: "Escribe en Other tu insight más afilado — esta pregunta es para sacar
     tu perspectiva única, no la opinión de manual"
- B: "El tema está saturado, no hay nada nuevo (skip esta pieza)"
- C: "Hay un sub-aspecto técnico que el sector ignora — describe cuál en Other"
- D: "Hay un caso límite donde la tesis dominante rompe — describe en Other"
```

Si el humano elige cualquier opción que apunte a Other, capturas su texto
literal. Eso es ORO para el draft.

### Q4 — Aplicación + audiencia diana

Mezcla CTA con audiencia. No preguntes el CTA suelto.

```
- "Founder/CEO B2B SaaS: terminar con DM filtrado a quien tenga el dato concreto"
- "CMO de marca >5M revenue: terminar con pregunta provocadora a comentarios"
- "Growth marketer junior: terminar con regla de bolsillo para llevarse"
- "Mixto sector: terminar con pregunta abierta sin sub-segmentar"
- Other: "(otra audiencia o cierre específico)"
```

---

## 3. Plantillas Q1 por tipo

Las Q2-Q4 mantienen su estructura base; lo que cambia más entre tipos es Q1.

| `item_type` | Q1 = la provocación |
|---|---|
| `dato_cifra` | 4 hipótesis de por qué la cifra es engañosa o real |
| `hot_take` | 4 contra-tesis (no aceptar el take, problematizar) |
| `launch` | 4 framings: early adopter, escéptico técnico, comparativa con alternativa, marketing puro |
| `framework_playbook` | adoptar / adaptar / rechazar / añadir paso que falta |
| `caso_historia` | paralelo / opuesto / aprendizaje sectorial / contraejemplo |
| `tendencia_report` | confirmo / contradigo / segmento / sesgo del estudio |
| `plataforma_cambia` | acción urgente / esperar / sub-segmento dañado / oportunidad escondida |

### Q3 (insight no obvio) por tipo

| `item_type` | Q3 framing |
|---|---|
| `dato_cifra` | el matiz que la cifra esconde |
| `hot_take` | la trampa que nadie ve en la posición dominante |
| `launch` | qué condición tendría que cumplirse para que valga la pena |
| `framework_playbook` | el paso que NO está en el framework y debería estar |
| `caso_historia` | qué del caso NO se cuenta |
| `tendencia_report` | la implicación que la prensa ignora |
| `plataforma_cambia` | el workaround propio que ya tienes |

---

## 4. Formato del `clarify.md` resultante

El archivo que escribe la skill debe parsearse por Mission Control. Formato
fijo:

```markdown
---
idea_id: <id>
content_task_id: <id>
parent_task_id: <id>
channel: clarify
kind: clarify
item_type: <uno de los 7>          # ← NUEVO. Obligatorio en v2.
iteration: 0
clarify_status: pending            # NO escribas `status:` — ese campo ya no existe.
created_at: <ISO>
updated_at: <ISO>
---

# Clarify · {item_type}

> [1 línea] Contexto del item para que el humano recuerde de qué va.

---

## Q1 — {tesis del tipo, p.ej. "La provocación"}

:::ask
{"id":"q_provoke","prompt":"{pregunta concreta del item}","mode":"single","options":[{"id":"a","label":"{opción A con cifra/cliente/mecánica concreta}"},{"id":"b","label":"{opción B distinta a A}"},{"id":"c","label":"{opción C distinta a A/B}"},{"id":"d","label":"{opción D distinta a A/B/C}"},{"id":"other","label":"Otro (lo escribo)"}]}
:::

**Respuesta humana**:
> _(la rellena el agente con la respuesta del humano)_

---

## Q2 — La evidencia propia

:::ask
{"id":"q_evidence","prompt":"¿Con qué dato propio anclas esta tesis?","mode":"single","options":[{"id":"a","label":"{anclaje en cliente histórico con cifra propuesta}"},{"id":"b","label":"{anclaje en cliente actual con cifra propuesta}"},{"id":"c","label":"{anclaje agregado de la consultoría}"},{"id":"d","label":"{opción anónima con cifras hipotéticas marcadas [verifica]}"},{"id":"other","label":"Otro (lo escribo)"}]}
:::

**Respuesta humana**:
>

---

## Q3 — Lo que nadie más está diciendo

:::ask
{"id":"q_insight","prompt":"¿Qué insight ves en este tema que NADIE está contando? (Other recomendado — esta pregunta es para tu perspectiva única)","mode":"single","options":[{"id":"a","label":"El tema está saturado, no hay nada nuevo (skip)"},{"id":"b","label":"{sub-aspecto técnico ignorado, según item_type}"},{"id":"c","label":"{caso límite donde la tesis dominante rompe}"},{"id":"other","label":"Otro (lo escribo) — recomendado"}]}
:::

**Respuesta humana**:
>

---

## Q4 — Aplicación + audiencia diana

:::ask
{"id":"q_audience","prompt":"¿Para quién escribes y cómo cierras?","mode":"single","options":[{"id":"a","label":"Founder/CEO B2B SaaS · cierre con DM filtrado"},{"id":"b","label":"CMO marca >5M revenue · cierre con pregunta provocadora"},{"id":"c","label":"Marketer junior · cierre con regla de bolsillo"},{"id":"d","label":"Mixto · pregunta abierta"},{"id":"other","label":"Otro (lo escribo)"}]}
:::

**Respuesta humana**:
>
```

**Ids estables obligatorios**: `q_provoke`, `q_evidence`, `q_insight`,
`q_audience` — los mismos en `clarify.md` y en los bloques `:::ask` que
postees al chat. Mission Control casa las respuestas `[ask:<id>]` del chat
contra los ids declarados en el body de `clarify.md` para marcar
`clarify_status: answered` automáticamente; si los ids no coinciden, esa
detección no ocurre y la transición queda solo en tus manos.

---

## 5. Cuando el humano responde

El humano responde vía los componentes `:::ask` del chat de Mission Control,
que envían un único mensaje con líneas `[ask:<id>] respuesta: …` al thread de
la ContentTask. A partir de ahí, dos mecanismos redundantes (a propósito):

1. **Mission Control (determinista)**: el endpoint de chat parsea esas líneas
   y, cuando las respuestas cubren TODOS los `:::ask` declarados en el body de
   `clarify.md`, marca `clarify_status: answered` y persiste el mapa
   `clarify_answers` en el frontmatter (`src/lib/clarify-autostatus.ts`).
   Para que esto funcione, los ids de los `:::ask` que posteas en el chat
   deben ser LOS MISMOS que escribiste en `clarify.md`.
2. **El agente (responsable último)**: al recibir el mensaje con respuestas,
   copia cada una al bloque "Respuesta humana" de su pregunta en `clarify.md`
   y verifica que `clarify_status: answered` está en el frontmatter (si MC ya
   lo marcó, no lo toques). NUNCA empieces a redactar con `clarify_status:
   pending`.

El frontmatter resultante queda así:

```yaml
clarify_status: answered
clarify_answers:
  q_provoke: "C — Lo que importa es la API. En {cliente} ya vimos esto..."
  q_evidence: "Other — CAC -41% en 6 meses, no 18%"
  q_insight: "Other — Nadie habla del coste de implementar este agent: 3 sprints mínimo"
  q_audience: "B — CMO senior, pregunta provocadora"
```

El writer no inventa cifras — lee `q_evidence` y la usa literal. Si
`q_evidence` está en formato vago ("creo que sí, sobre el 30%"), marca
`[verifica cifra]` en el draft final.

---

## 6. Reglas anti-AI-writing (aplicar en el writer, no en clarify)

NO uses estos patrones (matan la credibilidad):

- "delve", "dive into", "navigate", "leverage", "elevate", "unleash", "unlock"
- "in conclusion", "the truth is", "let's dive in", "imagine if"
- "it's not just X, it's Y" (estructura overused)
- Listas con todo en negrita o con emojis al inicio
- `✨`, `🚀`, `💡` o cualquier emoji
- Frases ascensionales tipo "transforming the way we..."

SÍ usa:

- Frases cortas, párrafos de 1-3 líneas separados por línea en blanco
- Cifras concretas con contexto
- "Esto es lo que vi en {cliente}" en lugar de "studies show"
- Tono primera persona, declarativo
- MAYÚSCULAS como martillo (1 vez por pieza, sobre la palabra-tesis)

---

## 7. Regla de cifras inventadas

Si el humano no aporta cifra concreta y tú no tienes una de los archivos
del brand (anchor clients del company-brief), **marca con `[verifica cifra]`
cualquier número en el draft final**. NUNCA inventes cifras de clientes sin
marcarlas. Es la regla más importante.

Al terminar el draft, postea al chat un bloque de "cifras a verificar":

```
Cifras a verificar antes de publicar:
- "CAC bajó 31% en {ANCHOR_CLIENT_PRIMARY}" → confirma o ajusta
- "20 reviews en 7 días en {ANCHOR_CLIENT_CURRENT}" → confirma o ajusta
```
