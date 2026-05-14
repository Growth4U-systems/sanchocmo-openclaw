---
name: new-strategy
description: "Guía la creación de una nueva estrategia GTM para el catálogo. Comprueba duplicados con estrategias existentes, investiga en internet tendencias y mejores prácticas, recopila toda la información necesaria (objetivo, workflow, métricas, aplicabilidad), y genera la entrada JSON lista para añadir al catálogo. Triggers: nueva estrategia, crear estrategia, add strategy, quiero una estrategia para [X]. NOT for: ejecutar una estrategia existente (usar el skill correspondiente), ni para el strategic plan completo (usar strategic-plan)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Plan
  depends_on: null
  chains_to: strategic-plan
  context_required:
    - skills/strategic-plan/references/strategies-catalog.json
  context_writes:
    - skills/strategic-plan/references/strategies-catalog.json
---

# New Strategy — Crear una nueva estrategia GTM

> Este skill guía al usuario para diseñar una nueva estrategia GTM y añadirla al catálogo.

---

## Paso 1: Entender el objetivo (~2 min)

Preguntar al usuario:

```
¿Qué objetivo quieres lograr con esta estrategia?
- ¿Qué problema resuelve?
- ¿Para qué tipo de negocio? (B2B, B2C, ambos)
- ¿Qué resultado esperas? (leads, awareness, conversión, autoridad, retención, expansión, comunidad)
```

---

## Paso 2: Comprobar duplicados (~2 min)

Cargar `skills/strategic-plan/references/strategies-catalog.json` y comparar:

1. **Búsqueda por objetivo**: ¿hay estrategias existentes que persigan el mismo resultado?
2. **Búsqueda por canal**: ¿hay estrategias que usen el mismo canal/medio?
3. **Búsqueda por cuadrante Hormozi**: ¿dónde encajaría en la matriz?

**Si hay solapamiento**, informar al usuario:

```
He encontrado estrategias similares en el catálogo:
- #XX [nombre] — [por qué se parece]
- #YY [nombre] — [por qué se parece]

¿Tu estrategia es diferente porque [hipótesis]? ¿O prefieres modificar una existente?
```

**Si es diferente**, continuar.

---

## Paso 3: Investigar (~3 min)

Buscar en internet para enriquecer la estrategia:

1. **Tendencias actuales**: buscar "[objetivo] strategy 2026" o "[canal] GTM strategy"
2. **Mejores prácticas**: buscar casos de éxito, benchmarks, frameworks reconocidos
3. **Herramientas**: qué tools se usan para ejecutar esta estrategia
4. **Métricas estándar**: qué KPIs usa la industria para medir éxito

Presentar un resumen:

```
Investigación completada:
- Tendencia: [hallazgo relevante]
- Benchmark: [métrica de referencia]
- Herramientas recomendadas: [lista]
- Framework de referencia: [si existe]
```

---

## Paso 4: Recopilar información (~5 min)

Guiar al usuario para completar todos los campos necesarios. Proponer valores basados en la investigación y pedir confirmación:

### Campos básicos
- **ID**: siguiente número disponible en el catálogo
- **Nombre**: proponer nombre conciso y descriptivo
- **Cuadrante Hormozi**: 1:1 Organic / 1:Many Organic / 1:1 Paid / 1:Many Paid / Transversal
- **Objetivo medible**: con números concretos (≥X, >Y%)
- **Prerequisitos**: qué necesita estar listo antes
- **Tiempo al primer resultado**: rango realista
- **B2B / B2C**: core / adaptación / no aplica
- **Velocidad**: rápido (<4 sem) / medio (1-3 meses) / lento (3+ meses)
- **Sectores ideales**: lista de industrias
- **Objetivos**: awareness, lead-gen, conversion, autoridad, retencion, expansion, comunidad
- **Skills de Sancho**: qué skills del sistema se activarían

### Workflow (5 fases)
Para cada fase, proponer contenido basado en la investigación:

- **0) Objetivo y por qué**: explicación de por qué esta estrategia y cuándo elegirla
- **1) Ideación**: cómo planificar la ejecución
- **2) Creación**: qué assets/materiales crear
- **3) Ejecución**: cómo lanzar y operar
- **4) Medición**: tabla de métricas con targets

### Cuándo usar / Cuándo NO usar
- Lista de condiciones favorables
- Lista de condiciones desfavorables

---

## Paso 5: Validar con el usuario

Presentar la estrategia completa en formato legible:

```
NUEVA ESTRATEGIA: #{id} {nombre}

Cuadrante: {cuadrante}
Objetivo: {objetivo medible}
Prerequisitos: {prerequisitos}
Tiempo: {tiempo}
B2B: {b2b} | B2C: {b2c}
Velocidad: {velocidad}
Sectores: {sectores}

WORKFLOW:
0) Objetivo: {resumen}
1) Ideación: {resumen}
2) Creación: {resumen}
3) Ejecución: {resumen}
4) Medición: {tabla}

✅ Usar cuando: {lista}
❌ NO usar cuando: {lista}

Skills: {lista}

¿Quieres que la añada al catálogo? ¿Algún cambio?
```

---

## Paso 6: Guardar en el catálogo

Al aprobar:

1. Leer `skills/strategic-plan/references/strategies-catalog.json`
2. Añadir la nueva estrategia al array `strategies`
3. Actualizar los índices `byObjective`, `bySpeed` con el nuevo ID
4. Guardar el archivo actualizado

```
✅ Estrategia #{id} "{nombre}" añadida al catálogo.
Ahora aparece en Mission Control → Estrategias.
```

---

## Relaciones

| Relación | Detalle |
|----------|---------|
| **Lee** | `strategies-catalog.json` (para comprobar duplicados) |
| **Escribe** | `strategies-catalog.json` (añadir nueva entrada) |
| **Encadena** | `strategic-plan` (la nueva estrategia estará disponible para scoring en próximos planes) |
