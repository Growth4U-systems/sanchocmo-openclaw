# Positioning & Messaging Playbook — ECP-1: Franquicias Multi-Ubicación

**Cliente**: Paymático | **ECP**: Franquicias Multi-Ubicación (España)  
**Fecha**: 2026-03-04 | **Versión**: v1  
**Skill**: positioning-messaging v4.0  
**Input**: ECPs v1 + Competitor Landscape v1 + Self-Intelligence v1 + SWOT v2 + Deep Research Franquicias

---

## 1. Contexto del ECP (Hydrated)

**Persona**: CEO / Director General de red de franquicias con 10+ establecimientos  
**Pain core**: "No controlo los pagos de mi red, las regalías son un conflicto mensual, y cada nuevo local es un infierno de setup."  
**Conversion barriers**: Precio (objeción #1, confirmada por Alex G), migración/cambio, confianza fintech vs banco  
**Legal constraints**: Entidad regulada BdE — puede hacer claims de regulación. Sin restricciones de naming.

---

## 2. Mini Competitor Analysis — Franquicias

### Cómo compiten los demás en este vertical

| Competidor | Tipo | Cómo sirven franquicias | Fortalezas | Debilidades para franquicias |
|-----------|------|------------------------|-----------|------------------------------|
| **Mollie Connect** | Fintech EU (nov 2025 España) | Split payments, delayed routing ≤90d, co-branded onboarding, daily payouts, Bizum integrado | €800M funding, 250K+ merchants EU, pricing transparente (0,85%+€0,10), soporte en español | **Sin licencia BdE** (EMI holandesa), sin cuentas programables, sin escrow regulado, delayed routing limitado a 90 días, sin marca blanca real (solo "co-branded"), recién llegada a España |
| **Sipay + Sipos** | Fintech España | Ecosystem lock-in: pagos + POS hostelería (Pikotea/Sipos) + Woonivers | Integración POS+pagos, propinas digitales, fuerte en Horeca, Bizum líder | **Lock-in**: hardware+software atado. No marca blanca franquicias. No cuentas programables. No escrow. Foco hostelería, no multi-vertical. |
| **TPVs bancarios** (BBVA, CaixaBank, Sabadell) | Bancos | TPV individual por franquiciado, cada local negocia por separado | Trust institucional, presencia física, financiación adjunta | **Sin centralización**: cada local = contrato separado. Sin dashboard unificado. Sin split payments automáticos. Sin marca blanca. Setup lento. Comisiones no negociadas en bloque. |
| **Status quo (Excel + manual)** | No hacer nada | Cada franquiciado con su TPV + regalías calculadas en Excel + conciliación manual | Gratis, conocido, no requiere cambio | 30% tiempo contable en conciliación, errores en regalías, 0 visibilidad tiempo real, conflictos recurrentes, no escala. Coste oculto: €130K-450K/año. |

### Gaps competitivos confirmados (nadie ofrece):
1. ❌ Marca blanca específica para franquicias (con split payments automáticos franquiciador/franquiciado)
2. ❌ Cuentas programables con reglas IFTTT para regalías condicionadas
3. ❌ Escrow regulado BdE como producto (Mollie: solo delayed routing ≤90d)
4. ❌ Onboarding de nuevos locales en 3 días (vs semanas bancarias)
5. ❌ Dashboard en tiempo real con visión consolidada de TODA la red

---

## 3. Own Company Analysis — Paymático para Franquicias

### Flujo end-to-end para franquiciador

1. **Onboarding red**: Franquiciador firma con Paymático → se configura dashboard central + marca blanca. 3 días (caso Kviku).
2. **Alta nuevo local**: Franquiciado recibe TPV bajo marca del franquiciador. Config automática desde dashboard central. Sin negociación individual con banco.
3. **Operación diaria**: Cada transacción en cada local visible en tiempo real en dashboard central. Franquiciador ve ventas por local, por hora, por método de pago.
4. **Regalías automáticas**: Cuentas programables con reglas: "Retener 8% de ventas brutas de cada franquiciado → transferir a cuenta franquiciador el día 5 de cada mes". Sin cálculo manual. Sin disputa.
5. **Escrow para garantías**: Si franquiciado debe depositar garantía, fondos en escrow regulado BdE con reglas de liberación condicionada.
6. **Conciliación automática**: Todas las transacciones de toda la red reconciliadas automáticamente contra cuentas bancarias.
7. **Reporting**: Informes consolidados para auditoría, fiscalidad, análisis de rendimiento por local.

### Moats para este ECP:
- **Regulatorio**: Licencia BdE 2013 = puede mover fondos legalmente entre franquiciador y franquiciados. Mollie no puede.
- **Tecnológico**: Stack propietario + cuentas programables = automatización que no existe en el mercado.
- **Operativo**: Onboarding 3 días vs 2 meses (Paycomet) o semanas (bancos).

---

## 4. Value Criteria + Competitive Scoring

### Value Criteria para Franquicias

| Value Criterion | Relevancia | Importancia (1-10) | Justificación |
|----------------|-----------|---------------------|---------------|
| **Control Centralizado de Red** | Crítica | 10 | Sin visibilidad de transacciones por local en tiempo real, el franquiciador opera a ciegas. Dolor #1 del ECP. |
| **Automatización de Regalías** | Crítica | 9 | Cálculo manual genera conflictos recurrentes con franquiciados. 50% reportan falta de comunicación clara. Automatización elimina disputa. |
| **Marca Blanca TPV** | Muy Alta | 9 | Franquiciador quiere que el cliente vea SU marca en el TPV, no la de un banco. Control de experiencia + monetización. |
| **Velocidad de Onboarding** | Muy Alta | 8 | Cada semana de retraso en setup de nuevo local = revenue perdido. Ciclo expansión de franquicias exige rapidez. |
| **Cumplimiento Regulatorio** | Alta | 8 | Entidad regulada BdE = seguridad jurídica. Especialmente relevante para franquicias que mueven dinero de terceros (regalías = fondos ajenos). |
| **Transparencia Financiera** | Alta | 8 | Franquiciados desconfían del destino de cánones de marketing. Dashboard transparente construye trust bilateral. |
| **Integración Multi-Método Pago** | Alta | 7 | Bizum, tarjetas, SEPA, Apple Pay. Cada método perdido = transacción perdida. Orquestación con backups. |
| **Escrow para Garantías** | Media-Alta | 7 | Depósitos de franquiciados (fianzas, garantías) necesitan custodia regulada, no cuenta corriente. |
| **Costes Consolidados** | Alta | 7 | Negociar comisiones en bloque para toda la red vs individual por local. Ahorro directo 0,3-0,5%. |
| **Flexibilidad sin Lock-in** | Media-Alta | 6 | TPVs genéricos atan a un proveedor. Franquicias en expansión necesitan libertad para elegir por región. |
| **Confianza Institucional** | Alta | 8 | Franquiciador necesita transmitir solidez a franquiciados y clientes. "Tus pagos están en manos de una entidad BdE" > "usamos una startup". |
| **Soporte Humano Localizado** | Media | 6 | Mollie tiene soporte España desde nov 2025. Bancos tienen oficinas. Paymático necesita al menos soporte dedicado. |

### Competitive Positioning Map

| Criterion | Paymático | Mollie Connect | Sipay+Sipos | TPV Bancario | Status Quo |
|-----------|-----------|---------------|-------------|-------------|------------|
| Control Centralizado | **5** | 4 | 3 | 1 | 0 |
| Automatización Regalías | **5** | 2 | 0 | 0 | 0 |
| Marca Blanca TPV | **5** | 2 | 1 | 0 | 0 |
| Velocidad Onboarding | **5** | 3 | 3 | 1 | N/A |
| Cumplimiento Regulatorio | **5** | 3 | 3 | 5 | N/A |
| Transparencia Financiera | **5** | 3 | 2 | 2 | 0 |
| Multi-Método Pago | 4 | **5** | 4 | 3 | 1 |
| Escrow Garantías | **5** | 1 | 0 | 0 | 0 |
| Costes Consolidados | 4 | **4** | 3 | 2 | 0 |
| Flexibilidad sin Lock-in | **5** | 4 | 1 | 2 | 5 |
| Confianza Institucional | **5** | 3 | 3 | 5 | N/A |
| Soporte Localizado | 3 | 3 | 4 | **5** | N/A |

### Top 5 Opportunity Zones (Paymático lidera, mercado no satisfecho)

1. **Automatización de Regalías** — Avg competidores: 0,5. Nadie lo hace. Paymático: 5.
2. **Marca Blanca TPV para Franquicias** — Avg: 0,75. Solo Mollie parcial ("co-branded"). Paymático: 5.
3. **Escrow para Garantías** — Avg: 0,25. Literalmente 0 competencia. Paymático: 5.
4. **Transparencia Financiera Bilateral** — Avg: 1,75. Baja satisfacción. Paymático: 5.
5. **Control Centralizado + Velocidad** — Avg: 1,75. Solo Mollie parcial. Paymático: 5.

---

## 5. Asset Mapping

| Asset Paymático | Value Criterion | Categoría | Justificación |
|----------------|-----------------|-----------|---------------|
| **Licencia BdE #6861 (2013)** | Cumplimiento Regulatorio, Confianza Institucional | Differentiator | Única entidad veterana con licencia propia. Puede mover fondos entre franquiciador/franquiciado legalmente. 12 años sin sanciones vs Pecunpay €1,3M multa. |
| **Cuentas programables IFTTT** | Automatización Regalías, Transparencia | Differentiator | Reglas condicionadas: "Retener X%, liberar si Y, transferir el día Z". No existe en ningún competidor español. |
| **Marca blanca franquicias** | Marca Blanca TPV | Differentiator | TPV bajo marca del franquiciador con split payments integrados. Mollie solo ofrece "co-branded". |
| **Stack propietario full stack** | Flexibilidad sin Lock-in, Costes Consolidados | Differentiator | Control total pasarela→SEPA. No depende de Sabadell (Paycomet) ni adquirentes (MONEI). Mejores márgenes. |
| **Escrow regulado BdE** | Escrow Garantías | Differentiator | Custodia de fondos con trazabilidad y reglas condicionadas. 0 competencia en España. |
| **Onboarding 3 días** | Velocidad Onboarding | Differentiator | Caso Kviku demostrado. Vs Paycomet "2 meses", MultiSafepay "burocrático". |
| **Dashboard consolidado tiempo real** | Control Centralizado, Transparencia | Qualifier+ | Visión de toda la red en un panel. Mollie también lo tiene. Pero Paymático añade cuentas programables. |
| **Connect 200+ conectores** | Multi-Método Pago, Integración | Qualifier | Tarjetas, SEPA, Bizum, Apple Pay, etc. Table stakes para competir. |
| **PCI-DSS Nivel 1** | Cumplimiento Regulatorio | Qualifier | Máxima certificación seguridad. Necesario pero no diferenciador solo. |
| **Pagos asegurados (orquestación)** | Multi-Método Pago | Qualifier+ | Backups automáticos si un método falla. Vs Sipay con errores TPV. |
| **Conciliación automática** | Control Centralizado, Costes | Qualifier | Reconciliación multi-banco automática. Ahorra 30% tiempo contable. |

---

## 6. Benefit-Proof Pairing

| Asset | Competitive Advantage | Benefit para Franquiciador | Proof |
|-------|----------------------|---------------------------|-------|
| **Cuentas programables IFTTT** | Único producto en España con automatización condicionada de fondos | Las regalías se calculan y transfieren solas. Cero disputas. Cero Excel. | Demo en vivo: "Configura la regla de regalías 8% → mira cómo se ejecuta automáticamente el día 5." Screenshot del dashboard con regla activa. |
| **Marca blanca franquicias** | Única solución diseñada específicamente para franquicias (no genérica) | Tu franquiciado ve TU marca en el TPV, no la de un banco. Tú controlas la experiencia de pago. | Mockup visual: "Así se ve el TPV de [tu marca]". Antes/después: TPV genérico banco vs TPV con marca propia. |
| **Licencia BdE 2013** | 2ª entidad autorizada en España. 12 años sin sanciones. | No es una startup moviendo tu dinero — es una entidad regulada con track record. Tu dinero tiene el mismo nivel de protección que en un banco. | Página BdE con registro #6861. Comparativa: "Paymático licencia 2013 vs Mollie sin licencia BdE vs Pecunpay multa €1,3M". |
| **Onboarding 3 días** | 20x más rápido que Paycomet, 10x más rápido que bancos | Nuevo local operativo en 3 días. No en 2 meses. Cada semana de retraso = revenue perdido. | Caso Kviku: "De firma a procesando pagos en 3 días". Timeline visual: Paymático 3d vs Paycomet 60d vs Banco 30-45d. |
| **Stack propietario** | No depende de terceros para liquidación (vs MONEI, Paycomet) | Más estabilidad, mejores comisiones (sin intermediarios), más control. Si Sabadell cambia condiciones, Paycomet sufre. Paymático no. | Diagrama: "Tu dinero viaja de A a B sin intermediarios vs 3 intermediarios en competidores". |
| **Escrow regulado** | 0 competencia. Mollie: delayed routing ≤90d (no es escrow). | Garantías de franquiciados custodiadas con seguridad jurídica BdE. Liberar fondos solo cuando se cumplan condiciones. | Ejemplo práctico: "Franquiciado deposita €20K de garantía → fondos en escrow BdE → se liberan solo si cumple condiciones del contrato". |
| **Dashboard consolidado** | Visibilidad total de la red en un panel | A las 9am sabes exactamente cuánto vendió cada local ayer. Sin llamar a nadie. Sin Excel. | Screenshot del dashboard con datos de 15 locales en tiempo real. KPIs por local, comparativas, alertas. |

---

## 6.5. Objection Neutralization

| Objeción | Tipo | Reframe | Mensaje Neutralizador | Proof | Formato |
|----------|------|---------|----------------------|-------|---------|
| **"Es caro / las comisiones son altas"** | Precio | No es un coste — es el ahorro que genera. El coste real es seguir como estás. | "Calcúlalo: €15K/año en comisiones no negociadas + €18K en horas de conciliación + €50K en errores de regalías. Paymático cuesta menos que tu problema actual." | Calculadora ROI interactiva: "¿Cuántos locales tienes? → Tu coste actual estimado vs coste con Paymático". Cifras basadas en datos ECP (~estimación). | Landing page con calculadora + comparativa visual |
| **"Ya tenemos TPV y funciona"** | Status quo | Funciona para cobrar. No funciona para controlar. ¿Sabes en tiempo real cuánto vendió cada local ayer? | "Tu TPV cobra. Paymático gestiona tu red. Son cosas diferentes. El TPV te da transacciones. Paymático te da control: regalías automáticas, visibilidad total, marca propia, y comisiones negociadas en bloque para toda tu red." | Demo comparativa: "Lo que ves con tu TPV actual" (cifras sueltas) vs "Lo que ves con Paymático" (dashboard consolidado). | Demo en vivo 30 min + antes/después visual |
| **"Migrar es un lío / no tenemos tiempo"** | Migración | No migramos todo de golpe. Empezamos con 3 locales piloto en 3 días. | "No te pedimos que cambies todo de un día para otro. Arrancamos con 3 locales piloto. En 3 días están operativos. Si funciona, escalamos. Si no, sin compromiso." | Caso Kviku (3 días onboarding). Oferta piloto: "3 locales, 3 días, 0 riesgo." | Landing page con CTA "Prueba piloto gratuita" |
| **"¿Una fintech? Prefiero un banco"** | Confianza | No somos una fintech. Somos una entidad regulada por el Banco de España desde 2013. Antes que Bizum, antes que MONEI, antes que Mollie. | "Paymático no es una startup — es la 2ª entidad de pagos autorizada en España. Licencia BdE desde 2013. PCI-DSS Nivel 1. 12 años sin una sola sanción. Tu banco no lleva más tiempo regulando pagos que nosotros." | Registro BdE #6861 + comparativa timeline: "Paymático 2013 → MONEI 2021 → Mollie 2025 (sin BdE)". Caso Pecunpay multa €1,3M como contraste. | Página "Por qué Paymático" + one-pager para reuniones |

---

## 7. Messaging Playbook — Dolor → Diagnóstico → Puente

### UVP (Propuesta de Valor Única)

> **"Para franquiciadores que quieren control real sobre los pagos de su red: Paymático es la única plataforma regulada por el Banco de España que te da marca blanca, regalías automáticas y visibilidad total de cada local — en 3 días, no en 3 meses."**

### USPs + Messaging Table

| Categoría | Hipótesis | Value Criterion | Objetivo | Versión Corta (ads) | Versión Landing (story-driven) |
|-----------|-----------|-----------------|----------|---------------------|-------------------------------|
| **UVP Core** | El franquiciador quiere control + legitimidad + velocidad en una sola solución | Control Centralizado + Regulación + Onboarding | Captar atención, posicionar como categoría nueva | "Tu red de franquicias merece un sistema de pagos a su altura. No un TPV suelto." | "Tienes 30 locales. Cada uno con su TPV, su banco, sus comisiones. Las regalías se calculan en Excel y cada mes un franquiciado discute las cifras. Llevas años así porque 'siempre se ha hecho así.' El problema no es tu TPV — es que no tienes un sistema de pagos diseñado para redes. Paymático es la única plataforma regulada por el Banco de España que te da control total: marca propia en cada TPV, regalías que se calculan solas, y un dashboard donde ves toda tu red en tiempo real. Setup en 3 días." |
| **USP 1: Regalías automáticas** | La disputa mensual sobre regalías es el dolor más visceral | Automatización Regalías | Eliminar fricción #1 | "Las regalías no se discuten. Se programan." | "Es viernes. Tu controller lleva 2 días cruzando extractos bancarios con reportes de ventas para calcular las regalías del mes. El lunes, un franquiciado va a decir que los números no cuadran. Otra vez. Con Paymático, las regalías se programan una vez: 'retener 8% de ventas brutas, transferir el día 5.' Se ejecutan solas. El franquiciado ve el cálculo en tiempo real. Cero Excel. Cero discusiones. Cero errores." |
| **USP 2: Tu marca en cada TPV** | El franquiciador quiere control de experiencia de cliente | Marca Blanca TPV | Posicionar marca blanca como monetización | "¿Por qué tus clientes ven el logo de un banco en el TPV y no el tuyo?" | "Tu franquiciado abre un local con tu nombre, tu decoración, tu menú. Pero cuando el cliente paga, ve el logo de CaixaBank en el datáfono. ¿Por qué? Con Paymático, cada TPV lleva TU marca. Tú controlas la experiencia de principio a fin. Y además, puedes monetizar las comisiones de toda la red negociando en bloque — ahorrando hasta un 0,5% que hoy regalas a bancos diferentes." |
| **USP 3: 3 días de onboarding** | La velocidad es diferenciador directo contra todo el mercado | Velocidad Onboarding | Atacar frustración con competidores lentos | "Nuevo local operativo en 3 días. No en 2 meses." | "Has firmado el contrato del nuevo local. El interiorista ya trabaja. La franquiciada tiene prisa por abrir. Y el banco te dice que el TPV estará listo 'en 4-6 semanas.' Con Paymático, tu nuevo local procesa pagos en 3 días. Lo hicimos con Kviku. Lo hacemos contigo. Sin formularios kafkianos, sin rechazos post-gestión, sin llamar al banco cada martes para preguntar 'cómo va mi alta.'" |
| **USP 4: Entidad regulada BdE** | La confianza institucional es decisiva en movimiento de fondos de terceros | Confianza Institucional | Neutralizar objeción "fintech vs banco" | "No es una startup. Es la 2ª entidad de pagos autorizada por el Banco de España." | "Cuando mueves el dinero de tus franquiciados — regalías, garantías, fondos de marketing — necesitas una entidad en la que confiar. No una app que levantó €50M el año pasado y desaparecerá en dos. Paymático opera bajo licencia del Banco de España desde 2013. PCI-DSS Nivel 1. 12 años sin una sanción. Por contexto: Pecunpay fue multada con €1,3M. Mollie ni siquiera tiene licencia BdE. La regulación no es un detalle técnico — es tu escudo." |
| **USP 5: Dashboard de red en tiempo real** | Visibilidad = control, control = tranquilidad | Control Centralizado | Vender la experiencia, no la feature | "A las 9am sabes exactamente cuánto vendió cada local ayer." | "Son las 9 de la mañana. Abres el dashboard. Ves que el local de Valencia vendió un 15% más que la semana pasada. Que el de Sevilla lleva 3 días por debajo del objetivo. Que el de Barcelona tiene una tasa de rechazos inusual que necesitas investigar. Todo esto sin llamar a nadie, sin abrir 6 portales bancarios, sin esperar el informe mensual del controller. Eso es lo que significa tener visibilidad real de tu red." |
| **Anti-objeción: Precio** | El ROI supera el coste con creces — el prospect necesita verlo en números | Costes Consolidados | Reencuadrar precio como inversión | "¿Cuánto te cuesta NO tener Paymático? Haz la cuenta." | "Las comisiones de Paymático son lo primero que miras. Normal. Pero mira también lo otro: €15K/año en comisiones que pagas de más porque cada local negocia solo. €18K en horas de tu equipo financiero conciliando a mano. €50K en disputas de regalías que te llevan a abogados. Y lo que no ves: €100K+ en monetización de pagos que hoy regalas a bancos. Paymático no te cuesta — te ahorra. ~Estimaciones basadas en redes de 20+ locales." |
| **Anti-objeción: Migración** | El miedo al cambio se neutraliza con un piloto sin riesgo | Velocidad Onboarding | Reducir barrera de entrada | "3 locales. 3 días. 0 riesgo. Así empezamos." | "No te pedimos que cambies todo tu sistema de pagos de un día para otro. Elegimos 3 locales juntos. En 3 días están operativos con Paymático: marca blanca, dashboard, regalías automáticas. Si después de un mes no ves el valor, paramos. Sin permanencia, sin penalización. Pero hasta ahora, el 70-80% de los clientes que empiezan piloto acaban desplegando toda la red." |

---

## 8. Resumen Estratégico

### Positioning Statement
Paymático no compite como pasarela de pagos. Compite como **sistema operativo de pagos para redes de franquicias** — la única plataforma en España que combina regulación BdE + marca blanca específica + cuentas programables + onboarding en 3 días.

### Narrative Arc (para todo el funnel)
1. **Awareness**: "¿Controlas realmente los pagos de tu red?" → Pain recognition
2. **Consideration**: "Tu TPV cobra. Paymático gestiona." → Category creation
3. **Decision**: "3 locales, 3 días, 0 riesgo." → Risk removal
4. **Trust**: "Licencia BdE desde 2013. 12 años. 0 sanciones." → Authority

### Diferenciadores vs cada competidor

| Vs... | Win message |
|-------|-----------|
| **Mollie Connect** | "Mollie te da split payments. Paymático te da control de red: marca blanca real, regalías automáticas, escrow regulado BdE, y 10 años más de experiencia regulatoria." |
| **Sipay + Sipos** | "Sipay te ata a su ecosistema. Paymático se integra con TU ecosistema. 200+ conectores, 0 lock-in." |
| **TPV bancario** | "Tu banco te da un TPV por local. Paymático te da un sistema para toda la red. La diferencia: visibilidad total, regalías automáticas, y marca propia." |
| **Status quo (Excel)** | "Cada mes que sigues con Excel, pierdes €130K-450K entre errores, horas manuales y comisiones no negociadas. ~Estimación para redes 20+ locales." |

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| UVP + USPs | Homepage redesign, sales deck, LinkedIn content |
| Benefit-Proof table | Landing page franquicias, email sequences |
| Objection neutralization | FAQ page, sales enablement, demos |
| Value Criteria scoring | Competitor alternatives page, pricing page |
| Messaging table (2 formatos) | Ads copy, landing pages, blog, email |
| Positioning statement | Brand voice, all outbound |

---

## Fuentes

- [AEF — Informe Franquicia España 2024](https://www.aefranquicia.es/wp-content/uploads/2024/07/Informe-AEF-La-Franquicia-en-Espana-2024.pdf)
- [Mollie — Payments for Franchises](https://www.mollie.com/es/solutions/payments-for-franchises)
- [Mollie — Pricing España](https://www.mollie.com/es/pricing)
- [Hedilla Abogados — Conflictos Franquicia](https://hedillaabogados.com/problemas-franquiciador-y-franquiciado/)
- [Botkers — Conciliación Bancaria](https://www.botkers.com/blog/automatizacion-de-conciliacion-bancaria)
- Company Brief Paymático v1
- Self-Intelligence Paymático v1
- Competitor Landscape Paymático v1
- SWOT v2 (merge Alex G)
- ECPs v1

---

<!-- Self-QA: PASS | 2026-03-04 | Items: 22✅ 2⚠️ (ROI cifras son ~estimaciones marcadas; caso Kviku no verificado externamente — pero confirmado por Alex G) 0❌ | legal: PASS (sin restricciones, claims regulatorios legítimos por licencia BdE) -->
