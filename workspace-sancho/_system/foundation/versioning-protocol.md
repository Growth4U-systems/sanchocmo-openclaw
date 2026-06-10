# Versioning Protocol — SanchoCMO

> Cada documento de cliente se guarda en su propia carpeta con versionado.

---

## Estructura de carpetas

```
brand/{slug}/{pilar}/
  {pilar}.current.md     ← activo (siempre leer este)
  v1.md          ← histórico
  v2.md          ← histórico
  history.json   ← log de versiones
  qa-log.md      ← log de QA (persistente)
  briefing.md    ← briefing de inputs (opcional)
```

---

## Resolución de rutas

Cuando un skill referencia `brand/{slug}/market.md` (en context_required o context_writes), lee/escribe `brand/{slug}/market/market.current.md`.

**Regla**: `brand/{slug}/{nombre}.md` → `brand/{slug}/{nombre}/{nombre}.current.md`

---

## Metadata en cada documento

```html
<!-- version: N | fecha: YYYY-MM-DD | skill: nombre | qa: estado | score: X/10 -->
<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->
<!-- Sources: lista de fuentes usadas -->
```

---

## Flujo de actualización

1. Comprueba si `{pilar}/{pilar}.current.md` ya existe
2. Si existe → informa: "📄 Ya existe {pilar} (v{N}, {fecha}). ¿Quieres actualizarlo?"
3. Si el usuario confirma → guarda actual como `v{N}.md`, genera nuevo como `{pilar}.current.md`, actualiza `history.json`
4. Si no confirma → no ejecutes

---

## history.json formato

```json
{
  "current": "v2",
  "versions": [
    {"version": 1, "date": "2026-02-26", "skill": "nombre", "qa": "PASS", "score": "20✅ 2⚠️ 0❌"},
    {"version": 2, "date": "2026-02-28", "skill": "nombre", "qa": "PASS", "score": "24✅ 1⚠️ 0❌"}
  ]
}
```

---

## Foundation State

Después de generar o actualizar un documento de Foundation, actualiza `brand/{slug}/foundation-state.json`:

- Documento nuevo generado → `"status": "pending-review"`
- Usuario aprueba/valida → `"status": "approved", "approved_at": "<ISO timestamp>"`
- Actualiza `updated_at` del JSON raíz

**Esto alimenta Mission Control y el doc viewer — SIN ESTO los cambios no se reflejan.**

Después de actualizar a `approved`: **SIEMPRE ejecutar `python3 scripts/regenerate.py`**.

---

## Flujo automático post-aprobación

Cuando el usuario aprueba un pilar:

1. 🎉 Celebración del logro
2. Progreso completo (15 pilares con ✅/⚠️/⬜ agrupados por 🏢/🎯/📊/👥/🎯)
3. **EJECUTAR AUTOMÁTICAMENTE el siguiente pilar** — NO pedir al usuario que escriba un comando
4. El flujo Foundation es CONTINUO: aprueba → siguiente → aprueba → siguiente
5. Solo se detiene para: confirmar inputs (regla 6 de SOUL), resolver DUDAs, o al completar los 15 pilares
6. EL USUARIO NUNCA TIENE QUE ESCRIBIR UN COMANDO PARA CONTINUAR
