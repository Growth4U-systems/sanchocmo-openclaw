# QA Report: Positioning & Messaging v2.1 — Hospital Capilar

**Mode**: Deep QA
**Target**: brand/hospital-capilar/positioning/current.md (v2.1)
**Fecha**: 2026-03-04

---

## Veredicto: NEEDS REVISION
**Confidence Score**: 7/10

El análisis estratégico y el messaging son sólidos. Los dolores están bien activados y el patrón funciona. Pero hay 3 errores factuales, 2 riesgos legales, 3 claims no verificables y 2 elementos estratégicos ausentes que debilitan el documento.

---

## ✅ Verified (8 claims)

1. **HC Trustpilot 4.8/5 (75+ reviews)** — Confirmado vía Trustpilot.com directo. Rating "Excellent", 75 reviews. [Fuente](https://www.trustpilot.com/review/hospitalcapilar.com)
2. **Insparya 3.8/5 Trustpilot** — Confirmado. TrustScore 3.8/5, 39 reviews España. [Fuente](https://es.trustpilot.com/review/insparya.es)
3. **30% hombres <30 con alopecia androgenética** — Consistente con múltiples fuentes médicas españolas (20-40% según rango exacto). [Fuente](https://unidadmedicaserrano.com/alopecias/alopecia-calvicie-hombres-jovenes/)
4. **70% españoles no saben qué es alopecia areata** — Verificado. Encuesta Pfizer 2024 (n=2.021). [Fuente](https://www.pfizer.es/files/Dossier_resultados_encuesta_Alopecia_Areata.pdf)
5. **~20.000 españoles operados en Turquía/año** — Verificado para 2024. [Fuente](https://www.implante-dental.biz/injerto-capilar-turquia-riesgos-precios-clinicas-espanoles/)
6. **Olistic 700K+ clientes** — Verificado vía Sifted. CAGR 529%, global. [Fuente](https://sifted.eu/articles/olistic-tops-sifted-leaderboard-southern-europe-fastest-growing-startups)
7. **+88% crecimiento orgánico HC** — Consistente con company-brief (971→1.828 tratamientos/año)
8. **3 clínicas operativas + expansión** — Consistente con company-brief (Madrid, Murcia, Pontevedra; 6 nuevas previstas)

---

## ⚠️ Discrepancies (3 encontradas)

### D1: Olistic 700K clientes — Global, no España
- **Claim**: "Olistic ~700K clientes" usado en contexto de mercado español (ECP #2)
- **Realidad**: 700K es la cifra GLOBAL de Olistic (Sifted). No se conoce el desglose por país.
- **Impacto**: Medio — infla la percepción del pipeline OTC→clínica en España
- **Fix sugerido**: Cambiar a "Olistic — 700K+ clientes globales" o eliminar la cifra. En el contexto español, usar solo "líder DTC capilar en España"

### D2: Fuentes UK aplicadas a España sin caveat
- **Claim**: "96% preocupados, 75% muy/extremadamente preocupados" (ECP #1) y "95% de primeros trasplantes = 20-35 años" (ECP #1)
- **Realidad**: El 96%/75% viene de la encuesta Regaine UK (hombres británicos). El 95% viene de HairDr (tendencias UK/globales). No son datos españoles.
- **Impacto**: Medio — la tendencia es probablemente similar pero los números exactos no aplican
- **Fix sugerido**: Añadir "(UK)" junto a la cifra, o sustituir por el dato español equivalente si existe. O usar "estudios europeos indican que >90% de hombres con caída temprana reportan preocupación"

### D3: 20M afectados mezclado con alopecia areata
- **Claim**: ECP #3 pone juntos "70% no saben qué es alopecia areata" y "20M afectados" — el lector puede entender que 20M tienen areata
- **Realidad**: Los 20M son alopecia en GENERAL (androgenética principalmente, 44.5% prevalencia masculina). La areata afecta a ~8.000 personas en España (Pfizer). Son enfermedades distintas.
- **Impacto**: Alto si se usa en copy público — desinformación médica
- **Fix sugerido**: Separar claramente: "20M con algún tipo de alopecia en España. De ellos, la mayoría sin diagnóstico médico formal. Nota: el dato del 70% refiere específicamente a alopecia areata (encuesta Pfizer 2024)"

---

## 🔴 Errors (2 encontrados)

### E1: Minoxidil "mejora circulación" — Inexacto
- **Error**: USP 1 ECP #2: "El minoxidil mejora circulación, pero si tu alopecia es hormonal..."
- **Corrección**: El mecanismo del minoxidil no es solo vasodilatación. Actúa sobre canales de potasio, prolonga fase anágena y aumenta grosor del folículo. La simplificación "mejora circulación" es un mito común pero médicamente incorrecto/incompleto. En un documento de una clínica médica, esto debilita la autoridad.
- **Fix**: Reformular a "El minoxidil actúa sobre el folículo para prolongar el ciclo de crecimiento" o simplemente eliminar el mecanismo y decir "El minoxidil funciona para ciertos patrones y no para otros"

### E2: "95% lo es" (alopecia hormonal) — Dato no citado
- **Error**: USP 1 ECP #2 landing: "si tu alopecia es hormonal — y el 95% lo es"
- **Corrección**: La androgenética es el tipo más común (~80-90% según fuentes), pero "95%" no tiene fuente verificable. Es una generalización excesiva.
- **Fix**: Cambiar a "la mayoría de alopecias" o "más del 80% de los casos de caída" con fuente

---

## 🟡 Unverifiable (3 claims)

1. **853K unidades minoxidil/año en España** — No hay datos públicos de unidades vendidas en España. Puede venir del market intelligence, pero sin fuente primaria verificable. Marcar como "estimación sectorial"
2. **84% intentan auto-tratamiento antes de consultar médico** — Sin fuente citada en el documento. Plausible pero no verificable
3. **~400-500K usuarios únicos de minoxidil** — Derivado de las 853K unidades, pero la conversión unidades→usuarios es una estimación sin base declarada

---

## ⚖️ Riesgos Legales (2 detectados)

### L1: Nombres de fármacos en documento de marketing
- **Problema**: El company-brief dice explícitamente "❌ No mencionar fármacos por nombre". El positioning doc menciona "dutasteride" (VC10, A3, ECP #2 benefit-proof), "finasteride" (ECP #2 benefit-proof), y "minoxidil" extensamente.
- **Contexto**: El doc es INTERNO (estrategia), no copy público. Pero si se usa como base para crear ads/landings, los nombres podrían filtrarse al copy final.
- **Fix sugerido**: En las secciones de messaging (lo que se publica), usar SOLO "HRT", "CRT" y "productos OTC". En las secciones analíticas internas, los nombres pueden quedarse pero marcar como "⚠️ NO PUBLICAR — solo referencia interna"

### L2: Mención directa de competidores en copy público
- **Problema**: Los messaging landings mencionan "Svenson", "Insparya", "Olistic" por nombre. Si se usan como copy directo, podría haber riesgo de publicidad comparativa ilegal (Art. 10 LCD España)
- **Fix sugerido**: En versiones landing, usar "otras clínicas" en vez de nombres. Los nombres pueden estar en el doc estratégico pero no en el copy publicable. Añadir nota: "⚠️ Nombres de competidores = referencia interna. En copy público usar genéricos"

---

## 🔲 Missing Elements (2 detectados)

### M1: Objeciones de "efectos secundarios" y "dolor" no abordadas
- **Gap**: El company-brief identifica 3 objeciones principales del paciente: (1) Precio, (2) Efectos secundarios, (3) Dolor por infiltraciones. El positioning messaging solo aborda PRECIO. Las otras 2 — que son barreras de conversión reales — no aparecen en ningún USP ni landing copy.
- **Impacto**: Alto — especialmente "efectos secundarios" para el ECP #1 (jóvenes que leen sobre finasteride/dutasteride en Reddit y tienen pánico a disfunción sexual)
- **Fix sugerido**: Añadir USP o mensaje específico por ECP que aborde:
  - Efectos secundarios: "El médico te explica los riesgos reales — no los mitos de Reddit. Y supervisa tu protocolo para ajustar si hace falta"
  - Dolor: "Las infiltraciones se hacen con anestesia local. La mayoría de pacientes las describe como 'menos de lo que esperaba'"

### M2: Falta segmento mujeres
- **Gap**: El company-brief menciona que ~50% de pacientes son mujeres (postparto, menopausia, estrés). El positioning doc tiene 0 mensajes para este segmento. Todas las 5 ECPs son masculinas.
- **Impacto**: Medio — depende de si el proyecto actual incluye mujeres o no. El company-brief las menciona pero también dice "muchas no aptas (filtrar)"
- **Fix sugerido**: Confirmar con Philippe si el proyecto incluye mujeres. Si sí, añadir ECP #6. Si no, documentar la exclusión explícitamente: "Segmento mujeres excluido del alcance del proyecto piloto — reevaluar en fase 2"

---

## Action List (Priorizada)

1. **[Crítico]** Separar dato 20M alopecia general de 70% areata (D3) — riesgo de desinformación médica
2. **[Crítico]** Marcar nombres de fármacos como "no publicar" en secciones de messaging (L1)
3. **[Crítico]** Corregir mecanismo minoxidil — inexacto para una clínica médica (E1)
4. **[Importante]** Añadir messaging sobre efectos secundarios y dolor (M1) — son 2 de 3 barreras de conversión
5. **[Importante]** Marcar nombres de competidores como "solo referencia interna" en copy (L2)
6. **[Importante]** Caveatar fuentes UK como no-españolas (D2)
7. **[Importante]** Corregir "95% hormonal" → "más del 80%" con fuente (E2)
8. **[Menor]** Caveatar Olistic 700K como cifra global (D1)
9. **[Menor]** Marcar 853K minoxidil como "estimación sin fuente primaria" (U1)
10. **[Menor]** Clarificar si mujeres están in/out del alcance (M2)
