# Comments protocol — `*.commented.<ext>` siblings (SAN-15)

> Cómo Sancho debe leer y considerar el feedback que los clientes (y nosotros)
> dejamos sobre los documentos compartidos.

## TL;DR

Cuando se comparte un doc vía `/share/<token>` y alguien deja comentarios, esos
comentarios se materializan en un **archivo gemelo** al lado del original:

```
brand/<slug>/market-and-us/market/market-current.md            ← original limpio (no se toca)
brand/<slug>/market-and-us/market/current.commented.md  ← copia + comentarios appendeados
```

El archivo `current.commented.md` contiene el cuerpo idéntico al original + una
sección `## Comentarios` al final con un bloque por comentario.

## Regla para Sancho (la skill / el agente)

Cuando vayas a leer un doc canónico (ej. `{carpeta}-current.md`), **siempre chequea si
existe el sibling `*.commented.<ext>`**:

- Si **existe** → léelo en vez del original. Tiene todo lo del original más el
  feedback al final.
- Si **no existe** → usa el original como hasta ahora.

Esto aplica a:

- Lecturas para construir contexto del cliente.
- Lecturas previas a regenerar el doc (la skill toma los comentarios como input).
- Cualquier "muéstrame el doc" desde el chat.

## Formato del bloque de comentario

Cada comentario se appendea entre markers HTML que permiten ubicarlo:

```markdown
<!-- cmt:cmt_<uuid> -->
### <Author> · <YYYY-MM-DD HH:MM>
> "<anchor_text, hasta 600 chars; vacío si el comentario es del doc entero>"

<body del comentario, multilínea soportada>
<!-- /cmt:cmt_<uuid> -->
```

Los markers `<!-- cmt:... -->` son metadata operacional. No los muestres como
contenido en outputs visibles; el render del share/viewer interno los strippea.

## Ciclo de vida

- El sibling se **crea solo** cuando llega el primer comentario.
- Se **mantiene** mientras haya ≥ 1 comentario.
- Se **borra solo** cuando se elimina el último comentario — y la share view
  vuelve transparentemente al original limpio.

## Datos también disponibles en BBDD

La tabla `shared_doc_comments` indexa los mismos datos (id, autor, anchor,
fecha, body) para queries y para los overlays UI. El filesystem es la fuente
de verdad legible. La BBDD es la fuente para la vista interactiva.

Endpoint para staff: `GET /api/clients/<slug>/comments` (auth) — devuelve todos
los comentarios del cliente agrupados por `doc_path`.
