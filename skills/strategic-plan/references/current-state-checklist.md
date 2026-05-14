# Current State Analysis — Checklist

## 1. Destino de conversión

Identificar dónde se envía al cliente potencial:

| Destino | Cómo detectar | Qué evaluar |
|---------|---------------|-------------|
| **Web** | URL en company-brief | web_fetch → CTA principal, formularios, analytics (GA4/pixel), blog, testimonios, velocidad, mobile |
| **App Store** | Links en company-brief o web | Rating, reviews, descargas, ASO |
| **Formulario** | En la web | Campos, fricción, CTA, seguimiento |
| **Agenda/Booking** | Calendly/Cal.com en web | Disponibilidad, página de booking |
| **No existe** | No hay URL, no hay app | ⚠️ GAP CRÍTICO |

## 2. Canales activos

Para cada canal detectado en web/brief, evaluar actividad y calidad:

LinkedIn, Instagram, X/Twitter, YouTube, TikTok, Blog, Newsletter, Ads (Meta Ad Library, Google Ads Transparency)

Evaluar: ¿Publica? ¿Frecuencia? ¿Engagement? ¿Followers?

## 3. Herramientas disponibles

De `stack.md` o inferido de la web. Categorías:

| Categoría | Ejemplos |
|-----------|----------|
| Analytics | GA4, Mixpanel, Hotjar |
| Social scheduling | Metricool, Buffer, Hootsuite |
| Email/ESP | Gmail, Mailchimp, Brevo, Instantly |
| CRM | HubSpot, Pipedrive, Salesforce |
| CMS | WordPress, Webflow, Framer, Ghost |
| Ads | Google Ads, Meta Ads Manager |

## 4. Contenido existente

- Casos de éxito documentados
- Lead magnets
- Presentaciones/decks
- Banco de fotos/videos propios

## 5. Output: current-state.md

```markdown
# Estado Actual — [Company Name]

## Destino de conversión
- Tipo: [web / app / formulario / agenda / no existe]
- URL: [url]
- Evaluación: [hallazgos]

## Canales activos
- [Canal]: [estado, frecuencia, evaluación]

## Herramientas
- [Categoría]: [herramienta] — [estado]

## Contenido existente
- Casos de éxito: [sí/no]
- Blog: [sí/no, frecuencia]
- Lead magnets: [sí/no]

## Gaps detectados
- ❌ [gap]
- ✅ [fortaleza]
```
