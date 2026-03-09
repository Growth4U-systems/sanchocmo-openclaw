# Landing Page + Waitlist Brief — SanchoCMO

## Objetivo
Landing page en sanchocmo.ai con waitlist (email capture) para early adopters.
Deploy: Vercel. Repo: Growth4U-systems/Sancho_CMO (privado).

## Stack
- Next.js 15 (App Router) o Astro — lo que sea más rápido de montar
- Tailwind CSS
- Formulario waitlist: Supabase (tabla `waitlist` con email + timestamp) o simple Formspree/Resend
- No necesita auth, no necesita dashboard. Solo landing + email capture.

## Visual Identity
- **Paleta**: Fondo blanco (#FFFFFF / #F5F5F7), texto charcoal (#1A1A2E), texto secundario (#6B6B70), acento rust (#C45D35), hover (#A34A28), info steel blue (#2C5F7C)
- **Tipografía**: Inter (o Geist Sans). Headlines 600/700, body 400/500. Geist Mono para code snippets.
- **Estilo**: SaaS moderno limpio (Notion/Linear/Vercel vibe). White space generoso. Cards minimalistas.
- **Personaje**: Sancho Panza modernizado (rechoncho, barba, casual tech). Por ahora usar placeholder/emoji — ilustraciones profesionales vendrán después.
- **No usar**: Parchment colors, comic fonts, navy backgrounds.

## Estructura de la Landing

### Hero
- **Headline**: "Tu CMO con IA. Foundation first."
- **Subheadline**: "SanchoCMO construye tu estrategia de marketing antes de ejecutar. Descubre tu ICP, define tu posicionamiento, y ejecuta — todo en un pipeline."
- **CTA**: "Únete a la waitlist" → email input + botón
- **Social proof placeholder**: "Primeros 50 early adopters: precio locked para siempre"

### Sección: El Problema
- "Contrataste una agencia. Te pidieron el briefing. Les dijiste 'nuestro target es emprendedores'. Ejecutaron 3 meses. Cero resultados."
- "El problema no era la agencia — era que nadie se sentó a definir A QUIÉN le vendes realmente."
- Pain points: ejecutar sin estrategia, 6-10 herramientas, agencias genéricas, ChatGPT superficial

### Sección: La Solución — Foundation First
- "SanchoCMO empieza por la estrategia."
- 6 pasos visuales del Foundation DAG:
  1. Company Brief — Quién eres
  2. Market Intelligence — Tu mercado
  3. Competitor Intelligence — Tu competencia
  4. SWOT — Tus fuerzas y debilidades
  5. Niche Discovery — A quién le vendes (de verdad)
  6. Positioning — Qué les dices
- "Y después — solo después — ejecuta."

### Sección: Qué hace diferente a SanchoCMO
- Cards con USPs:
  - 🧠 Foundation completa (nadie más la ofrece)
  - 🎯 ICP Discovery con datos reales (no suposiciones)
  - 🔗 Strategy → Execution sin gap
  - 🕵️ Competitive intelligence continua
  - 🇪🇸 Nativo en español
  - 💰 €99/mes, no €10K/mes

### Sección: Pricing Preview
- 3 columnas: Starter (€49 early) | Growth ⭐ (€99 early) | Scale (€199 early)
- Badge: "Early Adopter — precio garantizado 12 meses"
- Nota: "Precios de lanzamiento. Primeros 50 clientes."
- CTA: "Reserva tu precio" → waitlist

### Sección: Anti-objeciones (FAQ)
- "¿Es otra herramienta AI más?" → No. Es un CMO que piensa antes de ejecutar.
- "¿No puedo usar ChatGPT gratis?" → ChatGPT da consejos. SanchoCMO da dirección.
- "¿Cuánto tiempo me va a llevar?" → 30 min/día × 5 días. Estrategia lista.
- "¿Y si no funciona?" → Foundation gratis si no te convence.

### Sección: Open Source
- Badge: "Open Source" con icono GitHub
- Headline: "Transparente por diseño"
- Copy: "SanchoCMO es open source. Mira cómo funciona, contribuye, o móntalo tú mismo. Sin cajas negras, sin magia — solo estrategia que puedes auditar."
- 2 columnas comparativas:
  - **Community (Gratis)**: Foundation completa, skills core, self-hosted, comunidad Discord/GitHub
  - **Pro (Hosted)**: Todo de Community + skills premium, cloud managed, soporte prioritario, updates automáticos, multi-brand
- CTA 1: "Ver en GitHub" → link al repo (github.com/Growth4U-systems/Sancho_CMO)
- CTA 2: "Probar Pro" → scroll a waitlist
- Licencia: SUL (Source Use License)

### Footer
- "SanchoCMO — Tu CMO con IA. Open Source."
- Links: GitHub, Docs (próximamente), Discord
- © 2026

## Waitlist Mechanics
- Email capture → guardar en Supabase tabla `waitlist` (email, created_at, source)
- Supabase URL: https://psapmujzxhaxraphddlv.supabase.co
- Anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI
- Confirmación inline: "🎉 ¡Estás dentro! Te avisaremos cuando lancemos."
- Alternativa si no quieres Supabase: Formspree o simple mailto

## Tono del Copy
- Directo, sin buzzwords. Como hablar con un CMO en un café.
- Dolor → Diagnóstico → Puente (el patrón de messaging aprobado)
- Español. Sin spanglish excepto términos técnicos aceptados (ICP, positioning, marketing, growth)

## Lo que NO incluye (Phase 2+)
- Blog
- Dashboard / app
- Auth / login
- Dark mode (Phase 2)
- Ilustraciones profesionales del personaje (pendiente ilustrador)
