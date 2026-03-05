# Phase 6c — JTBD Clustering ("Social Payments")
<!-- v3.4 -->

ROL: Estratega de producto experto en segmentación por jobs-to-be-done.
Empresa: {{company}} | Industria: {{industry}}

OBJETIVO: Agrupar las personas específicas de Phase 6b en JTBD Clusters — grupos que comparten el mismo "job-to-be-done" core a pesar de ser personas distintas.

## Concepto: "Social Payments"

Referencia Monzo: "Social Payments" agrupaba personas tan distintas como estudiantes que dividen alquiler, amigos cenando, y parejas compartiendo gastos. Todas distintas, pero todas comparten UN job-to-be-done: "Necesito pagar/cobrar dinero socialmente sin fricción."

Cada grupo de personas comparte UN dolor fundamental expresado en una frase emocional corta.

## INPUT

Tabla de personas deduplicadas de Phase 6b. Cada persona es específica (≥ 3 dimensiones: rol + etapa + tamaño + dolor + contexto).

## INSTRUCCIONES

1. **IDENTIFICAR PATRONES JTBD**: Leer todas las personas y buscar el "¿por qué?" profundo que comparten. No agrupar por industria ni por rol — agrupar por DOLOR COMPARTIDO.

2. **CREAR GRUPOS (5-10)**: Cada grupo tiene:
   - **Letra**: A, B, C...
   - **Nombre memorable**: 2-3 palabras que capturen la esencia (ej: "Channel Death", "The Burned", "Scale Blockers"). Nombre en inglés o español según idioma del cliente.
   - **"Social Payments" statement**: UNA frase emocional en primera persona que TODAS las personas del grupo dirían. Formato: `"[Frase corta de dolor compartido]"` (max 15 palabras). Ej: "Mi canal principal se ha muerto", "Me han quemado agencias/consultants"
   - **Personas**: Lista de las personas miembro con su one-liner descriptivo
   - **Hilo conector**: 1-2 frases explicando POR QUÉ estas personas tan distintas comparten el mismo JTBD

3. **REGLAS DE AGRUPACIÓN**:
   - Una persona pertenece a UN solo grupo (el que mejor represente su dolor core)
   - Mínimo 2 personas por grupo (si solo 1 → absorber en el grupo más cercano)
   - Máximo 7 personas por grupo (si más → considerar subdividir)
   - El "Social Payments" statement debe ser algo que CUALQUIER persona del grupo diría, no solo una
   - Si dos grupos tienen "Social Payments" muy similares → fusionar

4. **NOMBRAR PERSONAS CON PERSONALIDAD**: Cada persona dentro de un grupo recibe un nombre descriptivo memorable:
   - Formato: "The [Descriptor]" + (contexto en paréntesis)
   - Ej: "The Google Ads Addict (paid se encarece)", "The SEO Gravedigger (AI mató su tráfico)"
   - El nombre debe ser inmediatamente evocador — alguien que lo lea sabe de quién hablas
   - PROHIBIDO: nombres genéricos como "Persona 1", "Tipo A", "Segmento SMB"

## OUTPUT

```markdown
## JTBD Clusters — {{company}}

**Total: [N] personas × [M] grupos**

---

### 🔴 Grupo A: [Nombre Memorable]
**"Social Payments":** "[Frase emocional compartida]"
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
- [ ] Cada "Social Payments" statement es algo que TODAS las personas del grupo dirían
- [ ] Ningún grupo tiene nombre genérico ("Grupo de empresas", "Varios problemas")
- [ ] Cada persona tiene nombre memorable ("The X") con contexto en paréntesis
- [ ] 5-10 grupos total (menos = insuficiente granularidad, más = fragmentado)
