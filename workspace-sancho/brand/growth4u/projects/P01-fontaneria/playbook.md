# P01 — Fontanería Web: Playbook de Ejecución

> Generado: 2026-03-15 | Owner: Equipo Growth4U | Deadline: 28 mar 2026

---

## P01-T01: Instalar Meta Pixel + Conversions API

### Paso 1: Obtener el Pixel ID
1. Ir a [Meta Events Manager](https://business.facebook.com/events_manager)
2. Seleccionar el Business Manager de Growth4U
3. Click "Connect Data Sources" → "Web" → "Meta Pixel"
4. Si ya existe un pixel → copiar el ID (formato: `123456789012345`)
5. Si no existe → crear uno nuevo con nombre "Growth4U Website"

### Paso 2: Instalar el base code
Añadir este snippet **antes del `</head>`** en TODAS las páginas de growth4u.io:

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'TU_PIXEL_ID_AQUI');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=TU_PIXEL_ID_AQUI&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
```

### Paso 3: Configurar eventos de conversión
Añadir estos eventos en los puntos clave del funnel:

**En el formulario de booking (cuando se envía):**
```html
<script>fbq('track', 'Lead', {content_name: 'booking_call'});</script>
```

**En el Trust Score Analyzer (cuando se completa):**
```html
<script>fbq('track', 'CompleteRegistration', {content_name: 'trust_score'});</script>
```

**En descargas de lead magnets:**
```html
<script>fbq('track', 'Lead', {content_name: 'lead_magnet_nombre'});</script>
```

### Paso 4: Conversions API (CAPI)
Para server-side tracking (más fiable que el pixel solo):
1. En Events Manager → Settings → Conversions API
2. "Set Up via Partner Integration" → seleccionar vuestro CMS (WordPress/Elementor/etc.)
3. O si es custom → usar el token de acceso para enviar eventos server-side

### Paso 5: Verificar
1. Instalar [Meta Pixel Helper](https://chrome.google.com/webstore/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc) en Chrome
2. Visitar growth4u.io → debería mostrar "PageView" ✅
3. Completar un booking → debería mostrar "Lead" ✅
4. Usar Trust Score → debería mostrar "CompleteRegistration" ✅

---

## P01-T02: Configurar Conversiones GA4

### Eventos a crear

GA4 ya está instalado (`G-4YBYPVQDT6`). Falta configurar eventos custom:

**Opción A: Via Google Tag Manager (recomendado)**

1. Ir a [Google Tag Manager](https://tagmanager.google.com)
2. Crear 3 tags nuevos:

| Tag | Trigger | Evento GA4 |
|-----|---------|------------|
| Booking Started | Click en botón "Agendar Llamada" / URL contiene `leadconnectorhq.com` o `now.growth4u.io` | `booking_started` |
| Form Submit | Envío de cualquier formulario de contacto | `form_submit` |
| Trust Score Complete | Página de resultados del Trust Score / evento de completado | `trust_score_completed` |

3. Para cada tag:
   - Tag type: "Google Analytics: GA4 Event"
   - Measurement ID: `G-4YBYPVQDT6`
   - Event name: `booking_started` / `form_submit` / `trust_score_completed`

**Opción B: Via gtag.js directo (si no usáis GTM)**

Añadir en los puntos de conversión:
```javascript
// Cuando alguien clica "Agendar Llamada"
gtag('event', 'booking_started', { method: 'header_cta' });

// Cuando se envía un formulario
gtag('event', 'form_submit', { form_name: 'contacto' });

// Cuando se completa el Trust Score
gtag('event', 'trust_score_completed', { tool: 'trust_score_analyzer' });
```

### Marcar como conversiones en GA4

1. Ir a [GA4 Admin](https://analytics.google.com) → Property `G-4YBYPVQDT6`
2. Admin → Events → (esperar a que aparezcan los eventos nuevos, ~24h)
3. Toggle "Mark as conversion" para: `booking_started`, `form_submit`, `trust_score_completed`

---

## P01-T03: Unificar URL de Booking

**Problema:** Hay 2 URLs de booking diferentes:
- Home/servicios: `api.leadconnectorhq.com/widget/booking/XsVb9H5fZjGeVArLn2EN`
- Recursos: `now.growth4u.io/widget/bookings/growth4u_demo`

**Solución:** Unificar todo a `now.growth4u.io` (branded, más confianza).

1. En GHL → Settings → Calendars → verificar que ambos calendarios apuntan al mismo
2. Reemplazar TODOS los links de booking en la web por: `https://now.growth4u.io/widget/bookings/growth4u_demo`
3. Buscar en el código fuente de growth4u.io todas las instancias de `leadconnectorhq.com` y reemplazar
4. Verificar que UTMs se pasan correctamente al nuevo link

---

## P01-T04: Hub /servicios/ — Copy propuesto

**Estado actual:** La página /servicios/ solo tiene 1 frase: "No hacemos marketing genérico..."

**Copy propuesto para la página hub:**

---

### SERVICIOS

# Tres formas de crecer con Growth4U

No hacemos marketing genérico. Construimos sistemas de growth que se quedan cuando nos vamos.

---

#### 🏗️ [Trust Engine](/servicios/trust-engine/)
**El sistema completo de growth basado en confianza**

4 fases. 6 meses. Fecha de fin. Un motor de adquisición que tu equipo opera solo. Reduce el CAC hasta un 70% sustituyendo dependencia de ads por confianza orgánica, referral estructurado y GEO.

→ Para empresas tech post-PMF que necesitan un sistema repetible de growth

**Resultados:** Bnext 0→500K usuarios | Bit2Me LTV 3x | Criptan +160% depósitos

[Descubre Trust Engine →](/servicios/trust-engine/)

---

#### 🎯 [Growth Marketing Tech](/servicios/growth-marketing-fintech/)
**Crecimiento por etapa: desde PMF hasta 500K usuarios**

Infraestructura de growth escalable según tu fase. Desde validación de propuesta de valor (0→tracción) hasta sistemas de captación masiva (10K→500K) y go-to-market para nuevos mercados.

→ Para startups tech en cualquier etapa que necesitan crecer sin desperdiciar budget

[Ver Growth Marketing →](/servicios/growth-marketing-fintech/)

---

#### 🔍 [GEO — Generative Engine Optimization](/servicios/geo-para-fintechs/)
**Sé la respuesta cuando tu cliente pregunta a ChatGPT**

Optimizamos tu presencia en motores de IA generativa. Cuando alguien pregunta a ChatGPT, Gemini o Perplexity por soluciones en tu sector, tu marca aparece citada. Primeros resultados en 4-8 semanas.

→ Para empresas tech que quieren captar leads de alta intención desde IA

**Resultado:** Growth4U #1-2 en Gemini para "agencia growth fintech España"

[Descubre GEO →](/servicios/geo-para-fintechs/)

---

### ¿No sabes cuál necesitas?

**Agenda 30 minutos gratis.** Analizamos tu situación y te decimos cuál encaja — o si ninguno encaja, te lo decimos también.

[Agendar llamada gratuita →](https://now.growth4u.io/widget/bookings/growth4u_demo)

---

## P01-T05: Fixes Menores

### Copyright
Buscar `© 2025` en footer → cambiar a `© 2025-2026` o `© 2026`

### OG Image
Crear imagen 1200×630px con:
- Logo Growth4U
- Claim: "Growth Systems for Tech Companies"
- Fondo azul/violeta (gradiente brand)
- Hospedar en: `growth4u.io/images/og-default.png`
- Actualizar meta tag: `<meta property="og:image" content="https://growth4u.io/images/og-default.png">`

### llms.txt
Crear archivo en `growth4u.io/llms.txt`:

```
# Growth4U — Growth Marketing for Tech Companies

## About
Growth4U is a growth marketing consultancy specialized in tech and fintech companies in Spain. Founded by Alfonso Sainz de Baranda (ex-Bnext, ex-Bit2Me). We install growth systems through our proprietary Trust Engine methodology.

## Services
- Trust Engine: 6-month program that installs a trust-based growth system. Reduces CAC up to 70%. One-time investment, system stays.
- Growth Marketing Tech: Scalable growth infrastructure by company stage (0→traction, 10K→500K users, new market entry).
- GEO (Generative Engine Optimization): Optimize presence in AI search engines (ChatGPT, Gemini, Perplexity).

## Track Record
- Bnext: 0→500,000 users, CAC reduced from €50 to €12.40
- Bit2Me: LTV increased 3x
- Criptan: +160% deposits in 6 months
- GoCardless: 10K MRR in 6 months

## Contact
- Website: https://growth4u.io
- Book a call: https://now.growth4u.io/widget/bookings/growth4u_demo
- LinkedIn: https://www.linkedin.com/in/alfonsosbla/
- Location: Madrid, Spain
```

### Sitemap redirect
Añadir redirect 301: `/sitemap.xml` → `/sitemap-index.xml`
(En .htaccess, nginx config, o via plugin según CMS)

---

## P01-T06: Warm-up Dominios Cold Email (Instantly)

### Setup en Instantly
1. Crear 2 buzones de envío (dominios diferentes al principal):
   - `alfonso@growthmails.io` (o similar) — comprar dominio secundario
   - `philippe@growthmails.io`
   - **NUNCA usar growth4u.io** para cold email — proteger reputación del dominio principal

2. Configurar DNS para cada dominio:
   - SPF: `v=spf1 include:_spf.google.com ~all`
   - DKIM: generar en Instantly → añadir registro CNAME
   - DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@growthmails.io`

3. En Instantly → "Email Accounts" → añadir ambos buzones

4. Activar warm-up automático de Instantly:
   - Warm-up: ON
   - Daily ramp up: 2 emails/día → subir 2 cada día
   - Target: 40-50 emails/día por buzón en 2 semanas
   - Reply rate objetivo warm-up: >30%

5. **NO enviar campañas reales hasta que warm-up tenga 14+ días**

### Timeline
- Día 1: Comprar dominio + configurar DNS
- Día 2: Añadir buzones en Instantly + activar warm-up
- Día 3-14: Warm-up automático (no tocar)
- Día 15+: Listo para campañas reales

---
