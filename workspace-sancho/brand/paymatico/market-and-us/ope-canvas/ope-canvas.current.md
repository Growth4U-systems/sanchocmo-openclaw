# OPE Canvas — Paymático
**Fecha**: 2026-03-30 | **Diseñado por**: SanchoCMO + Alex G

---

## Obvious Choice

1. **Escudo regulatorio que el cliente no puede construir solo** — Licencia BdE (#6861, desde 2013, 2ª entidad autorizada). El cliente no compra software: compra cumplimiento legal + acceso a mercados que sin licencia son inalcanzables. Obtener licencia requiere años + capital + governance.
2. **Cuentas programables con automatización IFTTT** — Único producto vivo en España. Reglas condicionales para dispersión, retención, escrow y split payments automáticos. MONEI lo explica en blogs; Paymático lo tiene en producción.
3. **Stack propietario full stack sin dependencia de terceros** — Control total de la cadena desde pasarela hasta transferencia SEPA. Mejor margen, más estabilidad, onboarding en 3 días (caso Kviku) vs 2 meses en competidores [Self-Intel, Competitive Landscape].

---

## Ideal Customer Profile (ICP)

**Cualificadores:**
- Negocios multi-ubicación o multi-entidad con complejidad financiera (franquicias, corporates con filiales, gestores de fondos de terceros)
- Volumen mínimo: >50.000€ procesados/mes
- Madurez operativa: ya están operando (no startups explorando)
- Necesitan control centralizado, dispersión automática y/o segregación de cuentas
- Decisor: CFO (más frecuente y mejor fit), CTO, CEO

**Descalificadores:**
- E-commerce puro/simple (gateway commodity — Stripe/Adyen dominan y no vale competir)
- Startups sin tracción ni volumen (<50K€/mes)
- Desarrollos 100% ad hoc fuera del producto estándar
- Supermercados (sistemas propios muy optimizados e inamovibles)
- Small merchants / autónomos (CAC > LTV)

**3 Segmentos prioritarios (Niche Discovery v4):**
1. **Franquicias multi-ubicación** — Control TPVs en tiempo real, distribución automática de royalties, marca blanca
2. **Corporates con filiales** — Cash pooling simplificado, tesorería centralizada, conciliación multi-entidad
3. **Gestores de dinero de terceros** — EAFIs, notarios, inmobiliarias: segregación de cuentas, escrow, compliance CNMV

[Fuente: Company Brief, Niche Discovery v4]

---

## Core Problem

**Funcional:** Gestión fragmentada y manual de múltiples canales de pago, cuentas bancarias y proveedores. Consume tiempo del CFO/admin, impide visibilidad en tiempo real y bloquea la escalabilidad de operaciones financieras complejas.

**Emocional:** Frustración por la opacidad ("¿mis franquiciados están reportando ventas reales?"), ansiedad por incumplimiento regulatorio ("¿documenté bien el cash pooling para Hacienda?"), y miedo a retenciones arbitrarias de fondos ("un algoritmo AML me bloqueó la cuenta sin aviso").

**Manifestaciones concretas:**
- Conciliación manual entre múltiples bancos y proveedores
- Falta de visibilidad consolidada del flujo de caja
- Dispersión de fondos manual y propensa a errores
- Para franquicias: pérdida de control y monetización sobre pagos de la red
- Para gestores: riesgo de sanción CNMV por documentación inadecuada (multas €100K-500K)

[Fuente: Company Brief, Market Analysis — Atradius: 51% ventas B2B con retrasos, 67 días promedio cobro]

---

## Core Product

1. **Payments** — Plataforma modular para procesamiento de transacciones (tarjetas, SEPA, transferencias, TPVs) con orquestación inteligente y backups para 0 transacciones perdidas
2. **Accounts** — Cuentas programables con modelo marketplace/escrow, dispersión automática, reglas IFTTT
3. **Dashboard** — Panel de control con visión consolidada en tiempo real de todos los canales (tarjetas + SEPA + TPVs + Bizum)
4. **White Label** — Solución de pagos bajo la marca del cliente, diseñada específicamente para franquicias (split payments franquiciador/franquiciado automáticos)

[Fuente: Company Brief, Self-Intel]

---

## Geography

**Fase 1 (actual):** España — Foco 100% Madrid para traction inicial. 50% del mercado B2B addressable está aquí.

**Fase 2 (2027-2028):** Barcelona + Valencia + Bilbao — Expansión natural con modelo validado. Barcelona atrae 25% del ecosistema fintech.

**Largo plazo (2029+):** Expansión UE vía licencia passporting PSD2. Potencial LATAM con adaptaciones regulatorias.

[Fuente: Company Brief (mercado actual España), Market Analysis (concentración geográfica)]

---

## Primary Market Channels

1. **LinkedIn (CEO + empresa)** — Thought leadership + prospección directa B2B. Único CEO visible del sector regulado BdE [SWOT: O5]
2. **Canales verticales** — AEF (Asociación Española de Franquiciadores), Salón Internacional de la Franquicia, consultoras especializadas. Nadie los usa — first-mover advantage [Competitive Landscape]
3. **Referidos + Partnership Abanca** — Canal actual funcional (2-3 de top 5 clientes). Mantener pero diversificar [Company Brief]
4. **Contenido educativo (blog + webinars)** — SEO long-tail vertical ("pagos para franquicias España", "escrow regulado BdE", "cash pooling pymes") + webinars con despachos fiscales [SWOT: WT3]

[Fuente: SWOT TOWS, Competitive Landscape — canales infrautilizados por competidores]

---

## Moats

### Moat #1: Regulación BdE como Barrera de Entrada — Tipo: Regulatory
Entidad de pago autorizada desde 2013 (2ª en España), nº 6861. Licencias de emisión/adquisición de tarjetas + cuentas de pago + SEPA. Obtener licencia similar requiere años y capital significativo. 12 años sin sanciones (vs Pecunpay: multa €1.3M en 2023). Se construye manteniéndola impecable y usándola como escudo regulatorio para clientes.

### Moat #2: Stack Propietario Full Stack — Tipo: Process Power
Control total de la cadena de valor desde pasarela hasta transferencia SEPA, sin dependencia de terceros. MONEI depende de bancos adquirentes para liquidación; Paycomet está limitado por estructura Sabadell. Se mantiene con inversión continua en infraestructura propia. Permite onboarding en 3 días vs 2 meses de competidores.

### Moat #3: Especialización en Modelos Complejos — Tipo: Switching Costs + Network Effects
Cuentas programables + escrow regulado + marca blanca franquicias — combinación que nadie más ofrece en España. Una vez integrado en operaciones (APIs, automatizaciones, conciliación con ERP), el coste de cambiar es altísimo. Los primeros franquiciadores captados crean presión sobre franquiciados para usar la misma plataforma.

[Fuente: Competitive Landscape — Feature Heatmap: 🟢 solo Paymático en cuentas programables, escrow y marca blanca franquicias]

---

## Endgame (3-5 años)

**Cualitativo:** Convertirse en el sistema operativo financiero de referencia para negocios multi-ubicación en España — franquicias, corporates con filiales, gestores de fondos — con independencia total de bancos tradicionales.

**Hitos cuantitativos:**
1. Conexión a cámara de compensación → IBANs propios
2. Principal Member VISA/Mastercard → Independencia total de adquirentes
3. 400+ clientes enterprise con ARPU €3.000/mes → €14.4M ARR
4. Partner marca blanca de referencia para redes de franquicias en España

**Métrica clave:** ARR >€10M en 2029 con LTV/CAC >10x

[Fuente: Company Brief — endgame declarado]

---

## Core Values

1. **Flexibilidad y adaptación** — Win-win con clientes, no perder relaciones por rigidez de precio
2. **Resolver complejidad** — Buscar operativa difícil (donde hay margen y diferenciación) vs guerra de precios en commodity
3. **Rigor regulatorio y confianza** — 12 años sin sanciones BdE como señal de seriedad
4. **Solución a medida** — Venta consultiva al problema específico del cliente, no venta de features

[Fuente: Company Brief — valores declarados por Alex G]

---

## Core Capabilities

- **Tecnología propietaria full stack** — Sin dependencia de terceros para procesamiento crítico
- **Automatización de conciliación** entre múltiples bancos, proveedores y canales
- **Dispersión programada de fondos** con reglas condicionales (IFTTT financiero)
- **Estandarización de información bancaria** para ERPs (Sage, A3, SAP Business One)
- **Gestión multi-entidad** — Múltiples bancos, cuentas y canales en un solo panel
- **Expertise regulatorio** — 12 años operando bajo supervisión BdE, PCI-DSS Nivel 1, compliance AML/KYC
- **Soluciones complejas sin desarrollo ad hoc** — Modularidad productizada
- **Onboarding regulatorio en 3 días** (caso Kviku) vs semanas/meses en competidores

[Fuente: Company Brief + Self-Intel + SWOT S2+S7]

---

## Strategy Choice

**Sales-Led Growth con producto especializado para nichos complejos** — Venta consultiva centrada en CFO/CTO de negocios multi-ubicación, apoyada por demo productizada, materials de value proof (casos éxito con ROI) y onboarding white-glove en 3 días. Canales verticales (AEF, eventos franquicias) > SEO horizontal (batalla perdida). Premium pricing basado en valor (€2K-5K/mes), no en volumen transaccional commodity.

[Fuente: SWOT TOWS — SO1+ST3, Market Analysis — Estrategia 4: Vertical SaaS]

---

## Year Picture (2026)

1. **Generar pipeline de 30+ leads/mes** (vs 5-10 actuales) — diversificando canales más allá de Abanca/referidos
2. **Capturar 60 clientes** entre franquicias y corporates mid-market (€120K MRR / €1.44M ARR)
3. **Construir prueba social digital** — 10+ reviews en G2/Capterra, 5 casos éxito publicados, CEO activo en LinkedIn
4. **Lanzar Cash Pooling as a Service** validado con 10+ clientes
5. **Equipo comercial operativo** — 2-3 SDRs + Marketing Lead contratados

[Fuente: SWOT TOWS — Action Plan Phase 1-2, Market Analysis modelo financiero]

---

## Quarterly Picture (Q2 2026)

1. **10 clientes piloto** activos (5 franquicias + 5 corporates) → €20K MRR
2. **Homepage y sales deck** rediseñados con nuevo positioning ("OS financiero para negocios complejos")
3. **Landing "3 días vs 2 meses"** operativa con caso Kviku como proof point

[Fuente: SWOT TOWS — Phase 1 Quick Wins]

---

## Monthly Picture

| KPI | Actual | Target Q2 2026 |
|-----|--------|----------------|
| Leads/mes | 5-10 | 15-20 |
| Reuniones agendadas/mes | 5-10 (100% lead→reunión) | 15-20 |
| Tasa de cierre | 20% | 25% |
| Clientes activos | ~50 | 60 |
| MRR | 🔴 DUDA — no tenemos dato actual desglosado | €20K (piloto) |
| Reviews publicadas (G2/Capterra) | 0 | 5+ |
| Posts LinkedIn CEO/mes | 0 | 8+ |
| Casos éxito publicados | 0 | 2 |

---

## 🔴 DUDAs pendientes

1. **Monthly Picture — MRR actual desglosado**: Sabemos que top 5 clientes generan ~200K€/año cada uno y el resto ~5K€/mes, pero no tenemos MRR consolidado exacto.
2. **Pricing público**: No hay pricing publicado en web. Recomendación del SWOT: publicar 3 tiers (franquicias €299/mes, corporates €999/mes, gestores €2.999/mes + fees transaccionales). ¿Aprobado?
3. **Integración Bizum**: Marcada como 🟡 en Feature Heatmap. ¿Está operativa o pendiente?
4. **Partnership Abanca detallado**: ¿Qué nivel de exclusividad/compromiso tiene? ¿Riesgo de que cambien prioridades?
5. **Equipo real**: LinkedIn muestra 2-10 empleados. ¿Cuántos son realmente y en qué roles?

---

<!-- Self-QA: PASS | 2026-03-30 -->
<!-- Completitud: 14/14 secciones ✅ -->
<!-- Obvious Choice: 3 puntos (no features) ✅ -->
<!-- ICP: cualificadores Y descalificadores ✅ -->
<!-- Core Problem: funcional + emocional ✅ -->
<!-- Core Product: 4 componentes ✅ -->
<!-- Geography: fases ✅ -->
<!-- Channels: 4 con propósito estratégico ✅ -->
<!-- 3 Moats clasificados por tipo ✅ -->
<!-- Endgame: declaración + métrica ✅ -->
<!-- Core Values: 4 (de docs, no inventados) ✅ -->
<!-- Strategy Choice: coherente con Channels + ICP ✅ -->
<!-- Monthly Picture: datos reales + DUDAs justificadas ✅ -->
<!-- Coherencia: Strategy → Channels ✅, Moats → OC ✅, Capabilities → Moats ✅ -->
<!-- Datos cruzados: Company Brief + Self-Intel + Market + Competitors + SWOT ✅ -->
