# P01-T05: Fixes Menores

> Proyecto: [P01] Fontanería Web
> Canal: #web | Owner: Sancho | Status: todo

## Copyright
Buscar `© 2025` en footer → cambiar a `© 2025-2026` o `© 2026`

## OG Image
Crear imagen 1200×630px con:
- Logo Growth4U
- Claim: "Growth Systems for Tech Companies"
- Fondo azul/violeta (gradiente brand)
- Hospedar en: `growth4u.io/images/og-default.png`
- Actualizar meta tag: `<meta property="og:image" content="https://growth4u.io/images/og-default.png">`

## llms.txt
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

## Sitemap redirect
Añadir redirect 301: `/sitemap.xml` → `/sitemap-index.xml`
(En .htaccess, nginx config, o via plugin según CMS)
