# P01-T02: Configurar Conversiones GA4

> Proyecto: [P01] Fontanería Web
> Canal: #web | Owner: Sancho | Status: todo

## Eventos a crear

GA4 ya está instalado (`G-4YBYPVQDT6`). Falta configurar eventos custom:

### Opción A: Via Google Tag Manager (recomendado)

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

### Opción B: Via gtag.js directo (si no usáis GTM)

Añadir en los puntos de conversión:
```javascript
// Cuando alguien clica "Agendar Llamada"
gtag('event', 'booking_started', { method: 'header_cta' });

// Cuando se envía un formulario
gtag('event', 'form_submit', { form_name: 'contacto' });

// Cuando se completa el Trust Score
gtag('event', 'trust_score_completed', { tool: 'trust_score_analyzer' });
```

## Marcar como conversiones en GA4

1. Ir a [GA4 Admin](https://analytics.google.com) → Property `G-4YBYPVQDT6`
2. Admin → Events → (esperar a que aparezcan los eventos nuevos, ~24h)
3. Toggle "Mark as conversion" para: `booking_started`, `form_submit`, `trust_score_completed`
