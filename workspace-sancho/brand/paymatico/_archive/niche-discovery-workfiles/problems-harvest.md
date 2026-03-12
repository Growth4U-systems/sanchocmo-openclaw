# Problems Harvest — Foundation Existing Data
# Paymático | 2026-03-04
# Source: company-brief, market-intelligence, competitor-intelligence, self-intelligence, swot-v2 (Alex G inputs)

---

## From competitor-intelligence + Alex G inputs (14 problems)

P01. **Onboarding de pagos lento y burocrático** — Paycomet: "2 meses para activación, rechazos tras semanas de gestión". MultiSafepay: "rígido, burocrático y opaco — detractores entre startups". Adyen: "KYC/AML estrictos y lentos". Empresas pierden semanas/meses antes de poder procesar pagos. | source: competitor-intelligence-lens3, alex-g | confidence: 8
P02. **Retención arbitraria de fondos por algoritmos AML** — Numerosos competidores con malas reseñas por fondos bloqueados por algoritmos internos. Stripe: Trustpilot 2/5, PayPal/Zettle: account holds. Especialmente doloroso para PYMEs donde la liquidez es crítica. | source: competitor-intelligence-lens3, alex-g | confidence: 8
P03. **Rechazos técnicos de transacciones (TPV errors)** — Sipay genera alto volumen de búsquedas sobre errores de TPVs y rechazos técnicos. Transacciones perdidas = revenue perdido. | source: alex-g | confidence: 7
P04. **No existe marca blanca específica para franquicias** — Sipay/MONEI tienen white-label genérico. Ningún competidor ofrece marca blanca con split payments automáticos franquiciador/franquiciado + cuentas programables. | source: competitor-intelligence | confidence: 9
P05. **No existe escrow regulado como producto en España** — MONEI habla de "programmable money" en blog pero no lo tiene. Mollie tiene delayed routing ≤90d pero no es escrow regulado BdE. Gestores de fondos sin solución compliance. | source: competitor-intelligence | confidence: 9
P06. **No existen cuentas programables con reglas condicionales** — Nadie ofrece "retener X% hasta cumplir condición Y, liberar fondos solo si Z". Paynopain/Sipay tienen split payments básico. | source: competitor-intelligence | confidence: 9
P07. **Vendor lock-in de ecosistemas all-in-one** — Sipay crea lock-in: pagos + Sipos (hostelería) + Woonivers. Revolut: banca + adquirencia + gastos + tesorería. Stripe: OS completo. Cambiar de proveedor es costoso. | source: alex-g | confidence: 7
P08. **Customer support deficiente en plataformas globales** — Stripe: Trustpilot 2/5, soporte automatizado. Adyen: mínimo €1K/mes, no mid-market. Paycomet: 1.9/5 Trustpilot, customer service issues. | source: competitor-intelligence-lens3 | confidence: 8
P09. **Dependencia de bancos adquirentes para liquidación** — MONEI depende de bancos adquirentes, Paycomet limitado por estructura Sabadell. Stack no propietario = menor control de márgenes y estabilidad. | source: alex-g | confidence: 7
P10. **Pricing opaco en soluciones enterprise** — Paynopain no publica pricing. Modelos custom sin transparencia aumentan fricción en evaluación. | source: competitor-intelligence | confidence: 6
P11. **Estándar de UX elevado difícil de alcanzar** — Zettle: hardware "precioso", app intuitiva. Revolut: interfaz "hermosa". Stripe: DX superior. Productos B2B juzgados contra este estándar. | source: alex-g | confidence: 6
P12. **Competidores con first-mover en verticales clave** — Sipay: líder Bizum + Amazon Pay España. MONEI: integración Bizum superior. Paynopain: referente turismo/hotelería. MultiSafePay: retail. | source: alex-g | confidence: 7
P13. **Comoditización por precio en pagos** — Paycomet €19/mes, MONEI "cuanto más vendes, menos pagas", Zettle 0 costes fijos, Stripe 1,4% + €0,30. Presión a competir por comisión, no por valor. | source: alex-g | confidence: 8
P14. **Sanciones regulatorias en competidores (riesgo por asociación)** — Pecunpay: multa €1.3M BdE (2023). Confusión Paymatico/Paymentico en SERP. Riesgo reputacional por asociación con entidades sancionadas. | source: competitor-intelligence, self-intelligence | confidence: 6

## From market-intelligence (12 problems)

P15. **Facturación electrónica B2B obligatoria (2026-2027) sin preparación** — Empresas >8M€ en 2026, pymes en 2027. Multas hasta €10K. 60% PYMEs apoyan pero no están preparadas. Trigger de modernización forzada del stack financiero. | source: market-intelligence | confidence: 9
P16. **Morosidad B2B creciente: 67 días promedio de cobro** — 51% ventas B2B a crédito con retrasos. 60% PYMEs reportan extrema dificultad financiación. Cash flow como problema existencial. | source: market-intelligence | confidence: 9
P17. **Cash pooling mid-market inaccesible** — 120K empresas con 2+ filiales necesitan consolidar tesorería. Bancos tardan 6-12 meses, €10K-50K implementación. Fintechs no lo ofrecen. TAM: 240M EUR/año. | source: market-intelligence | confidence: 8
P18. **Franquicias sin control centralizado de pagos** — 1.400 cadenas, 80K establecimientos. Franquiciadores no controlan TPVs, no pueden automatizar regalías, no monetizan flujo de pagos. TAM: 384M EUR/año. | source: market-intelligence | confidence: 8
P19. **Gestores fiduciarios sin compliance digital** — 3K entidades (EAFIs, notarios, inmobiliarias). Inspecciones CNMV crecientes. Sanciones €100K-500K por documentación inadecuada. 0 soluciones integradas de escrow + audit trail. TAM: 108M EUR/año. | source: market-intelligence | confidence: 8
P20. **Open Banking APIs inmaduras para casos complejos** — PSD2/PSD3 habilitando nuevos servicios, pero APIs bancarias aún fragmentadas. Empresas que quieren construir sobre infraestructura bancaria sin ser banco encuentran friction. | source: market-intelligence | confidence: 7
P21. **Consolidación M&A reduciendo opciones** — Nexi→Paycomet, Minsait→Pecunpay. Menos proveedores independientes. Empresas con contratos existentes sufren cambios post-adquisición. | source: market-intelligence | confidence: 7
P22. **PSD3 requiere actualización de sistemas** — Nueva regulación EU facilitará nuevos proveedores PIS/AIS. Empresas actuales deberán adaptar compliance. | source: market-intelligence | confidence: 7
P23. **Ciberseguridad: aumento 15% incidentes España** — 96K incidentes en 2024. Breach en pagos = existencial para confianza. Empresas buscan certeza de seguridad. | source: market-intelligence | confidence: 7
P24. **Bizum expandiéndose a B2B sin clarity** — 28M usuarios, pero funcionalidad B2B no definida. Empresas no saben cómo integrar Bizum en flujos B2B. | source: market-intelligence | confidence: 6
P25. **Tendencia a plataformas financieras integradas** — Empresas cansadas de gestionar 10 tools (gateway + contabilidad + tesorería + reporting). Preferencia creciente por "OS financiero" único. | source: market-intelligence | confidence: 7
P26. **Embedded finance: SaaS verticales quieren ofrecer pagos** — ERPs, plataformas de gestión quieren pagos bajo su marca. Necesitan infraestructura white-label. Stripe Connect validó modelo. | source: market-intelligence | confidence: 7

## From company-brief / self-intelligence (11 problems)

P27. **Conciliación manual de operaciones multi-banco** — CFOs/admins gastan horas reconciliando transacciones entre múltiples bancos y proveedores. Error-prone, no escalable. | source: company-brief | confidence: 9
P28. **Falta de visibilidad consolidada del cash flow** — Empresas con múltiples cuentas/bancos no ven en tiempo real su posición financiera global. Decisiones con información parcial. | source: company-brief | confidence: 9
P29. **Dispersión de fondos manual y propensa a errores** — Distribución de pagos a múltiples partes (franquiciados, proveedores, filiales) requiere proceso manual repetitivo. | source: company-brief | confidence: 8
P30. **Información bancaria no estandarizada para ERPs** — Datos de diferentes bancos en formatos incompatibles. Integración con sistemas ERP requiere transformación manual. | source: company-brief | confidence: 7
P31. **Franquiciadores pierden control y monetización de pagos** — No controlan qué TPV usa cada franquiciado, no ven transacciones en tiempo real, no pueden monetizar el flujo de pagos de la red. | source: company-brief | confidence: 9
P32. **Escalabilidad de operaciones financieras complejas bloqueada** — Empresas creciendo (nuevas filiales, nuevos establecimientos) no pueden escalar sus operaciones financieras sin más headcount. | source: company-brief | confidence: 8
P33. **Multi-entidad financiera inmanejable** — Empresas con múltiples cuentas, bancos, canales y entidades jurídicas gestionan todo fragmentado. No hay panel único. | source: company-brief | confidence: 8
P34. **Activación post-contrato deficiente en sector pagos** — 20-30% de clientes que firman contrato no activan. Señal de complejidad de integración o falta de hand-holding en sector. | source: company-brief | confidence: 7
P35. **Split payments regulados inexistentes para marketplaces** — Marketplaces españoles necesitan split payments que cumplan PSD2. Soluciones existentes son básicas o no reguladas. | source: company-brief, competitor-intelligence | confidence: 8
P36. **Custodia de fondos de terceros sin solución digital** — Empresas que gestionan dinero de terceros (property managers, agencias, notarios) necesitan escrow regulado + trazabilidad. | source: company-brief | confidence: 8
P37. **Vacío de CEOs visibles en nicho pagos B2B España** — Solo Alex Saiz (MONEI) tiene visibilidad constante. Mercado sin referentes de thought leadership con credibilidad regulatoria. | source: alex-g | confidence: 6

---

## RESUMEN HARVEST

| Fuente | # Problemas | Tipos |
|--------|-------------|-------|
| competitor-intelligence + Alex G | 14 | competitor-intelligence-lens3, alex-g |
| market-intelligence | 12 | market-intelligence |
| company-brief / self-intelligence | 11 | company-brief, self-intelligence |
| **TOTAL** | **37** | **4 tipos de fuente** |

**Decisión según harvest protocol**: 30-50 problemas → Proceder con Enterprise Discovery para llenar gaps a 50+.
**Gaps a llenar**: Case studies reales de competidores (Source 1), reviews detalladas (Source 2), job postings señales (Source 3), regulación específica (Source 8).
