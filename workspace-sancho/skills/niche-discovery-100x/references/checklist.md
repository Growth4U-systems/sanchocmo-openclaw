# Niche Discovery v3.3 — Checklist de Self-QA
<!-- v3.3 -->

> Comprobar ANTES de entregar. Marcar cada uno: PASS | WARN (con razón) | RED (investigar).
> Entregar solo cuando 0 RED. Mostrar resultado al usuario.

---

## Completitud

- [ ] >= 50 problemas estructurados recopilados (o razón documentada de por qué menos)
- [ ] >= 3 tipos de fuente diferentes representados (no todo de una sola fuente)
- [ ] Cada problema tiene TODOS los campos: problem + why + persona + alternatives + source + jtbd_statement
- [ ] Ninguna "persona" es genérica ("dueño de negocio") — debe incluir rol + tamaño empresa + contexto
- [ ] 3-7 ECPs producidos (menos = demasiado estrecho, más = no agrupado)

## Calidad de Evidencia

- [ ] Cada problema tiene una fuente real (no inferida ni asumida)
- [ ] URLs de fuente proporcionadas donde sea posible
- [ ] Scores de confianza muestran varianza real (no todos idénticos)
- [ ] No hay problemas duplicados contados por separado para inflar números
- [ ] 5-10 URLs verificadas con web_fetch por spot-check

## Reutilización de Datos (Foundation Harvest)

- [ ] Datos Foundation existentes (competitor, market, self-intelligence) comprobados PRIMERO
- [ ] Problemas harvested de datos existentes taggeados con fuente original
- [ ] Nueva investigación llena GAPS, no duplica lo que ya existe

## Formato JTBD

- [ ] Cada jtbd_statement sigue: "Cuando [situación], quiero [motivación], para que [resultado]"
- [ ] Alternativas son REALES (incluyendo "no hacer nada", "Excel", "consultor", "proceso manual")
- [ ] Personas usan lenguaje del comprador, no lenguaje de marketing

## Triangulación

- [ ] Top 5 problemas aparecen en >= 2 fuentes independientes
- [ ] Al menos 1 problema top confirmado por voz del cliente (reviews, LinkedIn, entrevistas, case studies)
- [ ] Ningún problema top depende de una sola fuente no verificada

## Específico por Tipo de Mercado

### Si modo B2C/SMB:
- [ ] Fuentes de foros incluyen Reddit + al menos 1 foro temático
- [ ] Problemas extraídos de conversaciones reales de usuarios (no contenido de marketing)
- [ ] config.json guardado con life context words + product domain words

### Si modo B2B Enterprise:
- [ ] >= 4 tipos de fuente enterprise usados (case studies + reviews + 2 más)
- [ ] Voz de C-level o decision-maker presente en datos (earnings calls, LinkedIn, entrevistas)
- [ ] Señales de job postings trianguladas con al menos 1 otra fuente

## Triple Filter (Validación Foundation)

- [ ] Filtro SWOT aplicado: cada nicho comprobado contra Fortalezas/Oportunidades
- [ ] Filtro ICP aplicado: alcanzabilidad + fit a largo plazo evaluados
- [ ] Filtro Producto aplicado: capacidad actual para resolver comprobada
- [ ] Solo nichos PASS o PARTIAL proceden

## Archivos Intermedios

- [ ] `config.json` guardado (estrategia de búsqueda aprobada por usuario)
- [ ] `urls.json` guardado (B2C) o fuentes documentadas (B2B)
- [ ] `problems.md` guardado con todos los problemas estructurados
- [ ] `niches-raw/merged.md` guardado (nichos agrupados)
- [ ] `niches-filtered.md` guardado (post filtro de calidad)
- [ ] `niches-triple.md` guardado (post triple filter)
- [ ] `niches-confirmed.md` guardado (aprobado por usuario)
- [ ] `scored.md` guardado (deep research por nicho)

## Output

- [ ] Tabla final con las 23 columnas según schema.md
- [ ] current.md guardado + versionado (v{N}.md + history.json)
- [ ] CSV exportado (final-table.csv)
- [ ] cost-log.md generado con coste real de la run
- [ ] Flujo de datos cross-pilar documentado (qué skills downstream consumen qué)

---

## Red Flags (auto-detectar y reportar)

- > 80% de problemas de una sola fuente → FLAG: "Baja diversidad de fuentes. [n]% de [source]."
- Todos los scores de confianza idénticos → FLAG: "Sin varianza en confianza. Revisar scoring."
- Sin alternativas listadas en ningún problema → FLAG: "Alternativas vacías — investigación superficial."
- Personas genéricas → FLAG: "Personas genéricas detectadas. Añadir rol + tamaño empresa + contexto."
- < 30 problemas total → FLAG: "Insuficientes problemas ([n]/50). Considerar más fuentes."

---

## Veredicto

- **PASS** (todos chequeados, 0 red flags): Output listo
- **NEEDS WORK** (1+ sin chequear o 1 red flag): Arreglar items flaggeados, re-ejecutar
- **INSUFFICIENT** (3+ sin chequear o 2+ red flags): Volver atrás, expandir fuentes

Siempre mostrar resultado:
> "Self-QA: **PASS** — 67 problemas de 5 tipos de fuente, todos con JTBD completo, top 5 triangulados."
