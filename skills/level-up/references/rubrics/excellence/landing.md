---
type: rubric
author: alfonso + claude
date: 2026-06-25
client: internal
tags: [rubrics, excellence, landing, web, growth4u, conversion]
abstract: Rúbrica de EXCELENCIA para páginas de la web Growth4U (home + servicios). Qué hace que una página convierta y demuestre diferenciación, no solo que esté bonita. Destilada del rediseño página-a-página (home + Motor ① Organic GEO) con feedback de Alfonso + gate qa-bot/level-up.
---

# Rúbrica — Landing / página de servicio Growth4U (excelencia + conversión)

El bar visual = la landing de **influencer marketing** (`presentaciones/growth4u/f6ebf6786cfc908b/`): hero 2-col, sistema de componentes rico, copy corta, prueba con números. La página NO está terminada hasta que pasa esto. Aplica sobre la rúbrica `deliverable-html.md` y el profile `landing-pages/profiles/g4u.md`. Páginas de referencia ya construidas: `presentaciones/growth4u-web/index.html` y `servicio-motor-organic-geo.html`.

## 1. Diferenciación — ¿mata "¿en qué te diferencias de cualquier agencia?"?
- [ ] **Tabla "vs cualquier agencia"** presente: 3 columnas (competidor clásico · competidor "IA genérica" · Growth4U) con ✓/✕. Es la pieza que cierra al escéptico; sin ella la diferenciación queda afirmada, no demostrada.
- [ ] **Autoría reclamada**, no casos prestados: "no son clientes de los que aprendimos, son marcas que **nuestro equipo escaló de dentro**". El foso son las personas + entrega agéntica + tech propia (Alarife), no solo los números.
- [ ] **Método con nombre y micro-explicado**: "Trust Engine" (no "método de confianza" genérico) + 1 frase de qué es.
- [ ] **Wedge de exclusividad** explícito ("casi ninguna agencia en España…").
- [ ] **Sin jerga**: lenguaje de comprador, no siglas (AEO/GEO → "que la IA te cite"; AIO → "AI Overview de Google"; nada de "ICP" visible).

## 2. Prueba y honestidad de datos (CRÍTICO — lo caza qa-bot)
- [ ] **Toda cifra de mercado citada es correcta y bien atribuida.** Verificar fuente real antes de publicar (en el rediseño GEO: Seer es −61% no −58%; el 69% zero-click es de Flat 101 España, no SparkToro).
- [ ] **No repetir como ley un dato de fuente única contradicho** (trampa "ChatGPT convierte 9× más" = un solo case study). Suavizar o quitar.
- [ ] **Dato ilustrativo/ejemplo etiquetado COMO tal EN el propio elemento**, no escondido en el footer (el dashboard "en vivo" parece real si no se marca "ejemplo de panel").
- [ ] **Garantía atada a entrega + no-promesa de cifras**: "las cifras de los casos son resultados públicos, no una promesa de lo que conseguirás".
- [ ] Nada confidencial de clientes (Monzo, etc.).

## 3. Cierre y conversión
- [ ] **Manejo de objeciones cerca del CTA** (FAQ): plazo realista · permanencia · "¿y si ya tengo agencia?" · "para quién NO es". Respuestas con **cuerpo y argumento** (cases, mecanismo), no frases sueltas.
- [ ] **CTA = entregable concreto**, no "30 min sin coste" a secas: "te enseñamos las 5-7 búsquedas que deciden tu venta… te lo llevas lo apliques con nosotros o no".
- [ ] **Acción viva self-serve además de la llamada** (doble puerta): el **Trust Score** (`trust.growth4u.io/herramientas/trust-score-competidores`) como CTA secundario en hero + cierre, y una sección con su mock (input URL + comparativa de pilares: dónde lideras / dónde te superan). El gap que revela = lo que cerramos. Captura al que aún no quiere hablar.
- [ ] Un CTA primario claro, repetido (hero / medio / cierre).

## 4. Estructura y formato (el bar)
- [ ] **Hero 2 columnas**: izq copy corta (eyebrow de motor + h1 ≤1 línea + lede 2 frases + CTA + micro + **3 herostats con cifras reales**); der un **visual** — mock de producto (respuesta de IA animada, dashboard, tool) o ilustración. Los **mocks de producto** suelen ganar a las ilustraciones (más "producto", integran sin marco).
- [ ] **Ilustración (si se usa) integrada en el fondo, sin borde/marco de foto** (fondo transparente o = parchment). Nada de "foto enmarcada flotando".
- [ ] **Sin eyebrows de sección** que enuncian lo obvio ("El giro / Qué montamos / Nuestro foso / La prueba"). El h2 habla solo. (El eyebrow de motor en el hero sí, identifica la página.)
- [ ] **Problema + cambio/por-qué-ahora = UNA sección integrada** ("esto pasa Y está cambiando"), no dos secciones que dicen lo mismo.
- [ ] **Cada palanca/feature con cuerpo**: intro + 3 concretos de lo que incluye, no una frase.
- [ ] **Mecanismo reenfocado en la pregunta real del cliente** ("¿cómo te busca la gente?" → las búsquedas → cómo las copamos), no una lista de features.
- [ ] **FAQ = formato acordeón canónico** (`.faq` + `<details>` con marcador `+/–` naranja). Reutilizar SIEMPRE el mismo para que el cliente lo reconozca.
- [ ] Copy brutalmente corta; los números hablan. Cero "AI slop".

## 5. Proceso (cómo se llega aquí)
- Antes de publicar: pasar por **/qa-bot + /level-up en contexto independiente** (cazó errores factuales que el autor no vio).
- **Cosechar de páginas buenas existentes** (el viejo Trust Fortress aportó el mock de respuesta de IA + el statband citado + el frame "Fortaleza de Confianza").
- Página a página con Alfonso: preguntas de rigor por página (ángulo · diferenciador · casos · qué fuentes minar) → construir → validar → portar (sacar la página del generador `build-growth4u-web.py`; cada página rediseñada se desactiva ahí).
- **Falta pendiente que sube cualquier página GEO**: un pantallazo REAL de una marca citada en ChatGPT/Perplexity (convierte "te lo afirmo" en "te lo enseño").

## Fallo detectado post-entrega → destilar aquí como criterio nuevo.
