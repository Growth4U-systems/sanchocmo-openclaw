---
name: new-content-task
description: Registra una idea de contenido que te da el usuario por chat. Úsala cuando el usuario diga "tengo una idea", "apunta esta idea", "mete esto como idea", "nueva idea de contenido" o similar. NO redactas el contenido — solo registras la idea en la cola; el research/clarify/writer ya corren cuando el humano la aprueba.
agent: dulcinea
---

# new-content-task — registrar una idea de contenido del usuario

El usuario te da una idea suelta. Tu único trabajo: convertirla en UNA entrada de la
cola de ideas, con un `pillar_id` que EXISTE en el brand, y registrarla vía la API de
Mission Control. Nada más.

NO hagas research, NO hagas clarify, NO redactes el draft. Todo eso ocurre solo después,
cuando el humano aprueba la idea en la pestaña Ideas (ahí arranca el flujo normal
research → clarify → writer). Tú solo dejas la idea apuntada en estado **Nueva**.

> **Modelo de datos (para no confundirse):** una idea nueva (sin aprobar) vive en el
> pool de descubrimiento `idea-queue.json` — NO es todavía un ContentTask ni un Task.
> El ContentTask (anidado en `tasks.json`) nace cuando el humano APRUEBA la idea, vía
> `generate-drafts`. Por eso esta skill solo hace `POST /api/content-engine/ideas`
> (mismo raíl que las antenas); del content-task/task se encarga la aprobación, no tú.

Tienes `$MC_BASE` en el entorno (host de Mission Control).

## Pasos

1. **Lee los pilares válidos del brand** (lista cerrada — NO inventes ninguno):

       curl -fsS "$MC_BASE/api/content-engine/pillars?slug=<slug>"

   Usa el array `pillars[].id`. Elige el `id` que mejor encaje con el tema de la idea.
   Si `pillars` viene vacío, usa `"general"` y dilo en tu respuesta.

2. **(Opcional) Lee el POV Bank** para afinar el ángulo:

       curl -fsS "$MC_BASE/api/content-engine/pov-bank?slug=<slug>"

   No es bloqueante: si devuelve 503/null, sigue sin él.

3. **Registra la idea** (POST — el endpoint ya marca el resto de defaults):

       curl -fsS -X POST "$MC_BASE/api/content-engine/ideas" \
         -H "Content-Type: application/json" \
         -d '{"slug":"<slug>","idea":{
               "pillar_id":"<id-de-la-lista>",
               "content_type":"<tipo-corto>",
               "target_channel":"<linkedin|twitter|blog|newsletter>",
               "angle_draft":"<1-2 frases con el ángulo>",
               "signal":{"summary":"<la idea tal cual la dijo el usuario>","source":"manual","date":"<YYYY-MM-DD>"}
             }}'

   - `pillar_id`: OBLIGATORIAMENTE uno de `pillars[].id`. Si metes uno inventado, el
     enrutamiento aguas abajo se rompe.
   - `target_channel`: por defecto `linkedin` salvo que la idea sugiera otro
     ("artículo" → blog, "newsletter" → newsletter).
   - `angle_draft`: un primer ángulo; el clarify lo refinará después, no te obsesiones.

   Si el curl falla, dilo en el thread y PARA (no la des por registrada).

4. **Confirma al usuario** (≤3 líneas): qué pilar y canal le asignaste, y que la idea
   está en estado **Nueva**. Pídele que la apruebe cuando quiera para arrancar el flujo
   (research → clarify → draft). Incluye este link (con `$MC_BASE` resuelto):

       $MC_BASE/dashboard/<slug>/content-creation?tab=ideas

## Reglas duras

- UNA idea por vez. Si el usuario describe varias, registra la principal y pregúntale por el resto.
- El `pillar_id` SIEMPRE sale del endpoint de pilares.
- No redactes contenido ni dispares research/clarify — eso lo hace el pipeline al aprobar.
