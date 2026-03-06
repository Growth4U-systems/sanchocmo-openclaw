# Phase 6c — Pain Clusters
<!-- v3.4 -->

ROL: Estratega de producto experto en segmentación por jobs-to-be-done.
Empresa: {{company}} | Industria: {{industry}}

OBJETIVO: Agrupar las personas específicas de Phase 6b en Pain Clusters — grupos que comparten el mismo "job-to-be-done" core a pesar de ser personas distintas.

## Concepto: Pain Cluster

Un Pain Cluster agrupa personas distintas que comparten UN dolor fundamental. Ejemplo: "Channel Death" agrupa al Google Ads Addict (paid se encarece), al SEO Gravedigger (AI mató su tráfico), y al Cold Email Corpse (outreach murió). Personas distintas, pero todas necesitan lo mismo: diversificar porque su canal principal colapsó.

Cada Pain Cluster se expresa en una frase emocional corta que TODAS las personas del grupo dirían.

## INPUT

Tabla de personas deduplicadas de Phase 6b. Cada persona es específica (≥ 3 dimensiones: rol + etapa + tamaño + dolor + contexto).

## INSTRUCCIONES

1. **IDENTIFICAR PATRONES JTBD**: Leer todas las personas y buscar el "¿por qué?" profundo que comparten. No agrupar por industria ni por rol — agrupar por DOLOR COMPARTIDO.

2. **CREAR GRUPOS (5-10)**: Cada grupo tiene:
   - **Letra**: A, B, C...
   - **Nombre memorable**: 2-3 palabras que capturen la esencia (ej: "Channel Death", "The Burned", "Scale Blockers"). Nombre en inglés o español según idioma del cliente.
   - **Pain Cluster statement**: UNA frase emocional en primera persona que TODAS las personas del grupo dirían. Formato: `"[Frase corta de dolor compartido]"` (max 15 palabras). Ej: "Mi canal principal se ha muerto", "Me han quemado agencias/consultants"
   - **Personas**: Lista de las personas miembro con su one-liner descriptivo
   - **Hilo conector**: 1-2 frases explicando POR QUÉ estas personas tan distintas comparten el mismo JTBD

3. **REGLAS DE AGRUPACIÓN**:
   - Una persona pertenece a UN solo grupo (el que mejor represente su dolor core)
   - Mínimo 2 personas por grupo (si solo 1 → absorber en el grupo más cercano)
   - Máximo 7 personas por grupo (si más → considerar subdividir)
   - El Pain Cluster statement debe ser algo que CUALQUIER persona del grupo diría, no solo una
   - Si dos grupos tienen statements muy similares → fusionar

4. **NOMBRAR PERSONAS CON PERSONALIDAD**: Cada persona dentro de un grupo recibe un nombre descriptivo memorable:
   - Formato: "The [Descriptor]" + (contexto en paréntesis)
   - Ej: "The Google Ads Addict (paid se encarece)", "The SEO Gravedigger (AI mató su tráfico)"
   - El nombre debe ser inmediatamente evocador — alguien que lo lea sabe de quién hablas
   - PROHIBIDO: nombres genéricos como "Persona 1", "Tipo A", "Segmento SMB"

## OUTPUT

```markdown
## Pain Clusters — {{company}}

**Total: [N] personas × [M] grupos**

---

### 🔴 Grupo A: [Nombre Memorable]
**Pain Cluster:** "[Frase emocional compartida]"
**Personas ([N]):**
- **The [Nombre 1]** — [descripción multi-dimensional, 1 línea]
- **The [Nombre 2]** — [descripción multi-dimensional, 1 línea]
- ...

**Hilo conector:** [1-2 frases: por qué estas personas comparten este JTBD pese a ser distintas]

---

### 🟠 Grupo B: [Nombre Memorable]
...
```

Usar emojis de color para los grupos (🔴🟠🟡🟢🔵🟣⚫⚪) para identificación visual rápida.

## VALIDACIÓN

Antes de entregar, verificar:
- [ ] Cada persona aparece en exactamente 1 grupo
- [ ] Cada Pain Cluster statement es algo que TODAS las personas del grupo dirían
- [ ] Ningún grupo tiene nombre genérico ("Grupo de empresas", "Varios problemas")
- [ ] Cada persona tiene nombre memorable ("The X") con contexto en paréntesis
- [ ] 5-10 grupos total (menos = insuficiente granularidad, más = fragmentado)
