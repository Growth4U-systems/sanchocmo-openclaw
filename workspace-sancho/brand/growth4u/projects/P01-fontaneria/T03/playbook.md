# P01-T03: Unificar URL de Booking

> Proyecto: [P01] Fontanería Web
> Canal: #web | Owner: Equipo | Status: todo

## Problema
Hay 2 URLs de booking diferentes:
- Home/servicios: `api.leadconnectorhq.com/widget/booking/XsVb9H5fZjGeVArLn2EN`
- Recursos: `now.growth4u.io/widget/bookings/growth4u_demo`

## Solución
Unificar todo a `now.growth4u.io` (branded, más confianza).

1. En GHL → Settings → Calendars → verificar que ambos calendarios apuntan al mismo
2. Reemplazar TODOS los links de booking en la web por: `https://now.growth4u.io/widget/bookings/llamada-estrategica-alfonso-w`
3. Buscar en el código fuente de growth4u.io todas las instancias de `leadconnectorhq.com` y reemplazar
4. Verificar que UTMs se pasan correctamente al nuevo link
