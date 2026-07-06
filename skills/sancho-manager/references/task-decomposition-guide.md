# Task Decomposition Guide

> Framework para descomponer cualquier objetivo en tareas ejecutables.

---

## Principio de descomposición

Todo objetivo se puede dividir en **3-8 tareas**:
- **<3 tareas** → no es un proyecto, es una tarea directa. Ejecutar sin crear proyecto.
- **>8 tareas** → el objetivo es demasiado amplio. Dividir en sub-proyectos.

---

## Criterios de calidad de una tarea

| Criterio | Definición | Mal ejemplo | Buen ejemplo |
|----------|------------|-------------|--------------|
| **Atómica** | 1 skill, 1 canal, 1 owner | "Crear y publicar artículo SEO y compartir en redes" | "Escribir artículo SEO sobre X" |
| **Medible** | done_criteria es binario (sí/no) | "Mejorar la web" | "Bounce rate de /servicios/ <50%" |
| **Con deliverable** | Produce algo tangible | "Investigar competidores" | "Documento de 5 battle cards de competidores" |
| **Estimable** | Se puede estimar en velocidad-AI | "Hacer marketing" | "Redactar 3 emails de nurturing (~30 min)" |

---

## Patrones de dependencia

### Secuencial
T01 → T02 → T03. Cada tarea necesita el output de la anterior.
```
T01: Keyword research        → output: lista de keywords
T02: Escribir artículo SEO   → input: keywords de T01
T03: Publicar + schema markup → input: artículo de T02
```

### Paralelo
T01 y T02 pueden ejecutarse simultáneamente. Sin dependencias.
```
T01: Instalar Meta Pixel     (no depende de nada)
T02: Configurar GA4           (no depende de nada)
```

### Convergente
T03 necesita que AMBOS T01 y T02 estén completados.
```
T01: Escribir copy landing    → T03 depende de T01
T02: Diseñar assets visuales  → T03 depende de T02
T03: Montar landing page      → necesita copy + assets
```

**Regla: maximizar paralelismo.** Menos dependencias = menos tiempo total.

---

## Templates de descomposición comunes

### Content Project (artículo, guía, whitepaper)
```
T01: Research — keyword research / tema / audiencia
T02: Outline — estructura + ángulo
T03: Write — redacción completa
T04: Review — brand check + QA (Rocinante)
T05: Publish — subir a web/CMS
T06: Distribute — atomizar para redes, newsletter
```
Dependencias: T01 → T02 → T03 → T04 → T05 → T06

### Outreach Project (cold email, partnerships)
```
T01: List build — encontrar empresas + decision makers
T02: Enrich — obtener emails, LinkedIn, datos
T03: Sequence write — crear secuencia de emails
T04: Warm-up — calentar dominios/buzones (14+ días)
T05: Launch — activar campaña
T06: Optimize — revisar métricas, iterar
```
Dependencias: T01 → T02 (paralelo con T03, T04) → T05 → T06

### CRO Project (optimización web)
```
T01: Audit — analizar estado actual, métricas, pain points
T02: Hypothesis — definir hipótesis de mejora con prioridad
T03: Copy — reescribir copy/CTAs según hipótesis
T04: Implement — aplicar cambios en web
T05: Measure — medir resultados vs baseline (2-4 semanas)
```
Dependencias: T01 → T02 → T03 → T04 → T05

### Setup / Infra Project (tracking, herramientas, configuración)
```
T01: Audit — revisar estado actual, qué hay, qué falta
T02: Implement — instalar/configurar herramientas
T03: Verify — comprobar que funciona (tests, checks)
T04: Document — documentar setup para el equipo
```
Dependencias: T01 → T02 → T03 → T04

### Ads Project (Meta Ads, Google Ads)
```
T01: Audience research — definir audiences por ECP
T02: Ad copy — escribir variantes de copy
T03: Creatives — diseñar assets visuales
T04: Landing page — crear/optimizar destino de conversión
T05: Campaign setup — configurar campañas, presupuesto, bidding
T06: Launch + monitor — activar y monitorear primeras 72h
```
Dependencias: T01 → T02 + T03 (paralelo) → T04 → T05 → T06

### Authority / Thought Leadership Project (podcast, speaking, PR)
```
T01: Concept — definir formato, audiencia, posicionamiento
T02: Content plan — crear calendario de episodios/artículos/temas
T03: Scripts/Outlines — preparar contenido de los primeros 3-5
T04: Assets — diseñar cover, templates, branding
T05: Distribution setup — RSS, plataformas, scheduling
T06: Launch — publicar primeros 3 y distribuir
```
Dependencias: T01 → T02 → T03 + T04 (paralelo) → T05 → T06

---

## Asignación de owner

| Pregunta | Si la respuesta es SÍ → |
|----------|--------------------------|
| ¿Puede hacerlo Sancho con un skill? | owner = "Sancho" |
| ¿Requiere grabar video, hacer llamadas, o presencia física? | owner = "Equipo" |
| ¿Solo una persona específica puede hacerlo? | owner = "{Nombre}" |

**Default: Sancho.** Solo escalar a humanos cuando genuinamente no hay alternativa AI.

---

## Estimación de tiempo (velocidad-AI)

| Tipo de tarea | Estimación |
|---------------|------------|
| Research / keyword research | 5-15 min |
| Copy de página/landing | 15-30 min |
| Artículo SEO completo | 30-60 min |
| Secuencia de emails (5 emails) | 20-40 min |
| Battle card de competidor | 10-20 min |
| Setup técnico (pixel, analytics) | 5-10 min (instrucciones) |
| Diseño/creative brief | 15-30 min |

No usar timelines de agencia. Sancho opera a velocidad-AI.
