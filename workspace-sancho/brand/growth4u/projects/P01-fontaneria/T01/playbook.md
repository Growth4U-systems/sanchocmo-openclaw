# P01-T01: Instalar Meta Pixel + Conversions API

> Proyecto: [P01] Fontanería Web
> Canal: #web | Owner: Sancho | Status: todo

## Paso 1: Obtener el Pixel ID
1. Ir a [Meta Events Manager](https://business.facebook.com/events_manager)
2. Seleccionar el Business Manager de Growth4U
3. Click "Connect Data Sources" → "Web" → "Meta Pixel"
4. Si ya existe un pixel → copiar el ID (formato: `123456789012345`)
5. Si no existe → crear uno nuevo con nombre "Growth4U Website"

## Paso 2: Instalar el base code
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

## Paso 3: Configurar eventos de conversión
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

## Paso 4: Conversions API (CAPI)
Para server-side tracking (más fiable que el pixel solo):
1. En Events Manager → Settings → Conversions API
2. "Set Up via Partner Integration" → seleccionar vuestro CMS (WordPress/Elementor/etc.)
3. O si es custom → usar el token de acceso para enviar eventos server-side

## Paso 5: Verificar
1. Instalar [Meta Pixel Helper](https://chrome.google.com/webstore/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc) en Chrome
2. Visitar growth4u.io → debería mostrar "PageView" ✅
3. Completar un booking → debería mostrar "Lead" ✅
4. Usar Trust Score → debería mostrar "CompleteRegistration" ✅
