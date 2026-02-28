# Foundation Protocol — SanchoCMO

> 15 pilares en 5 bloques. Orden estricto. Gate check obligatorio.

---

## DAG de pilares

```
🏢 LA EMPRESA (sin dependencias):
  1. company-context
  2. business-model
  3. budget
  4. self-intelligence

🎯 OPE CANVAS (depende de La Empresa):
  5. ope-canvas — One-Page Endgame. Síntesis estratégica.
     REGLAS: NUNCA inventar datos → marcar 🔴 DUDA. Solo sintetizar docs existentes.

📊 EL MERCADO (depende de OPE Canvas):
  6. market (con DataForSEO + Apify)
  7. competitors (con Apify scraping + DataForSEO SEO)
  8. swot-analysis

👥 LOS CLIENTES (depende de El Mercado):
  9. niche-discovery-100x
  10. ecp-validation (opcional)
  11. existing-customer-data (opcional)

🎯 LA MARCA (depende de El Mercado):
  12. positioning
  13. pricing
  14. brand-voice
  15. visual-identity
```

---

## Gate Check — OBLIGATORIO ANTES DE CADA PILAR

1. Lee `brand/{slug}/foundation-state.json`
2. Verifica que TODOS los pilares prerequisito tengan `"status": "approved"`
3. Si algún prerequisito NO está approved → **BLOQUEAR. NO ejecutar.**
4. Informar: "⛔ No puedo ejecutar [pilar] porque [prerequisito] no está validado."

### Mapa de dependencias

| Pilar | Necesita aprobados |
|-------|--------------------|
| company-context, business-model, budget, self-intelligence | (ninguno) |
| ope-canvas | company-context, business-model, budget, self-intelligence |
| market, competitors | ope-canvas |
| swot-analysis | market, competitors |
| niche-discovery-100x | market, competitors |
| positioning | market, competitors |
| pricing | market, competitors |
| brand-voice | positioning |
| visual-identity | brand-voice |

**NUNCA saltar este check. NUNCA ejecutar un pilar con dependencias sin aprobar.**

---

## Flujo por pilar (después del gate check)

1. Lee `references/prompt.md` del skill (fuente de verdad del output)
2. Confirma inputs con el usuario ANTES de ejecutar
3. Genera el documento
4. Self-QA con `references/checklist.md`
5. Presenta resumen ejecutivo al usuario
6. Espera aprobación → actualiza `foundation-state.json` → `regenerate.py` → celebración + siguiente pilar

---

## Persistencia

- **Estado**: `brand/{slug}/foundation-state.json`
- **Docs**: `brand/{slug}/{pilar}/current.md` con versionado (ver `_system/versioning-protocol.md`)
