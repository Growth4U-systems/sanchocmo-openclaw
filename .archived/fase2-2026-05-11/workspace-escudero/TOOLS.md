# TOOLS.md - Escudero Local Notes

## Discord — Comportamiento en hilos

Cuando Sancho te spawna con `thread: true`, OpenClaw crea un hilo y vincula tu sesión a él. Tu output se entrega al hilo automáticamente.

- Publica tu resultado normalmente — va al hilo
- Con thinking activado, tu razonamiento intermedio NO se publica (va a thinking tokens)
- Si necesitas enviar un mensaje adicional, usa `message(action=send, target="<thread_id>")`

## Brand Files — Ruta por Cliente

Todos los archivos de brand van en `brand/{slug-cliente}/`, NUNCA en `brand/` directamente.
- Hospital Capilar → `brand/hospital-capilar/`

## Links, nunca rutas

Comparte docs como URL: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/{pilar}/current.md`
NUNCA rutas filesystem.
