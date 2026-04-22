# SEO Audit — Growth4U (growth4u.io)

> **Fecha**: 2026-04-04 | **Auditor**: Sancho CMO | **Scope**: Full site
> **Status**: DRAFT — pendiente revisión

---

## Resumen Ejecutivo

Growth4U tiene una base técnica SEO **sólida** (schema markup, meta tags, hreflangs, robots.txt bien configurado), pero enfrenta **problemas de indexación significativos** y tiene varios quick wins pendientes. El sitio tiene ~120 URLs en sitemap con ~90 posts de blog, pero históricamente Google solo ha indexado 35-84 páginas.

### 🔴 Top 5 Problemas Críticos

| # | Problema | Impacto |
|---|---------|---------|
| 1 | **Problemas de indexación** — solo 35-84 de ~120 páginas indexadas, con tendencia a la baja | ALTO |
| 2 | **Hreflang apuntando a 404** — todos los blog posts declaran hreflang `en` a `/en/blog/...` que devuelve 404 | ALTO |
| 3 | **Meta descriptions con markdown** — contienen `**bold**` que se renderiza como texto plano en SERPs | MEDIO |
| 4 | **Páginas thin content** — /servicios/ (149 chars), /casos-de-exito/ ("Próximamente"), 6 category pages | MEDIO |
| 5 | **Blog masivamente fintech** — contenido no refleja pivot a "empresas tech" general | MEDIO |

### ✅ Lo que ya está bien

- Schema markup completo (Organization, ProfessionalService, FAQPage, Article, BreadcrumbList)
- Robots.txt con reglas GEO (GPTBot, ClaudeBot, PerplexityBot — Allow: /)
- Canonical tags correctos en todas las páginas
- Estructura H1/H2 limpia
- OG tags y Twitter cards presentes
- HTTPS correcto
- Sitemap-index funcional

---

## 1. Crawlability & Indexación

### Robots.txt ✅
- **URL**: `/robots.txt` — 200 OK
- Allow: / para todos los bots
- Reglas GEO explícitas para GPTBot, ChatGPT-User, Google-Extended, OAI-SearchBot, CCBot, PerplexityBot, ClaudeBot, anthropic-ai
- Disallow: /admin, /feedback
- Apunta a `sitemap-index.xml` (correcto)

### XML Sitemap ⚠️
- **sitemap-index.xml** → OK, referencia `sitemap-0.xml`
- **sitemap-0.xml** → OK, ~120 URLs
- **sitemap.xml** → **404** (no crítico, robots.txt apunta al correcto)
- Sin `<lastmod>` en homepage, blog listing, categorías, equipo, recursos, servicios — solo los blog posts tienen lastmod
- Todos los lastmod de blog son de **Feb 2026** — indica publicación masiva en batch

### Indexación 🔴
- Según datos disponibles: el sitio ha tenido problemas de indexación post-update Google Dic 2024
- Peak: 84 páginas indexadas (Mar 2026), luego descenso
- ~120 URLs en sitemap → ~36-85 NO indexadas
- Patrón "rastreadas pero no indexadas" — señal de problema de calidad/confianza
- **Hipótesis**: batch de ~90 posts publicados en Feb 2026 pudo generar señal de contenido masivo/AI

### Canonicalización ✅
- Self-referencing canonicals correctos
- HTTPS consistente
- Trailing slash consistente

### Hreflang 🔴
- Homepage: `es` → `/`, `en` → `/en/`, `x-default` → `/` — **correcto**, `/en/` existe
- Blog posts: declaran `en` → `/en/blog/{slug}/` — **PERO /en/blog/ devuelve 404**
- **Impacto**: Google recibe señales hreflang contradictorias. Puede causar confusión de indexación.
- **Fix**: Eliminar hreflang `en` de blog posts que no tienen versión en inglés, o crear las versiones

---

## 2. Technical Foundations

### Velocidad & Core Web Vitals
- No se pudo obtener datos de PageSpeed Insights vía fetch (requiere renderizado JS)
- **Recomendación**: Verificar en Google Search Console > Core Web Vitals o ejecutar Lighthouse manualmente
- El sitio carga razonablemente rápido en navegador

### Mobile ✅
- Viewport meta tag presente: `width=device-width, initial-scale=1`
- Diseño responsive

### Seguridad ✅
- HTTPS en todo el sitio
- Sin mixed content detectado

### URL Structure ✅
- URLs limpias, descriptivas, en español
- Estructura lógica: `/blog/`, `/servicios/`, `/recursos/`, `/equipo/`
- Slugs keyword-rich: `/blog/geo-para-fintechs-guia-completa-ia-chatgpt-perplexity/`

---

## 3. On-Page SEO

### Titles ✅
- Homepage: "Growth4U | Crece más rápido sin invertir más en marketing" (55 chars) — bien
- Blog: "{Título del post} | Growth4U Blog" — formato correcto
- Servicio TE: "Trust Engine: Reduce el CAC de tu Empresa Tech un 70%" — bien

### Meta Descriptions ⚠️
- Homepage: buena (168 chars, keyword "Growth", "motor de crecimiento", "CAC")
- **Blog posts**: contienen markdown `**bold**` que se renderiza como `**GEO (Generative Engine Optimization)**` en SERPs
  - Ejemplo: `**GEO (Generative Engine Optimization)** es la disciplina que optimiza tu contenido...`
  - **Fix**: Limpiar markdown de todas las meta descriptions
- Algunos posts truncados a 200 chars — verificar

### Heading Structure ✅
- 1 H1 por página (verificado en homepage y blog)
- Jerarquía lógica H1 → H2 → H3
- Keywords en H1 y H2

### Schema Markup ✅✅
- **Homepage**: Organization + ProfessionalService + FAQPage (8 FAQs)
- **Blog posts**: Organization + Article + BreadcrumbList + FAQPage
- JSON-LD inyectado via JS — no visible en web_fetch pero sí en browser
- Muy completo para el tipo de sitio

### Imágenes ✅
- Alt text presente en todas las imágenes del blog de muestra (0 sin alt de 6 total)
- OG images con Cloudinary (dinámicas)

### Internal Linking ⚠️
- Blog post de muestra: 9 internal links, 2 external — aceptable pero podría mejorar
- **No se observa cluster/hub linking** entre posts relacionados
- Homepage linkea a blog, servicios, recursos — correcto
- **Oportunidad**: crear pillar pages que linken a posts del cluster

---

## 4. Content Quality

### Contenido Blog
- **~90 posts**, todos con lastmod de Feb 2026 → publicación masiva
- **Word count** de muestra: ~1,700 palabras — aceptable
- Estructura GEO aplicada (respuesta directa al inicio, datos, FAQs)
- **Problema**: contenido muy focalizados en "fintech" pero el positioning actual es "empresas tech"
  - Posts como: "agencia-growth-hacking-fintech-espana", "marketing-cnmv-friendly-como-escalar-tu-fintech"
  - Solo hay 6 categorías: Estrategia, GEO, Growth, guías, Marketing, Producto
  - **Falta**: contenido para SaaS, B2B tech services, marketplace — los otros ICPs

### Thin Content 🔴
- **/servicios/** — solo 149 caracteres de contenido extractado. Parece una landing con casi solo diseño/JS
- **/casos-de-exito/** — literalmente "Próximamente. Estamos preparando nuestros casos de éxito"
- **6 páginas de categoría** — típicamente thin, solo listas de posts
- **/equipo/** y subpáginas — sin verificar profundidad

### E-E-A-T
- ✅ Autores con página propia (Alfonso, Martin, Philippe)
- ✅ ProfessionalService schema
- ✅ Casos citados (BNEXT, Bit2Me, GoCardless) aunque sin case study detallado
- ⚠️ /casos-de-exito/ vacía — debilita E-E-A-T significativamente
- ⚠️ Falta "About" page dedicada (equipo existe pero no hay narrativa de empresa)

### Recursos/Lead Magnets ✅
- 9 recursos gratuitos bien estructurados (playbooks, frameworks, herramientas)
- Trust Score Analyzer como herramienta gratuita — excelente para SEO

---

## 5. Otros Hallazgos

### Versión Inglesa ⚠️
- `/en/` existe con contenido traducido (homepage)
- Blog en inglés **NO existe** (404 en `/en/blog/...`)
- Hreflang declarado para páginas que no existen → confunde a Google

### Copyright ⚠️
- Footer dice "© 2025 Growth4U" — debería ser 2026 o dinámico

### CTA de Booking
- Homepage CTA: Trust Score Analyzer (bueno, sin fricción)
- Trust Engine page: apunta a `api.leadconnectorhq.com` (GoHighLevel) — funcional
- **No hay CTA consistente** entre páginas de servicio

---

## Plan de Acción Priorizado

### 🔴 Prioridad 1 — Crítico (Semana 1)

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1.1 | **Eliminar hreflang `en` de blog posts** sin versión inglesa (o crearlas) | ALTO | Bajo |
| 1.2 | **Limpiar meta descriptions** — quitar markdown `**...**` de todas | ALTO | Bajo |
| 1.3 | **Verificar Search Console** — analizar "Rastreadas, no indexadas" para entender qué bloquea | ALTO | Bajo |

### 🟡 Prioridad 2 — Alto Impacto (Semanas 2-3)

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 2.1 | **Añadir contenido a /servicios/** — expandir con texto, FAQs, schema | ALTO | Medio |
| 2.2 | **Crear al menos 2 case studies** en /casos-de-exito/ (BNEXT, Bit2Me) | ALTO | Medio |
| 2.3 | **Desindexar o noindex categorías thin** (`/blog/categoria/`) o añadir contenido intro | MEDIO | Bajo |
| 2.4 | **Añadir lastmod a todas las URLs** del sitemap (no solo blog) | MEDIO | Bajo |

### 🟢 Prioridad 3 — Quick Wins (Semanas 3-4)

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 3.1 | **Actualizar copyright** a 2026 (o hacerlo dinámico) | Bajo | Mínimo |
| 3.2 | **Crear internal linking strategy** — pillar pages + cluster links entre posts | MEDIO | Medio |
| 3.3 | **Ampliar blog a "empresas tech"** más allá de fintech | ALTO | Alto |
| 3.4 | **Verificar Core Web Vitals** en Search Console y optimizar si necesario | MEDIO | Variable |
| 3.5 | **Añadir /about/ o sección "Sobre nosotros"** con narrativa de empresa | MEDIO | Bajo |

### 🔵 Prioridad 4 — Largo Plazo

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 4.1 | Crear versión inglesa del blog (si se quiere mercado EN) o eliminar hreflang EN completamente | MEDIO | Alto |
| 4.2 | Implementar topical clusters formales (pillar + cluster) | ALTO | Alto |
| 4.3 | Obtener backlinks de medios tech españoles para recuperar trust con Google | ALTO | Alto |
| 4.4 | Programmatic SEO para long-tail keywords de herramientas/comparativas | ALTO | Alto |

---

## Métricas de Seguimiento

| Métrica | Baseline (Abr 2026) | Target (3 meses) |
|---------|---------------------|-------------------|
| Páginas indexadas | ~84 (descendiendo) | >100 |
| Blog posts con meta desc limpia | 0% (con markdown) | 100% |
| Páginas thin content | 8+ | 0 |
| Case studies publicados | 0 | 2-3 |
| Internal links por post (media) | ~9 | 15+ |

---

<!-- Self-QA: PASS | 2026-04-04 -->
<!-- Notas: Schema verificado via browser (no via web_fetch). Hreflang EN→404 confirmado. Meta desc markdown confirmado en browser. -->
