# Media Persistence Protocol

> Aplica a TODA skill de contenido que produzca un draft destinado al
> Content Engine (`brand/{slug}/content/drafts/{ideaId}/{channel}.md`).
> Sin excepciones.

## Por qué existe este protocolo

Detectamos un caso real (2026-05-06, growth4u newsletter T02-C01) en el que
el agente:

1. Escribió en el chat "Aquí tienes la imagen generada" sin haber llamado
   a ninguna herramienta de image-gen.
2. Solo describio un concepto en texto y lo presento como si fuera la
   imagen renderizada.
3. Tras la aprobacion del usuario, escribio `status: published` directo al
   frontmatter del draft sin pasar por ningun endpoint, sin persistir
   ningun asset en `media[]`, y sin haber publicado realmente nada.

El resultado: el MediaPanel en MC quedo vacio, el ContentTask quedo
marcado como `Published` sin pieza visual ni envio real, y el usuario
descubrio el desfase manualmente.

Este protocolo prohibe los tres comportamientos.

---

## Regla 1 — Nunca declarar "imagen generada" sin URL real

PROHIBIDO en cualquier mensaje del agente:

- "Aqui tienes la imagen generada para X"
- "Imagen lista"
- "He creado la imagen"
- "Image generated", "Hero ready", o equivalentes en cualquier idioma

Si NO has obtenido un URL servido por R2 (o equivalente) **en la respuesta
de un endpoint/script real**, el output debe ser explicitamente una
PROPUESTA, no una entrega:

OK:
> "Te propongo este concepto: {descripcion}. ¿Lo genero?"
> "Sugerencia de prompt para la hero: '{prompt}'. ¿Lo lanzo?"

NO OK:
> "Aqui tienes la imagen generada: {descripcion textual}"

Si el usuario aprueba la propuesta, **entonces** llamas la herramienta
(ver Regla 2) y solo despues comunicas el resultado con la URL real
embebida.

## Regla 2 — Persistir imagenes via API, nunca a mano

Las imagenes de un draft viven en `frontmatter.media[]`. La unica forma
correcta de añadirlas:

### Opcion A — Generacion (texto → imagen via provider configurado)

```bash
POST /api/content-engine/generate-image
Content-Type: application/json

{
  "slug": "{brand-slug}",
  "ideaId": "{idea-id-o-ID-del-draft}",
  "channel": "{newsletter|linkedin|x|blog|...}",
  "prompt": "{prompt completo o descripcion del hero}",
  "aspectRatio": "1.91:1",   // opcional
  "providerId": "...",        // opcional; cae a config.fixed o auto-pick
  "model": "..."              // opcional
}
```

Response (200): `{ ok: true, url, draft, providerId, model }`. La URL
servida ya esta dada de alta en `media[]` del draft. Pegar esa URL al
chat para que el usuario vea la imagen real.

### Opcion B — Subir un binario ya existente

Si tienes el archivo en disco (porque lo generaste con
`nano-banana-pro` u otra herramienta local, o porque el usuario lo
adjunto):

```bash
POST /api/content-engine/upload-media (multipart)
fields: slug, ideaId, channel
file:   binario PNG/JPG/WebP/SVG
```

Response: igual estructura. Tambien aniade a `media[]`.

### Lo que NO se hace nunca

- Editar `frontmatter.media` con `Edit`/`Write`. Va contra el contrato
  de `attachMediaToDraft` (ver `src/lib/publishing/media-helpers.ts`).
- Generar la imagen localmente y "olvidarte" de subirla. Si no esta en
  R2 + frontmatter, no existe para el resto del sistema.
- Pegar un base64 inline en el chat sin haber llamado a la API.

### Server-side guard (2026-05-06)

`updateDraft` y `attachMediaToDraft` rechazan ahora cualquier
`media[]` que no cumpla el shape canonico `MediaAsset`
(`url`, `type` mime, `source`, `created_at`). Ver
`validateMediaArray` en `src/lib/data/drafts.ts`.

Si una skill o agente intenta `PATCH /api/content-engine/drafts` con
`media: [{ localPath: ..., role: ... }]`, el endpoint devuelve 400
explicito. Esto cierra el camino API; el unico bypass es `Edit`
directo al `.md`, que **sigue prohibido por este protocolo** y se
detecta con `pnpm check:drafts` (ver mas abajo).

### Migracion de drafts heredados

Si encuentras un draft con schema legacy (`localPath`, `role`, sin
`url`):

```bash
# Carga las claves R2 primero
set -a; source ~/.openclaw/.env; set +a

# Inspecciona sin tocar nada
pnpm migrate:media -- --dry-run

# Sube a R2 sin reescribir el .md (te da la URL para inspeccion)
pnpm migrate:media -- --upload-only --slug=<slug>

# Migracion real: sube + reescribe frontmatter + borra el .jpg local
pnpm migrate:media -- --slug=<slug>
```

El script vive en `scripts/migrate-legacy-media.mts`. Es idempotente.

### Hook de CI

Antes de mergear cualquier PR que toque drafts:

```bash
pnpm check:drafts   # exit 1 si encuentra schema legacy
```

Vive en `scripts/check-legacy-media.mts`. Anyade este step a tu CI
junto a `pnpm typecheck` / `pnpm lint`.

## Regla 3 — Status del draft solo cambia via API

El frontmatter `status:` del draft es UNICAMENTE un reflejo del estado
del pipeline. Nunca lo escribas directo. Las transiciones legitimas:

| Transicion | Disparador |
|---|---|
| `drafting` → `draft` | Writer skill termina; persiste el cuerpo |
| `draft` → `approved` | Usuario aprueba (UI: `PATCH /api/content-engine/drafts`) |
| `approved` → `published` | Despacho real a la plataforma (Metricool/Beehiiv/...) confirma envio |

PROHIBIDO escribir `status: published` desde el agente. Solo lo escribe
el dispatcher, despues de un envio real con confirmacion. Si "no hay
dispatcher" para el canal en cuestion, el status correcto es
`approved` (la pieza queda lista, esperando publicacion manual).

## Regla 4 — Anti-hallucination general

Si tras intentar la operacion (Regla 2 o Regla 3) no obtienes confirmacion
del endpoint, el mensaje al usuario debe decir explicitamente que
**fallo** o que **no se ejecuto**, no que se completo. Ejemplos:

OK:
> "El endpoint generate-image devolvio 502 (provider down). El draft
> sigue sin imagen. ¿Reintento o uso otro provider?"

NO OK:
> "Imagen lista. Status published."  ← cuando nada de eso ocurrio

---

## Para skills nuevas o revisadas

Cualquier `SKILL.md` que produzca drafts (writer skills) DEBE incluir
una seccion "Media Persistence" que apunte aqui:

```markdown
## Media Persistence (obligatorio)

Esta skill cumple `_system/media-persistence-protocol.md`.
Reglas duras:
- Nunca afirmar "imagen generada" sin URL real obtenida via API.
- Persistir media via `POST /api/content-engine/generate-image` o
  `/api/content-engine/upload-media`. Nunca editar `frontmatter.media`
  a mano.
- Nunca escribir `status: published` al frontmatter desde el agente.
```

Lista de skills cubiertas (a 2026-05-06):

- `newsletter`
- `social-writer`
- `seo-content`
- `instagram-content`
- `content-atomizer`

## Routing a `content-image` (no llamar al brand skill directo)

El agente NO invoca `[brand]-visual-generator` ni `nano-banana-pro`
directamente desde una writer skill. Toda generacion/persistencia de
media para un draft pasa por `content-image`, que es la unica skill
que conoce el manifest del brand y los endpoints API.

Diferencia clave:

- `[brand]-visual-generator` (productor) = mantiene el catalogo de
  templates + style-references + manifest del cliente. Se invoca al
  onboarding y cuando se extiende el catalogo. Vive en
  `brand/{slug}/brand-book/visual-identity/`.
- `content-image` (consumidor) = lee el catalogo + invoca los
  endpoints API + persiste en `frontmatter.media[]`. Es la skill que
  las writer skills llaman.

Ver `_system/content-engine-architecture.md` seccion "Productor /
Consumidor — separacion de responsabilidades" para el diagrama
completo.
