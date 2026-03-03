# Stack de Fuentes B2B Enterprise
<!-- v3.3 -->

Cuando Market Type = B2B Enterprise, el scraping de foros tiene bajo rendimiento. Usar estas fuentes en orden de prioridad (más barato/rápido primero).

## Índice
- [Source 1: Extracción de Case Studies](#source-1-extracción-de-case-studies-30-60-min)
- [Source 2: Reviews como Gap Fill](#source-2-reviews-como-gap-fill-30-60-min)
- [Source 3: Señales de Job Postings](#source-3-señales-de-job-postings-30-min)
- [Source 4: Earnings Call / Resultados](#source-4-earnings-call--resultados-30-60-min)
- [Source 5: Agendas de Congresos](#source-5-agendas-de-congresos-20-30-min)
- [Source 6: Observación LinkedIn](#source-6-observación-linkedin-30-60-min)
- [Source 7: Publicaciones Sectoriales](#source-7-publicaciones-sectoriales-30-60-min)
- [Source 8: Regulación y Compliance](#source-8-regulación-y-compliance-20-30-min)
- [Condición de Parada](#condición-de-parada)
- [Herramientas Referenciadas](#herramientas-referenciadas)

## Source 1: Extracción de Case Studies (~30-60 min)

Minar webs de competidores buscando case studies publicados. Cada case study revela un problema validado (el estado "antes").

- Primero: comprobar si competitor-intelligence ya capturó case studies en Lens 1
- Si no hay suficientes: visitar web de cada competidor → `/customers`, `/case-studies`, `/success-stories`, `/casos-de-exito`
- Extraer por case study:
  - Problema descrito (estado "antes") → `problem` field
  - Por qué les importaba → `why` field
  - Industria + tamaño empresa + rol → `persona` field
  - Qué usaban antes → `alternatives` field
  - Métricas de resultado → valida severidad del problema (informa confidence score)
- Tag source: `"case-study"`, incluir URL
- Confidence: 7-9 (case studies = problemas validados con empresas reales)

## Source 2: Reviews como Gap Fill (~30-60 min)

Solo si competitor-intelligence Lens 3 tiene pocos datos de reviews.

- Ir a G2, Capterra, TrustRadius, Gartner Peer Insights, Trustpilot para competidores no cubiertos
- Extraer sistemáticamente por plataforma:
  - Features que faltan → "Ojalá tuviera..."
  - Dolor UX/Usabilidad → "Confuso", "curva de aprendizaje empinada"
  - Problemas de soporte → "Respuesta lenta", "no ayudan"
  - Fricción de pricing → "Caro", "costes ocultos"
  - Gaps de integración → "No se conecta con..."
  - Problemas de escalabilidad → "Funciona para equipos pequeños pero..."
- Agregar: problemas mencionados por 3+ reviewers = alta confianza
- Tag source: `"G2-review"`, `"capterra-review"`, `"trustpilot-review"`, etc.
- Confidence: usar conteo de reviews como proxy (100+ reviews = 8-9, 10-50 = 5-7, <10 = 3-4)

## Source 3: Señales de Job Postings (~30 min)

Las descripciones de puesto revelan prioridades operativas — las empresas gastan dinero real en cada contratación.

- **España**: LinkedIn Jobs, InfoJobs, Indeed.es, portales sectoriales
- **Internacional**: LinkedIn Jobs, Indeed, portales sectoriales del país
- Buscar:
  - Empresas target contratando (ICP contratando = dolor activo)
  - Roles con keywords de dolor (ej: "Responsable de Operaciones de Pago", "Analista de Conciliación")
  - Roles nuevos ("Head of [área nueva]" = dolor nuevo, no hay solución incumbente)
  - "Urgente" o "incorporación inmediata" = dolor agudo
- Extraer de cada oferta:
  - Declaraciones "Te encargarás de..." → `problem` field
  - "Retos incluyen..." → `why` field
  - Rol + empresa → `persona` field
  - Herramientas/tech mencionadas → `alternatives` field
- Tag source: `"job-posting"`
- Confidence: 5-7 (señal indirecta, necesita triangulación)

## Source 4: Earnings Call / Resultados (~30-60 min)

Fuente donde C-levels hablan con transparencia de problemas (obligación regulatoria). Aplicable cuando el ICP incluye o solapa con empresas cotizadas.

- **España/Europa** (gratis):
  - Webs corporativas → sección "Relación con Inversores" (presentaciones de resultados, transcripts)
  - Seeking Alpha (registro gratuito, transcripts con delay)
  - Investing.com → sección Transcripts
  - Fincredible (transcripts gratuitos + streaming en directo)
  - CNMV → hechos relevantes, cuentas anuales (no transcripts pero sí contexto regulatorio)
- **Internacional** (gratis):
  - The Motley Fool, AlphaStreet, Koyfin (empresas US/UK)
- Buscar lenguaje de dolor: "retos", "desafíos", "prioridad estratégica", "estamos invirtiendo fuertemente en", "headwinds"
- Enfocarse en sección Q&A (más candidez que los remarks preparados)
- Extraer:
  - Problemas que CEO/CFO describe → `problem` field
  - Contexto estratégico → `why` field
  - Perfil de empresa → `persona` field
  - Enfoque actual mencionado → `alternatives` field
- Tag source: `"earnings-call"`, incluir nombre de empresa + trimestre
- Confidence: 8-10 (fuente C-level, registro público, alta fiabilidad)

## Source 5: Agendas de Congresos (~20-30 min)

Los organizadores eligen temas según lo que atrae asistentes = lo que la industria quiere resolver.

- Buscar top 3-5 congresos para la industria del ICP
- **Fuentes España** (gratis): nferias.com, eventbrite.es, webs de congresos sectoriales
- **Eventos clave España B2B**: South Summit (Madrid), DES (Málaga), MWC/4YFN (Barcelona), Future Finance Summit (Barcelona), The Last of SaaS (Madrid/Barcelona), Valencia Digital Summit
- **Internacional**: buscar con web_search "[industria] conference [país] [año]"
- Descargar/revisar agendas completas (tracks, sesiones, workshops, speakers)
- Interpretación:
  - Nombres de tracks = categorías macro de problemas
  - Títulos de sesiones = problemas específicos
  - Workshops = dolor activo (asistentes necesitan aprender CÓMO)
  - Paneles = dolor emergente/debatido
  - Recurrente en múltiples congresos = dolor validado a nivel industria
- Tag source: `"conference-agenda"`, incluir nombre de congreso
- Confidence: 6-8 (curado por organizadores, representa consenso de industria)

## Source 6: Observación LinkedIn (~30-60 min)

LinkedIn ES el foro para B2B enterprise. Los decision makers publican y comentan aquí.

- Buscar decision makers del ICP (por rol + industria) que publiquen sobre temas relevantes
- Filtros de lenguaje de dolor: "struggling with", "looking for", "frustrated by", "anyone recommend", "we switched from", "buscamos alternativa", "nos frustra", "alguien recomienda"
- Leer posts Y comentarios (los comentarios suelen ser más candidatos que los posts)
- Extraer:
  - Problema descrito → `problem` field
  - Contexto/motivación → `why` field
  - Perfil del autor → `persona` field
  - Soluciones mencionadas en comentarios → `alternatives` field
- Tag source: `"linkedin"`, incluir URL del post
- Confidence: usar engagement del post como proxy (likes + comentarios)

## Source 7: Publicaciones Sectoriales (~30-60 min)

47% de compradores B2B obtienen info de producto de publicaciones que leen regularmente.

- Identificar 2-3 publicaciones verticales para la industria del ICP (usar SparkToro free tier si no se sabe cuáles)
- **Publicaciones B2B España**: El Referente (startups/tech), Computing.es (IT enterprise), Emprendedores, Cinco Días (negocios), Funds Society (finanzas), Channel Partner (IT canal), Reason Why (marketing)
- **Internacional**: buscar con web_search "[industria] trade publication [país]"
- Escanear últimos 6 meses de contenido editorial buscando:
  - Temas recurrentes / pain points
  - Encuestas y benchmarks sectoriales (gaps entre "es" y "debería ser" = problemas)
  - Case studies (mismo que Source 1, otro canal)
  - Análisis regulatorio (nueva regulación = nuevos problemas obligatorios)
- Tag source: `"trade-publication"`, incluir nombre de publicación
- Confidence: 6-8 (curado por editores sectoriales)

## Source 8: Regulación y Compliance (~20-30 min)

Nuevas regulaciones CREAN nuevos problemas obligatorios. Especialmente relevante para fintech, salud, energía, legal.

- **Reguladores España/UE** (gratis): CNMV, Banco de España, EBA, ECB, AEPD (protección datos), BOE (leyes nuevas)
- **Internacional**: buscar regulador equivalente del país + "new regulation [industria] [año]"
- **Fuentes complementarias** (gratis): blogs de despachos de abogados (Garrigues, Cuatrecasas, Uría Menéndez publican análisis de impacto), newsletters compliance sectoriales
- Identificar: nuevos requisitos, deadlines de compliance, gaps de cumplimiento
- Extraer: cada nuevo requisito que afecte al ICP → `problem` field, deadline de compliance → `why` (urgencia)
- Tag source: `"regulatory"`, incluir nombre de regulación
- Confidence: 9-10 (problemas obligatorios, no negociables)

## Condición de Parada

Una vez tengas >= 50 problemas estructurados con >= 3 tipos de fuente distintos, proceder a Phase 6 (Agrupar). No agotar todas las fuentes si ya hay suficientes.

## Herramientas Referenciadas

Todo gratuito: Seeking Alpha / Investing.com / Fincredible / The Motley Fool / AlphaStreet (earnings calls), G2 / Capterra / TrustRadius / Gartner Peer Insights / Trustpilot (reviews), LinkedIn Jobs / InfoJobs / Indeed (job postings), SparkToro free tier (audience research), nferias.com / eventbrite.es (conferencias), web_search + web_fetch (todas las fuentes).
