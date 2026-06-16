---
name: linkedin-comment
description: "[Crecimiento orgánico LinkedIn] Playbook de comentar con valor en LinkedIn para crecer el alcance orgánico del cliente. Cubre el flujo completo: arma y mantiene el grupo foco del cliente (a quién seguir y comentar, en dos lanes: ICP y creators grandes), elige a quién comentarle hoy con cadencia sostenible, y redacta UN comentario humano por post en la voz del cliente, listo para QA (Sansón) y aprobación humana. Lee el contexto del cliente (voz, ECPs, posicionamiento), no lo pregunta. La parte mecánica se apoya en herramientas de Sancho (discovery de creators para Lane B, apify para traer posts) pero el criterio de selección y la voz viven en esta skill. El plan estratégico la activa cuando LinkedIn orgánico entra como canal. Use when: el plan activa LinkedIn orgánico, o el usuario pide 'comentar en LinkedIn', 'a quién comento esta semana', 'armar el grupo foco de LinkedIn', 'genera comentarios para LinkedIn', 'engagement en LinkedIn', 'a quién sigo o comento en LinkedIn'. NOT for: escribir los posts propios del cliente (skills de contenido), feedback del cliente en deliverables (review-comments), ni auto-publicar."
context_required:
- brand/{slug}/brand-voice/brand-voice.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
- brand/{slug}/go-to-market/positioning/positioning.current.md
context_writes:
- brand/{slug}/engagement/linkedin-focus-group.json
- brand/{slug}/engagement/linkedin-comments-YYYY-MM-DD.json
- brand/{slug}/engagement/linkedin-comments-YYYY-MM-DD.md
- brand/{slug}/operational/learnings.md
---

# linkedin-comment — Comentar con valor en LinkedIn

> Playbook completo del crecimiento orgánico por comentarios: arma el grupo foco del cliente, elige a quién comentarle hoy y redacta el comentario en su voz. Deja borradores, no publica. El criterio de a quién comentar y cómo sonar humano vive acá; la fuerza bruta (scrapear creators, traer posts) se delega a las herramientas de Sancho.

Read ./brand/ per `_system/brand-memory.md`.

## Dónde encaja

Dentro de Content Creation, como el motor de crecimiento orgánico en LinkedIn por comentarios (complementa publicar contenido propio). El plan estratégico la propone cuando prioriza LinkedIn orgánico como canal. No reemplaza al redactor de posts; cubre la palanca de comentar, que es la que más rinde cuando el cliente es chico porque renta audiencias ajenas.

## Por qué importa

Comentar bien en posts de gente con audiencia pone al cliente delante de esa audiencia y le trae visitas a su perfil. El algoritmo pesa los comentarios más que los likes, y los tempranos más todavía. Pero solo funciona si el comentario aporta valor real y suena humano: un comentario que parece de bot es peor que ninguno y le cuesta reputación al cliente.

## Cómo orquesta (qué hace la skill vs qué delega)

La skill es el **playbook**: tiene el criterio. Para lo mecánico llama a lo que Sancho ya tiene mejor resuelto.

| Etapa | Lo aporta esta skill | Se apoya en | Agente |
|-------|----------------------|-------------|--------|
| Armar grupo foco — Lane A (ICP) | la curación, el fit, los tiers | `web_search` + el contexto del cliente | Dulcinea |
| Armar grupo foco — Lane B (creators) | qué tier, qué fit | `discovery-plan-builder` + `discovery-search-runner` (opcional) | Rocinante |
| Traer los posts | qué posts importan | provistos por defecto; `apify` (opcional) | Hamete |
| Elegir + redactar | cadencia, selección, voz anti-IA | la voz del cliente como materia prima | Dulcinea |
| QA | (deja pasar al gate) | brand-check | Sansón |

Regla: el **juicio** (curación de Lane A, fit, tiers, cadencia y las reglas anti-IA de la voz) nunca se terceriza. Eso es lo que hace que el comentario no suene a IA y que la lista no se llene de relleno.

## Empezá cada corrida acá: leer el estado

El grupo foco del cliente vive en `brand/{slug}/engagement/linkedin-focus-group.json`. Guarda cada persona (nombre, perfil, tier, lane) y un estado chico: la fecha en que se sugirió comentarle por última vez, para el cooldown del paso 3.

**Tu primera acción literal es LEER ese archivo.** Leerlo, no solo `ls`. Un listado puede mentir sobre si el archivo está; una lectura devuelve el contenido o falla limpio porque no existe. Después ramificá:

- **El usuario pegó posts concretos y solo quiere comentarios.** Es lo más común, chequealo primero. Saltá todo lo demás y andá directo al paso 4. No toques la lista.
- **El archivo existe con una lista real.** NO la reconstruyas. Andá al paso 3 (elegir) y al 4 (redactar). Solo cambiá la lista si el plan o el usuario piden explícitamente agregar, sacar o re-tierar a alguien.
- **El archivo existe pero claramente no es de este cliente** (placeholders, o una lista de otro rubro). No lo pises en silencio; nunca destruyas data del cliente. Marcá el desajuste y ofrecé reconstruir con permiso.
- **El archivo no existe.** Armá el grupo foco primero (pasos 1 y 2), guardalo, y seguí al 3 y 4.

Primera corrida: "armar la lista, después comentar". Las siguientes: "comentar sobre la lista existente", que es el caso común. Así el cliente no re-investiga gente ya elegida y el cooldown funciona entre días.

## Workflow

### 1. Inferir el target del cliente (no preguntar)
A diferencia de la versión personal, acá el contexto se LEE del cliente, no se pregunta:
- **Posicionamiento e ICP**: `go-to-market/positioning/` (el `.current.md`, que puede estar por-ECP en subcarpeta) y `go-to-market/ecps/ecps.current.md`.
- De ahí derivá las **dos lanes**: Lane A = a quién le vende el cliente (sus ECPs); Lane B = creators grandes que esos ECPs ya siguen (alcance prestado).
- Solo si el brand no alcanza para definir las lanes, presentá tu lectura al usuario para que la confirme. Detalle del método en `references/target-discovery.md`.

### 2. Armar el grupo foco
Proponé una lista de personas reales que valga la pena comentar, clasificadas en las dos lanes, cada una con evidencia de que postea. Método completo (búsqueda multi-ángulo, reglas duras, clasificación, tiers) en `references/target-discovery.md`.
- **Lane A (ICP)**: curación con `web_search` anclada a los ECPs del cliente. Esta es la parte de más valor y la más difícil; se hace acá, con criterio.
- **Lane B (creators)**: opcionalmente delegá el descubrimiento masivo a la discovery de Sancho (`discovery-plan-builder` → `discovery-search-runner`, owner Rocinante, vía ScrapeCreators), que trae creators por sector/tier/ER. Aplicá tu fit encima de lo que devuelva; no metas todo lo que venga.
- Persistí la lista aprobada en `brand/{slug}/engagement/linkedin-focus-group.json` con tier por persona (ver `references/selection-and-cadence.md` para sembrar tiers). NO la persistas en YALC ni la acoples a otra cosa: este artefacto es propio del engagement.

### 3. Elegir a quién comentarle hoy
Con la lista en mano, decidí a quién comentar de forma sostenible: modelo de dos tiers (un núcleo chico que se comenta siempre + un banco más grande que se rota con cooldown) más un pick diario por relevancia y frescura. Método en `references/selection-and-cadence.md`. Tope realista: 8 a 12 por corrida.

### 4. Traer los posts y redactar
- **Posts**: por defecto vienen dados (el usuario los pega, o la fuente de monitoreo del cliente). Si no hay, pedirlos. Opcional: fetch vía `apify` (un actor de posts de LinkedIn, normalmente rental: requiere suscripción al actor y `APIFY_TOKEN`) si el cliente acepta scraping; en ese caso normalizar autor, url, texto, fecha.
- **Redactar**: un comentario por post, en la voz del cliente (`brand/{slug}/brand-voice/brand-voice.current.md` como materia prima). **Antes de escribir una sola línea, leer `references/comment-voice.md`**: es el moat. En corto: como par, no cátedra; una idea simple; en el idioma del post; matar el aforismo de cierre, la antítesis "X no Y" y la validación de métrica de apertura; cero em-dashes; si hay link, leerlo y comentar algo concreto.
- Si el post remite a un artículo o video, leer ese contenido (fetch) y comentar un punto concreto. Nunca "me lo leo".

### 5. Output, QA y aprobación (human-in-the-loop)
- Escribir a `brand/{slug}/engagement/linkedin-comments-YYYY-MM-DD.json` una lista, cada item: `postUrl`, `author`, `postExcerpt`, `comment`, `ecpAngle`, `why`, `lane`, `tier`.
- **Para que se vea y se apruebe en la UI** (Mission Control no lista los `.json` solos): escribir además un espejo legible en `brand/{slug}/engagement/linkedin-comments-YYYY-MM-DD.md` (una sección por comentario: autor, link al post, el borrador, el ángulo ECP) y presentar el resumen en el chat con un link tokenizado de MC al `.json`/`.md` (lo canónico, PROTOCOLS.md), nunca rutas crudas. Si el runtime lo soporta, además setear el `meta.docPath` del hilo a esa ruta para que el pill del chat lo abra directo en el visor.
- Pasar los borradores a **Sansón** para brand-check (voz, ángulo, que no dañe relaciones).
- NUNCA auto-publicar. Dejar los comentarios listos para que un humano apruebe, edite y publique. La skill saca la fricción; el criterio y la última palabra son del humano.
- Tras generar, actualizar la fecha de last-suggested de las personas comentadas en `linkedin-focus-group.json`, para que el cooldown valga entre corridas.

## Modo recurrente (cron proactivo)

Además de correr cuando el usuario lo pide, esta skill corre sola, programada, mientras la estrategia #19 (LinkedIn Flywheel) esté activa para el cliente. Lo instrumenta el cron `linkedin_engagement` (plantilla en `_system/cron-templates.json`). El cron NO se auto-crea: hay que darlo de alta por cliente con la herramienta de cron de Sancho cuando se activa #19. La estrategia #19 ya referencia esta skill, pero programar el cron es hoy un paso manual.

En modo recurrente, en vez de esperar el pedido, el cron:
1. Lee el grupo foco (`engagement/linkedin-focus-group.json`). Si no existe, avisa que hay que armarlo primero y para (no inventa lista).
2. Calcula quién es elegible hoy (Tier A siempre; Tier B si pasó el cooldown de 3 días).
3. Trae los posts recientes de los elegibles. Por defecto vía `apify` (un actor de posts de LinkedIn; ojo: suele ser rental, necesita suscripción al actor y `APIFY_TOKEN`). Si no hay fetch disponible, publica un aviso con quién es elegible hoy y pide los posts, sin inventarlos.
4. Selecciona (frescura + relevancia + tope 8-12), redacta con las mismas reglas de voz, pasa por Sansón.
5. Publica la sugerencia en el chat del cliente (resumen + link al `.json`/`.md`). NUNCA auto-publica en LinkedIn: deja el borrador para aprobación humana.

La frecuencia (diaria o cada pocos días) se define al crear el cron por cliente. El cooldown se mantiene con el `lastSuggested` del grupo foco, que se actualiza tras cada corrida.

## Self-QA
- ¿Leí primero el `linkedin-focus-group.json` (no `ls`) y ramifiqué bien?
- ¿La lista sale del ICP real del cliente y distingue Lane A de Lane B?
- ¿Cada comentario suena a humano (sin aforismo de cierre, sin "X no Y", sin halago vacío, sin em-dashes) y respeta la voz del cliente?
- ¿Respeté el cooldown por autor y el tope de 8 a 12?
- ¿Quedó claro que son borradores para aprobar, no para publicar solo, y pasaron por Sansón?
