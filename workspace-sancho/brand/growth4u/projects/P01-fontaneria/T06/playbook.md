# P01-T06: Warm-up Dominios Cold Email (Instantly)

> Proyecto: [P01] Fontanería Web
> Canal: #prospecting | Owner: Sancho | Status: todo

## Setup en Instantly
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

## Timeline
- Día 1: Comprar dominio + configurar DNS
- Día 2: Añadir buzones en Instantly + activar warm-up
- Día 3-14: Warm-up automático (no tocar)
- Día 15+: Listo para campañas reales
