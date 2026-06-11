# DEPRECATED — usa `idea-builder`

Este skill se ha consolidado en `idea-builder` (carpeta hermana en `skills/`).

`idea-builder` hace en una sola pasada:
1. Clasificación de signals en 7 tipos
2. Match a pillar + asignación de canal/tipo
3. Derivación del angle_draft consultando `pov-bank.json` (la nueva BD de POV per pillar)

**Cambios respecto a este skill:**
- El angle_draft ahora es UN PÁRRAFO (60-80 palabras) que declara el POV — NO un draft / artículo / copy. La generación del contenido final pasa al writer skill después de la fase de Clarify.
- El POV se deriva de `pov-bank.json` (nuevo), no solo de `brand-voice-current.md`.

**No invoques `insight-to-content-mapper` directamente** — el cron `Content: Classify + Ideas — {Brand}` ahora ejecuta `idea-builder`.

Mantengo este skill en el repo por si algún subagente externo lo referencia. En un cleanup posterior puede borrarse junto con `insight-classifier`.

Fecha de deprecación: 2026-04-27.
