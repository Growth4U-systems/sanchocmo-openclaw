# Company Brief — Hospital Capilar

> Versión: v1.5 | Fecha: 2026-03-12 | Fuente: Onboarding con Philippe (Growth4U) + Reunión análisis mercado/competidores 10/03/2026 + Datos HC 2025 (12/03/2026)
> Cambios v1.2: Stripe + Koibox integración, producto tienda online analítica hormonal, pricing benchmarks externos
> Cambios v1.3: Datos reales HC 2025 (split género, perfiles mantenimiento, protocolos HRT/CRT definidos, perfil edad jóvenes, post-Turquía 10%)
> Cambios v1.4: Insparya y Capiclinic SÍ tienen tratamientos. Pacientes insatisfechos (2 motivos). Restricción SEO home. Riesgos: perder SEO injerto + claim diagnóstico gratis
> Cambios v1.5: Insparya brand names (ActivePlasma, MesoHAir+), CR7 cofundador no embajador, sin quiz. Svenson: 1.5/5 TP, Havas Creative rebrand sept 2025, 9K IG, NK5. DTC: Manual.co, mediQuo €29.99, Keeps/Pilot/Sons NO en España. IMD: 21 clínicas.

---

## Company Identity

### Quién es Hospital Capilar

**Nombre:** Hospital Capilar
**Fundador:** Óscar Mendoza
**Año fundación:** 2021
**Sector:** Medicina y cirugía capilar
**Sede:** Madrid | Clínicas: Madrid, Murcia, Pontevedra (3 operativas)
**Expansión 2026:** 6 nuevas aperturas previstas → total 9 clínicas

### Enfoque Diferencial

Hospital Capilar trata la alopecia como una **enfermedad crónica** reconocida por la OMS — no como un problema estético. Esto se traduce en:

- **Diagnóstico médico completo en 1 consulta:** tricoscopía + analítica hormonal + pauta médica personalizada
- **Integración cirugía + tratamiento** bajo el mismo techo
- **Protocolos propios:**
  - **CRT** (Capillary Regeneration Treatment): protocolo de Plasma Rico en Plaquetas
  - **HRT** (Hair Redensification Treatment): protocolo de farmacomesoterapia adaptada a las necesidades de cada paciente
- **Pauta anual** (no mensual): diseñada para cubrir un año completo de tratamiento vs competencia que trabaja sesiones mensuales con dosis menores (más bonos)

### Producto Foco (Alcance del Proyecto)

**Tratamientos capilares no quirúrgicos** — protocolos médicos para frenar caída y regenerar pelo.

- Crecimiento orgánico: **+88% en 2 años** (971 → 1.828 tratamientos/año) sin marketing dedicado
- Baseline actual: **~152 tratamientos/mes** (orgánico puro)
- **Cirugía queda FUERA del alcance** de este proyecto

### Objetivo del Proyecto

**+€50K/mes de facturación incremental** en tratamientos capilares.
Piloto en Madrid → escalar a las demás clínicas.

### Oferta en Test

- Consulta diagnóstico completo: precio variable en prueba (€25, €50, €100, €195)
- Consulta completa €195: tricoscopía + analítica hormonal + consulta médica (descontable del bono si contrata)
- Cross-sell a bonos de tratamiento: ~€820
- 3 flujos de quiz en paralelo: corto sin pago, con pago variable, largo sin pago
- Opción adicional: filtro previo con asesor antes de pago + quiz largo para calificar antes de consulta paga
- Mandato de dirección: **cuestionar todas las suposiciones**

**Benchmarks externos analítica hormonal:**
- Eurofins: €229 perfil hormonal alopecia
- Biolabs: €35 perfil hormonal
- Otros laboratorios: €289 perfil alopecia mujer

### Infraestructura Técnica

- **Pasarela de pago:** Stripe (confirmado)
- **Producto tienda online:** Crear producto para analítica hormonal (bono diagnóstico)
- **Agenda:** Koibox — si el paciente paga el bono, se agenda automáticamente en Koibox
- **Integraciones pendientes:** Koibox + DNS + Salesforce

### Objeciones Principales del Paciente

1. **Precio** — percepción de coste alto vs productos genéricos
2. **Efectos secundarios** — miedo a fármacos (especialmente en jóvenes)
3. **Dolor** — resistencia a infiltraciones/mesoterapia

Estas 3 objeciones deben informar todo el copy, landing pages y nurturing.

### Restricciones Legales

- ❌ No mencionar fármacos por nombre
- ❌ No resultados garantizados
- ✅ Usar nombres propios de protocolos (HRT, CRT — NO mesoterapia, PRP)
- ❌ En Google Ads: no antes/después, no la palabra "hospital" en ciertos contextos

---

## Business Model

### Clasificación

- **Tipo:** B2C (paciente directo) con influencia de terceros (madre paga en segmento joven)
- **Revenue model:** Fee-for-service (consulta diagnóstica) + bonos recurrentes (tratamiento crónico) + cross-sell cirugía
- **Growth motion:** Actualmente orgánico/referidos. Transición a Marketing-Led Growth (MLG) con este proyecto.

### Funnel Actual (Tratamientos)

No existe funnel dedicado. Los 1.828 tratamientos/año llegan por:
- Llamada directa: 23%
- SEO: 20%
- Referidos: 17%
- SEM (mezclado con cirugía): 8%
- Meta (mezclado con cirugía): 8%
- Resto: walk-in, colaterales de leads de cirugía

**Dato clave:** Google convierte **5x mejor** que Meta para tratamientos.

### No-Shows por Clínica

- Madrid: **47%**
- Murcia: **40%**
- Pontevedra: **25%**

Impacto directo en funnel — cada lead captado tiene ~40-47% de probabilidad de no presentarse en Madrid.

### Referidos

**17% de las ventas** vienen de referidos **sin programa formalizado**. Oportunidad clara de sistematización.

### Unit Economics (Estimados)

- Consulta diagnóstica: €50-195 (en test)
- Bono tratamiento: ~€820
- **Margen tratamientos: 90%** (vs 40% cirugía) — justifica el foco del proyecto
- LTV paciente joven (hombre 20-28): tratamiento crónico + cirugía futura + mantenimiento post = **LTV multi-año muy alto**
- 90% de hombres jóvenes en tratamiento son **operables** → cross-sell natural a cirugía

### Datos Reales HC 2025

- **82,11% hombres** / **17,89% mujeres**
- Cada vez más jóvenes solicitan información: **23-24 años** con grados tempranos de alopecia
- Post-Turquía: **~10% del total de tratamientos**

### Segmentos de Cliente

| Segmento | % del total | Perfil | LTV |
|----------|-------------|--------|-----|
| **Hombres 20-28** (estrella) | ~80% hombres | Alopecia temprana, 23-24 años con grados tempranos (tendencia creciente). 2-4 años probando productos sin éxito, madre influye/paga | Muy alto (crónico + cirugía) |
| **Mujeres hormonales** | ~18% total (dato 2025) | Segmentar por momento vital: postparto, efluvio telógeno (estrés/estacional), perimenopausia, menopausia, envejecimiento capilar. Muchas no aptas (filtrar) | Medio |
| **Hombres 28-50 operados** | ~10% tratamientos | Mantenimiento post-cirugía, operados Turquía o España sin información de tratamiento crónico. Acuden ~3 años después cuando el pelo vuelve a caer | Medio-alto |

### Perfiles de Mantenimiento (dato HC 2025)

1. **Mantenimiento trimestral** — Pacientes que buscan pauta anual. Ventaja HC: pauta diseñada para cubrir 1 año completo vs competencia con sesiones mensuales + más bonos
2. **Hombres +45 con efectos secundarios de medicación oral** — Optan por tratamientos infiltrados (no sistémicos, menos efectos secundarios). Incluye sub-grupo **30-45 años que quieren ser padres** y dejan medicación oral → pasan a infiltrado
3. **Post-cirugía sin mantenimiento** — Operados en Turquía o España. No informados de tratamiento crónico necesario. Vuelven ~3 años después con caída activa

---

## Budget & Resources

### Inversión en Marketing

| Concepto | Importe | Nota |
|----------|---------|------|
| Meta Ads (actual, mezclado) | ~€19K/mes | Cirugía + tratamientos sin separar |
| Google Ads (actual, mezclado) | ~€14K/mes | Cirugía + tratamientos sin separar |
| SEO | ~€15K/año | Páginas informacionales |
| **Total paid actual** | **€35-40K/mes** | Todo mezclado |
| **Dedicado a tratamientos hoy** | **€0** | Nada |
| **Target aprobado tratamientos** | **€40-50K/clínica/mes** | Cuando se lance |
| **Objetivo facturación** | **€400-500K/clínica/mes** | Target por clínica |
| Clínicas satélites | €1.500-2.500/mes | Por ubicación nueva |

### Equipo Hospital Capilar

**Marketing (4 personas):**
- María Silva — CMO (contacto principal)
- Miguel Ángel Herrera — SEM Manager (Meta + Google Ads)
- +2 personas (contenido y creatividades internos)

**Comercial:**
- 1 call center + 8 asesores comerciales + 2 televenta

### Equipo Growth4U

- **Philippe** — PM coordinador
- **Alfonso** — Decisiones estratégicas
- **Ramiro** — Especialista GHL, 8 semanas a 3h/día (€3.600+IVA/mes), monta infraestructura funnel

### Gaps Críticos (Pre-lanzamiento)

- ⚠️ **Falta persona comercial dedicada a tratamientos** — sin esto no se puede escalar
- ⚠️ **Falta médico contratado para consultas diagnósticas** — bottleneck operativo

### Timeline

Proyecto de **9 semanas** (24 Feb → 25 Abr 2026). **Soft launch: semana 7 (7-11 Abr)**.

---

## Competidores Conocidos (Input para Layer 1)

1. **Insparya** — CR7 cofundador (no embajador), marketing fuerte, foco cirugía. **⚠️ SÍ tienen tratamientos con marca propia: ActivePlasma (PRP) y MesoHAir+ (mesoterapia).** Página dedicada a alopecia femenina. Diagnóstico gratuito como CTA en todas las páginas (table stakes). NO tienen quiz interactivo ni recomendación personalizada — CTA siempre teléfono/formulario. Gasto Meta Ads sigue siendo mayoría trasplante. Tienen los tratamientos pero NO los posicionan como core.
2. **Svenson** — Marca conocida, esteticistas no médicos. **Trustpilot 1.5/5 "Muy malo" (38 reviews).** NK5 los compró, inyectó dinero, nueva agencia Havas Creative. Campaña sept 2025: "No te conformes con recordar tu pelo" — humor, digital-first, fase 2 TV prevista. ~9K seguidores IG (muy bajo para 31 clínicas). Posicionan tratamientos como core pero sin credibilidad médica. Precio cirugía desde €2.575.
3. **Capilclinic** — Buen posicionamiento SEO. **⚠️ SÍ tienen tratamientos: oral, plasma y mesoterapia** (corrige asunción previa de "solo add-ons cirugía")
4. **Medical Hair** — Presencia nacional con clínicas satélites, riesgo de dilución de calidad.
5. **IMD** — Enfocado en mujeres, 21 clínicas, estética capilar, sin analítica médica.
6. **Soluciones sin supervisión médica** — Minoxidil, finasteride tópico, Olistic (700K+ clientes), Iraltone, Pilexil, champús. Ciclo 2-4 años.
7. **Turquía** — Cirugía low cost, genera sub-segmento de operados sin seguimiento.
8. **Manual.co (DTC)** — El más parecido a Keeps en España. Consultas online + suscripción medicamentos a domicilio. Farmacia autorizada. Opera en UK, Alemania, Brasil. Rebrandeó a "Voy" en otros mercados.
9. **mediQuo** — Consulta capilar online + receta por €29,99. 100% digital, prescripciones homologadas España. No compite en diagnóstico (sin tricoscopía ni analítica hormonal). Captura top-of-funnel.
10. **Keeps/Pilot/Sons** — NO operan en España (solo US, Australia, UK respectivamente).

### Pacientes Insatisfechos de Otras Clínicas (dato HC 2025)

HC recibe pacientes insatisfechos por 2 motivos:
1. **Desinformación** — Otras clínicas no informan de la necesidad de tratamiento crónico
2. **Modelo de sesiones mensuales** — Competencia trabaja sesiones mensuales con dosis menores → más bonos. HC ofrece pauta anual completa

**Qué valoran al llegar a HC:** Que no se hable directamente de injerto capilar, sino que primero se hace valoración para ver si es necesario solo tratamiento o plan combinado (tratamiento + injerto).

### Riesgos Identificados

1. **Perder posicionamiento SEO de injerto capilar** — La home posiciona para "injerto capilar Madrid" (página de clínica). No se puede perder ese posicionamiento.
2. **Perder claim "diagnóstico gratis"** — Si se pasa a consulta de pago

### Restricción SEO / Web (dato HC)

- **Home = injerto capilar** — NO tocar. Proteger posicionamiento "injerto capilar Madrid"
- **Tratamientos = página dedicada o landing page** — Todo lo de tratamientos va en página de tratamientos o landing nueva
- **Opción: bloque en home** que enlace a la página/landing de tratamientos, si procede

---

## Historial de Marketing (Tratamientos)

### Lo que funciona (general HC)
- Reels: necesidad → tratamiento → resultado
- Contenido con autoridad médica
- Celebrity endorsement
- Antes/después en formato reel

### Lo que no funciona
- Imágenes estáticas
- Mensajes corporativos impersonales
- Promesas exageradas
- Precios agresivos en creatividades

### Lo que no existe (todo por construir)
- Landing específica tratamientos
- Quiz de diagnóstico online
- Funnel dedicado a tratamientos
- Campañas paid segmentadas para tratamientos
- Nurturing / email sequences
- Testimonios de pacientes de tratamientos

---

<!-- Self-QA: PASS | 2026-03-03 v1.1 | Company Identity ✅ | Business Model ✅ | Budget ✅ | Competitors ✅ | Historial ✅ | Restricciones legales ✅ | Objeciones ✅ | No-shows ✅ | Referidos ✅ | Margen 90% ✅ | Timeline con fechas ✅ | HRT/CRT corregidos ✅ -->
