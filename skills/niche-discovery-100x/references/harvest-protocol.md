# Phase 1c — Harvest de Datos Foundation Existentes
<!-- v3.3 -->

## Índice
- [Qué extraer](#qué-extraer)
- [Regla de conteo](#regla-de-conteo)
- [Degradación graceful](#degradación-graceful)

---

## Qué extraer

ANTES de cualquier investigación nueva, extraer problemas de los datos Foundation existentes:

### Check 1: competitor-intelligence (si existe)
- Cargar Battle Cards → extraer `unmet_needs[]`, `top_cons[]`, `migration_from[]`, `customer_profiles[]`
- Cada unmet_need → 1 problema JTBD. Cada top_con → 1 problema JTBD.
- Tag source: `"competitor-intelligence-lens3"`

### Check 2: market-intelligence (si existe)
- Extraer: gaps regulatorios, tendencias que crean nuevos problemas, segmentos desatendidos
- Cada gap/tendencia → 1 problema JTBD. Tag source: `"market-intelligence"`

### Check 3: self-intelligence (si existe)
- Extraer: quejas de clientes (Lens 3), feature requests
- Cada queja → 1 problema JTBD. Tag source: `"self-intelligence-lens3"`

## Regla de conteo

Después de harvest, contar problemas extraídos:

| Problemas harvested | Con >= 3 tipos de fuente | Acción |
|---------------------|--------------------------|--------|
| >= 50 | Sí | **Saltar a Phase 6** (Agrupar) |
| 30-50 | — | Proceder pero enfocarse en llenar gaps |
| < 30 | — | Proceder a stack completo de fuentes |

## Degradación graceful

Si no existen datos Foundation, notarlo y proceder:

> "No hay datos previos de competitor/market/self-intelligence. Scraping completo. Nota: la calidad será mejor si se ejecutan esos pilares primero."

El skill SIEMPRE funciona sin datos Foundation. Solo funciona MEJOR con ellos.
