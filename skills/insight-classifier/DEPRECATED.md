# DEPRECATED — usa `idea-builder`

Este skill se ha consolidado en `idea-builder` (carpeta hermana en `skills/`).

`idea-builder` hace en una sola pasada:
1. Clasificación de signals en 7 tipos (lo que hacía este skill)
2. Match a pillar + asignación de canal/tipo
3. Derivación del angle_draft consultando `pov-bank.json` (la nueva BD de POV per pillar)

**No invoques `insight-classifier` directamente** — el cron `Content: Classify + Ideas — {Brand}` ahora ejecuta `idea-builder`.

Mantengo este skill en el repo por si algún subagente externo lo referencia. En un cleanup posterior puede borrarse junto con `insight-to-content-mapper`.

Fecha de deprecación: 2026-04-27.
