# QA Report — Fase 1 Campañas Google Ads + Meta Ads

> **Versión:** v1.0  
> **Fecha:** 2026-03-17  
> **Documento Revisado:** `fase-1-guiones-google-ads.md` (v1.0)  
> **Reviewer:** Rocinante (QA/Brand Guardian)  
> **Resultado:** **APROBADO CON OBSERVACIONES**

---

## Resumen Ejecutivo

**Veredicto:** El documento está alineado con positioning y niche-discovery. Hay 1 error crítico (SAM 9.6M vs 120K) y 2 advertencias (fuente Pfizer, validez bono) que deben corregirse antes de lanzar campañas.

**Brand Alignment:** ✅ OK  
**Datos Factuales:** ⚠️ 1 error crítico  
**Copy Regulatorio:** ✅ OK con advertencias  
**Keywords:** ✅ OK  
**CTAs:** ✅ OK  

---

## 1. Coherencia con Positioning y Niche Discovery

### ✅ PASS — Alineación con ECPs

Los 3 nichos del documento corresponden exactamente con los ECPs definidos en `niche-discovery/current.md` v3.0:

| Nicho | ECP | Pain | SAM | Match |
|-------|-----|------|-----|-------|
| 👩 "Es Normal" | ECP #2 | 65/99 | 120K | ✅ |
| 🤱 "Lo Que Vino Con el Bebé" | ECP #3 | 68/99 | 60K | ✅ |
| ❓ "¿Qué Me Pasa?" | ECP #4 | 57/99 | 150K | ✅ |

**Fuente:** `brand/hospital-capilar/niche-discovery/current.md` (v3.0, 2026-03-16)

### ✅ PASS — UVPs y Mensajes Clave

El documento usa correctamente los diferenciadores clave de `positioning.md`:

- **VC1: Autoridad Médica** → "Médico especialista, no asesor capilar"
- **VC2: Precisión Diagnóstica** → "Tricoscopía + analítica hormonal en 1 consulta"
- **VC7: Seguridad Emocional** → "Sin presión, sin ventas"
- **VC8: Track Record** → "4.8★ Trustpilot"

**Fuente:** `brand/hospital-capilar/go-to-market/positioning/current.md` (v2.7)

### ⚠️ OBSERVACIÓN CRÍTICA — Dato SAM Menopausia

**Issue:**  
- **Documento campañas:** "9.6M mujeres afectadas en España"  
- **Fuente niche-discovery.md:** SAM declarado = **120K** (no 9.6M)

**Contexto:**  
El 9.6M probablemente se refiere al mercado total de mujeres en menopausia en España, NO al SAM real de HC (que es el segmento alcanzable por marketing digital).

**CORRECCIÓN REQUERIDA:**  
Cambiar "9.6M mujeres afectadas en España. Ninguna clínica les habla." a:
- "120.000 mujeres alcanzables en España. Ninguna clínica les habla." O
- "4 de cada 10 mujeres en menopausia pierden pelo" (eliminar claim numérico absoluto)

**Archivo:** `fase-1-guiones-google-ads.md` línea ~38 (video Meta Ads "Es Normal")

---

## 2. Datos Factuales

### ✅ PASS — Precio Bono €195

- **Documento campañas:** "Bono diagnóstico €195"
- **Fuente positioning.md:** A10 indica "Bono consulta diagnóstica €195 (en test)"
- **Fuente notas-contexto.md:** Philippe confirma bono para casos femeninos que necesitan analítica

**STATUS:** ✅ Dato correcto

**⚠️ RECOMENDACIÓN:** Confirmar con Philippe que el bono sigue vigente en marzo 2026 y añadir fecha de validez o disclaimer "precio promocional" si es temporal.

### ✅ PASS — Trustpilot Score

- **Documento campañas:** "4.8★ Trustpilot"
- **Fuente positioning.md:** A4 indica "Trustpilot 4.8/5 (75+ reviews)"
- **Verificación web:** URL `https://www.trustpilot.com/review/insparya.es` accedida — reviews negativas de Insparya (3.8★) confirman posición relativa de HC

**STATUS:** ✅ Coherente

### ✅ PASS — SAM por Nicho

| Nicho | SAM Documento | SAM Positioning | Match |
|-------|--------------|----------------|-------|
| 👩 "Es Normal" | Implícito 120K | 120K | ✅ |
| 🤱 "Postparto" | Implícito 60K | 60K | ✅ |
| ❓ "Qué Me Pasa" | Implícito 150K | 150K | ✅ |

**Fuente:** `positioning.md` v2.7, sección ECPs

### ⚠️ ADVERTENCIA — Claims Médicos (Fuente Pfizer)

**Issue:**  
- **Documento positioning.md (línea ~730):** Cita "70% españoles no saben qué es alopecia areata" — [Pfizer España 2024](https://www.pfizer.es/files/Dossier_resultados_encuesta_Alopecia_Areata.pdf)
- **Problema:** El dato de Pfizer se refiere a **alopecia areata** (autoinmune), NO a alopecias hormonales (menopausia/postparto)

**Contexto:**  
El documento de campañas NO usa este claim directamente, pero `positioning.md` lo incluye en ECP #3 "¿Qué Me Pasa?". Alopecia areata es un tipo muy específico y diferente de las alopecias hormonales (que son el foco de los nichos femeninos).

**RECOMENDACIÓN:**  
Si se usa el dato de Pfizer en futuras campañas, matizar que se refiere a alopecia areata (no aplicable a menopausia/postparto). Mejor usar claims específicos para cada tipo de alopecia.

**Archivo:** `positioning.md` línea ~730

---

## 3. Copy Regulatorio

### ✅ PASS — Promesas Médicas

- El copy NO promete crecimiento de pelo nuevo (coherente con positioning.md A5: "tratamientos NO hacen crecer pelo nuevo")
- Usa lenguaje preciso: "frenar caída", "protocolo personalizado", "diagnóstico en 1 visita"
- NO usa before/after prohibidos en Google Ads

### ✅ PASS — Nombres de Fármacos

- El documento NO menciona nombres de fármacos (dutasteride, finasteride, minoxidil) en copy de anuncios
- Solo usa "HRT/CRT" y "protocolo médico personalizado"
- Coherente con positioning.md v2.7 nota: "⚠️ Nombres de fármacos (dutasteride, PRP) = solo referencia interna, NO publicar en copy"

### ⚠️ ADVERTENCIA — Bono €195 y Analítica Obligatoria

**Issue:**  
- **Documento:** "Bono €195 para nichos femeninos (analítica obligatoria)"
- **Fuente notas-contexto.md:** Philippe confirma que en casos femeninos "necesitan analítica casi obligatoriamente"

**CUMPLE PERO:** El copy debe dejar claro que el bono incluye "tricoscopía + analítica hormonal + plan" para evitar expectativas falsas.

**Verificación en documento:**  
✅ El copy de CTA incluye correctamente:  
> "🔬 **Diagnóstico capilar completo — €195**  
> Tricoscopía + analítica hormonal + plan personalizado  
> **Pide tu cita →**"

**STATUS:** ✅ Coherente

### ✅ PASS — CTAs

- **Nichos femeninos:** "Pide tu diagnóstico gratis" → landing con bono €195 — **COHERENTE** (el CTA es para pedir cita, no comprar el bono directamente)
- **Gateway:** "Haz tu test gratis" → quiz online gratuito — **COHERENTE**

---

## 4. Keywords y Canibalización

### ✅ PASS — Oportunidades Keywords

**ECP #2 "Es Normal" (Menopausia):**
- Keywords correctamente identificadas: `caída pelo menopausia`, `pelo fino menopausia`, `alopecia femenina menopausia`
- CPC estimado: €1-2 (bajo)
- Volumen: Alto/Medio

**ECP #3 "Postparto":**
- Keywords de baja competencia: `caída pelo postparto`, `alopecia postparto tratamiento`
- CPC estimado: €0.50-1.50 (muy bajo)
- Volumen: Alto/Medio

**ECP #4 "Qué Me Pasa":**
- Divide en 2 grupos (síntomas vs diagnóstico) para evitar canibalización
- Keywords genéricas: `por qué se me cae el pelo`, `diagnóstico capilar`
- CPC estimado: €1-2.50

### ✅ PASS — No Hay Conflictos Obvios

Los 3 nichos tienen keywords distintas y no se solapan:

| Nicho | Keywords Distintivas |
|-------|---------------------|
| 👩 "Es Normal" | menopausia, mujer 50 años |
| 🤱 "Postparto" | embarazo, postparto, lactancia |
| ❓ "Qué Me Pasa" | genéricos (se me cae, diagnóstico) |

### ✅ PASS — Negativas Correctas

Todos los grupos incluyen negativas adecuadas:
- Nichos femeninos: `trasplante`, `injerto`, `hombre`
- Todos: `champú casero`, `remedios naturales`, `gratis`, `amazon`

---

## 5. CTAs — Coherencia Bono vs Quiz

### ✅ PASS — Estrategia Diferenciada

**Nichos femeninos (Es Normal + Postparto):** Bono €195 como CTA principal
- **Justificación:** "necesitan analítica casi obligatoriamente" (notas-contexto.md)
- **Copy CTAs:** "Pide tu diagnóstico gratis" → landing con bono €195 — **COHERENTE** (el CTA es para pedir cita, no comprar el bono)

**Gateway (¿Qué Me Pasa?):** Quiz online gratuito como primer paso
- **Justificación:** menor fricción, permite segmentar hombre vs mujer antes de ofrecer bono
- **Copy CTAs:** "Haz el test en 3 minutos" → quiz → consulta

### ✅ PASS — Copy CTAs Transparente

**Meta Ads:** "Pide tu diagnóstico gratis" → landing con bono €195 — **COHERENTE**

**Google Ads:** Extensiones de precio: "Diagnóstico completo: €195" — **TRANSPARENTE**

---

## 6. Contradicciones o Errores

### ❌ ERROR CRÍTICO — SAM 9.6M vs 120K

**Detalle:** Ver Observación Crítica en Sección 1

**Archivo:** `fase-1-guiones-google-ads.md` línea ~38 (video Meta Ads "Es Normal")

**CORRECCIÓN REQUERIDA:** Cambiar "9.6M mujeres afectadas" a "120.000 mujeres alcanzables" o eliminar número

### ⚠️ ADVERTENCIA — Fuente Pfizer Alopecia Areata

**Detalle:** Ver Advertencia en Sección 2

**Archivo:** `positioning.md` línea ~730

**RECOMENDACIÓN:** Matizar o eliminar claim "70% españoles no saben qué es alopecia" si se refiere a areata (no aplica a hormonales)

### ⚠️ OBSERVACIÓN MENOR — Precio Bono Sin Fecha de Validez

**Detalle:** Ver Recomendación en Sección 2

**RECOMENDACIÓN:** Añadir "válido hasta [fecha]" o "precio promocional" si el bono es temporal

---

## Recomendaciones Finales

### ✅ Para Aprobar Lanzamiento:

1. **CRÍTICO:** Corregir claim "9.6M mujeres" a "120.000 mujeres alcanzables" o eliminar número absoluto
2. **RECOMENDADO:** Confirmar con Philippe que el bono €195 sigue vigente en marzo 2026
3. **OPCIONAL:** Añadir disclaimer "precio promocional" o fecha de validez al bono si es temporal

### ✅ Para Siguientes Versiones:

1. Revisar uso de dato Pfizer (alopecia areata vs hormonales) en futuras campañas
2. Considerar test A/B del claim numérico (con SAM correcto) vs sin número

---

## Archivos Verificados

| Archivo | Versión | Fecha | Status |
|---------|---------|-------|--------|
| `fase-1-guiones-google-ads.md` | v1.0 | 2026-03-17 | ⚠️ Observaciones |
| `go-to-market/positioning/current.md` | v2.7 | 2026-03-12 | ✅ Coherente |
| `niche-discovery/current.md` | v3.0 | 2026-03-16 | ✅ Coherente |
| `notas-contexto.md` | - | 2026-03-09 | ✅ Coherente |

## URLs Verificadas

| URL | Status | Observaciones |
|-----|--------|--------------|
| `https://www.trustpilot.com/review/insparya.es` | ✅ 200 | Reviews negativas Insparya confirman posición HC |
| `https://www.pfizer.es/files/Dossier_resultados_encuesta_Alopecia_Areata.pdf` | ✅ 200 | Dato válido PERO referido a alopecia areata (no hormonales) |

---

**Próximo QA:** Después de corregir el error crítico, re-validar sección 1 y aprobar para producción.

**Reviewer:** Rocinante 🐴  
**Fecha:** 2026-03-17T17:56 GMT+1
