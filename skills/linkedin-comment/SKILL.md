---
name: linkedin-comment
description: "[Crecimiento orgánico LinkedIn] Redacta comentarios en la voz del cliente para dejar en los posts de su grupo foco y crecer en alcance orgánico. Es la pieza de COMENTAR del crecimiento orgánico en LinkedIn, complementa publicar contenido propio. El plan estratégico la activa cuando LinkedIn orgánico entra como canal. Recibe el grupo foco y los posts a comentar (provistos por el usuario o por la fuente de monitoreo que el cliente tenga); NO scrapea ni depende de ninguna skill de monitoreo. Elige a quién comentarle hoy (frescura + relevancia + cooldown) y redacta UN comentario humano por post, listo para QA (Sansón) y aprobación humana. Use when: el plan activa LinkedIn orgánico, o el usuario pide 'comentar en LinkedIn', 'a quién comento esta semana', 'genera comentarios para LinkedIn', 'engagement en LinkedIn'. NOT for: escribir los posts propios del cliente (skills de contenido), feedback del cliente en deliverables (review-comments), ni auto-publicar."
context_required:
- brand/{slug}/brand-voice/brand-voice.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
context_writes:
- brand/{slug}/engagement/linkedin-comments-YYYY-MM-DD.json
- brand/{slug}/operational/learnings.md
---

# linkedin-comment — Comentar con valor en LinkedIn

> La pieza de COMENTAR del crecimiento orgánico en LinkedIn: agarra los posts del grupo foco del cliente y redacta el comentario que el cliente deja en ellos, en su voz. Deja borradores, no publica.

Read ./brand/ per `_system/brand-memory.md`.

## Dónde encaja

Dentro de Content Creation, como una de las tareas de crecimiento orgánico en LinkedIn (publicar contenido propio + comentar a la gente correcta + responder). Esta skill cubre el comentar. El plan estratégico la propone cuando prioriza LinkedIn orgánico como canal.

## Por qué importa

Comentar bien en posts de gente con audiencia pone al cliente delante de esa audiencia y le trae visitas a su perfil. El algoritmo pesa los comentarios más que los likes, y los tempranos más todavía. Pero solo funciona si el comentario aporta valor real y suena humano: un comentario que parece de bot es peor que ninguno.

## Input (la skill no scrapea)

Necesita dos cosas, que vienen dadas (no las busca ella):
- **Grupo foco**: los perfiles a los que el cliente quiere comentarle (de su ICP). Si no están definidos, pedirlos o derivarlos de los ECPs.
- **Posts a comentar**: los posts recientes de esos perfiles, provistos por el usuario o por la fuente de monitoreo que el cliente use. Si no hay posts, pedirlos. La skill no depende de ninguna herramienta de scraping en particular.

## Workflow

### 1. Cargar voz e ICP
- Voz: `brand/{slug}/brand-voice/brand-voice.current.md` (traits, espectro de tono, vocabulario sí/no).
- ICP: `brand/{slug}/go-to-market/ecps/ecps.current.md` (a qué ECP apuntar el ángulo del comentario).

### 2. Seleccionar a quién comentarle hoy
De los posts disponibles, priorizar por:
- **Frescura**: posts recientes valen mucho más (los comentarios tempranos rinden). Saltar posts viejos.
- **Relevancia**: que el post dé pie a aportar algo on-topic para los ECPs del cliente. Saltar reposts de empleo, reshares sin sustancia, posts vacíos.
- **Cooldown**: no comentar al mismo autor si ya se le comentó en los últimos días (mirar los `engagement/linkedin-comments-*.json` previos). Repartir entre perfiles.
- Tope realista: 8 a 12 comentarios por corrida.

### 3. Redactar el comentario (en la voz del cliente)
Un comentario por post, calibrado a la voz del cliente. Reglas para que NO suene a IA:
- Como par, no como cátedra. Apoyar, sumar una idea, compartir una experiencia, o enfatizar lo bueno.
- Corto: una o dos frases, una sola idea.
- En el idioma del post.
- Matar el cierre tipo aforismo de consultor ("el cuello de botella nunca fue X", "es el verdadero juego") y la antítesis "no solo... también": si la última línea podría ir en una placa de LinkedIn, borrarla. Terminar en la observación concreta, no en la moraleja.
- Sin halago de apertura vacío ("gran post", "buen punto") ni validación de métrica con floreo.
- CERO em-dashes. Comas, puntos o dos puntos.
- Si el post remite a un artículo/link: leer ese contenido y comentar un punto concreto, nunca "me lo leo".
- Un emoji cada tanto, con moderación.

### 4. Output
Escribir a `brand/{slug}/engagement/linkedin-comments-YYYY-MM-DD.json` una lista, cada item: `postUrl`, `author`, `postExcerpt`, `comment`, `ecpAngle`, `why`. Presentar también un resumen en el chat.

### 5. QA y aprobación (human-in-the-loop)
- Pasar los borradores a **Sansón** para brand-check (voz, ángulo, que no dañe relaciones).
- NUNCA auto-publicar. Dejar los comentarios listos para que un humano apruebe, edite y publique. El criterio y la última palabra son del humano; la skill saca la fricción, no comenta sola.

## Self-QA
- ¿Cada comentario suena a humano (sin aforismo de cierre, sin halago vacío, sin em-dashes)?
- ¿Apunta a un ECP del cliente y respeta su voz?
- ¿Se respetó el cooldown por autor?
- ¿Quedó claro que son borradores para aprobar, no para publicar solo?
