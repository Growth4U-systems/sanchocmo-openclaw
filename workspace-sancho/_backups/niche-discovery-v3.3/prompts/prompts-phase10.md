# Phase 10 — Consolidación Final
<!-- v3.4 -->

ROL: Estratega CMO que consolida todo el análisis en un entregable ejecutivo.
Empresa: {{company}} | Industria: {{industry}} | País: {{country}}

OBJETIVO: Crear el documento final `current.md` que integra Pain Clusters + Personas + Scoring en un solo entregable accionable.

## INPUT

1. `niches-raw/clusters.md` — Pain Clusters con personas agrupadas por dolor compartido
2. `niches-confirmed.md` — Personas validadas por el usuario
3. `scored.md` — Deep Research scoring por persona (Pain, Market Size, Reachability)

## ESTRUCTURA DEL OUTPUT (`current.md`)

```markdown
# Niche Discovery — [Nombre Empresa]

> Generado: [fecha] | Método: [resumen fuentes] | Status: pending-approval
> Total: [N] personas × [M] Pain Clusters | Problemas analizados: [X]

---

## Executive Summary

[3-5 líneas: qué encontramos, qué recomendamos, por qué]

**Recomendación:** [Top 2-3 clusters o personas para atacar primero y por qué]

---

## Pain Clusters

### [emoji] Cluster [Letra]: [Nombre Memorable]
**Pain Cluster statement:** "[Frase emocional que todas las personas del grupo dirían]"
**Por qué contratan a [empresa]:** [1-2 líneas de fit producto-cluster]

#### [Número]. [Nombre Memorable de Persona] ("The X")
> *"[Frase en primera persona — cómo describe su dolor]"*

- **Quién:** [Rol + etapa + tamaño + contexto — ≥3 dimensiones]
- **JTBD:** "Cuando [Situación], quiero [Motivación], para poder [Resultado]."
- **Hypothesis:** "Creemos que [NICHO] se siente frustrado por [PROBLEMA], lo que le obliga a [WORKAROUND]. Para ellos, nuestra solución es la única que combina [F1] con [F2], permitiéndoles [RESULTADO] sin [NEGATIVO COMPETENCIA]."
- **Problemas que agrupa:** [#refs al banco de problemas]
- **Alternativas actuales:** [Qué usan hoy]
- **Dónde está:** [Canales, comunidades, eventos específicos]
- **Trigger de compra:** [Momento exacto en que busca solución]
- **Scoring:**

| Pain | Reachability | Market Size (SAM) |
|------|-------------|-------------------|
| [2-99] — [explicación corta] | [2-99] — [explicación corta] | [número] — [explicación corta] |

---

[Repetir para cada persona dentro del cluster]
[Repetir para cada cluster]

---

## Overlap Map

[Tabla de personas que cruzan varios clusters — dolor secundario en otros grupos]

| Persona | Cluster primario | También tiene dolor de... |
|---------|-----------------|--------------------------|

---

## Ranking Final

| # | Persona | Cluster | Pain | Reach | SAM | Total | Recomendación |
|---|---------|---------|------|-------|-----|-------|---------------|
[Ordenado por score total descendente]

---

## Resumen Visual

| Cluster | Nombre | Personas | Pain Cluster statement |
|---------|--------|----------|----------------------|
[Tabla resumen de clusters]

---

## Recomendación Estratégica

### [Título de la recomendación]

[2-3 párrafos: qué atacar primero, por qué, cómo se conectan los clusters, qué messaging universal usar]

### Siguiente paso

Con los ECPs aprobados, el siguiente pilar es **Positioning & Messaging** — crear messaging específico por persona/cluster.

---

## Fuentes

### Foundation (harvest)
[Lista de docs Foundation usados]

### Investigación nueva
[Lista de fuentes con URLs]

---

<!-- Self-QA: [PASS/NEEDS WORK] | [fecha] | items: X pass Y warn Z red -->
```

## REGLAS

1. **UN SOLO DOCUMENTO** — Todo va en `current.md`. No crear archivos separados para personas, clusters, o scoring.
2. **Cada persona DEBE tener** los dos templates: JTBD + Hypothesis. Sin excepciones.
3. **Cada persona DEBE tener scoring** con las 3 métricas (Pain, Reachability, Market Size). Si no se hizo deep research para una persona → marcar "⚠️ Scoring pendiente".
4. **Los clusters estructuran el documento** — las personas se presentan DENTRO de su cluster, no como lista plana.
5. **Nombres memorables obligatorios** — "The Solo Technical Founder", "The 3-Agency Veteran", NO "Persona 1" o "SaaS B2B".
6. **Ranking final** usa score compuesto (Pain × 0.4 + Reachability × 0.35 + Market Size × 0.25) para ordenar.
7. **Versionado estándar** — `current.md` + `v{N}.md` + `history.json`.
