# Market Intelligence — Conceptos y Metodología

> Referencia conceptual. El agente lee esto cuando necesita entender qué significa un concepto o cómo aplicar una metodología. No es instrucción de ejecución — eso está en SKILL.md.

---

## Sector Identification

Clasifica el mercado a 3 niveles:

| Nivel | Descripción | Ejemplo |
|-------|-------------|---------|
| **Industry** | Sector amplio | Financial Services |
| **Vertical** | Sub-sector específico | Fintech → Personal Finance |
| **Niche** | Segmento concreto | Crypto custody for B2B |

- Si la empresa opera en múltiples sectores: sector primario recibe deep dive, secundarios reciben tratamiento Lite.
- Identificar **mercados adyacentes** (a los que podría expandirse). Alimentan decisiones de Phase 3.

---

## Market Sizing

### TAM (Total Addressable Market)
Revenue total si la empresa capturase el 100% del mercado.

**Métodos (por orden de fiabilidad):**
1. **Bottom-up**: nº total clientes potenciales × ARPU promedio (PREFERIDO)
2. **Top-down**: reports de industria → filtrar a segmento relevante (indicar confianza)
3. **Value theory**: gasto total en resolver el problema (incluso con soluciones no-producto)

Si solo hay top-down: indicar confianza (High/Medium/Low) + listar TODAS las asunciones.

**IMPORTANTE**: NO calcular SAM/SOM — eso viene después en niche-discovery cuando hay decisiones estratégicas.

### Proyecciones
- Crecimiento histórico: 3-5 años con fuente
- Proyección: 5 años con fuente
- Si hay fuentes conflictivas: presentar el rango, no un solo número

---

## Market Characteristics

| Dimensión | Opciones | Por qué importa |
|-----------|---------|-----------------|
| **B2B / B2C / B2B2C** | Único o mixto | Ciclo de venta, canales, pricing |
| **Regulado / No regulado** | Sí/Parcial/No | Compliance, barreras de entrada |
| **Fragmentado / Consolidado** | Muchos pequeños vs pocos grandes | Dinámica competitiva |
| **Madurez** | Emerging/Growing/Mature/Declining | Implicaciones estratégicas |
| **Buyer type** | Technical/Business/Consumer | Messaging, canales |
| **Sales cycle** | Self-serve/Short/Medium/Long | Diseño de funnel |
| **Switching cost** | Low/Medium/High | Retención, estrategia competitiva |

---

## Market Maturity

| Etapa | Características | Implicación Estratégica |
|-------|----------------|------------------------|
| **Emerging** | Mercado nuevo, educación necesaria | Category creation, ser primero, educar |
| **Growing** | Crecimiento rápido, competencia aumentando | Diferenciación, speed to market, capturar share |
| **Mature** | Crecimiento lento, consolidado | Niche down, innovar en experiencia, retención |
| **Declining** | Decrecimiento, consolidación | Pivotar, harvesting, o disruptar |

---

## Regulatory Analysis

### Categorías a revisar

| Categoría | Ejemplos | Buscar |
|----------|---------|--------|
| **Específica de industria** | MiCA, HIPAA, MiFID II | Licencias, compliance, restricciones operativas |
| **Privacidad de datos** | GDPR, CCPA, LGPD | Manejo de datos, consentimiento, transferencia |
| **Protección al consumidor** | Directiva UE Derechos Consumidor, FTC | Claims, devoluciones, restricciones publicitarias |
| **Publicidad** | CAP Code, FTC Guidelines, reglas de plataformas | Qué se puede/no se puede decir en marketing |
| **Fiscal** | IVA, impuestos servicios digitales | Impacto en pricing y márgenes |
| **Emergente** | AI Act, DSA, DMA | Requisitos futuros |

### Marketing restrictions (CRÍTICO)
Las restricciones de marketing se propagan a TODOS los skills downstream (paid-ads, landing-pages, social-content, email-sequences). Documentar con:
- Palabras/claims prohibidos
- Disclaimers obligatorios
- Ejemplos de mensajes permitidos vs prohibidos

---

## Trend Analysis

### Categorías

| Tipo | Qué buscar |
|------|-----------|
| **Technology** | IA/ML, blockchain, API economy, no-code |
| **Consumer behavior** | Preferencias, nuevos canales, cambio generacional |
| **Regulatory** | Nuevas leyes, desregulación |
| **Economic** | Tipos de interés, inflación, poder adquisitivo |
| **Competitive** | Consolidación, nuevos entrantes |
| **Societal** | Sostenibilidad, privacidad, trabajo remoto |

### Horizonte temporal
- **NOW**: Impacto inmediato (actuar ya)
- **6 MESES**: Corto plazo (preparar)
- **1 AÑO**: Mediano plazo (planificar)
- **3 AÑOS**: Largo plazo (monitorear)

---

## Monitoring (post-análisis)

| Tipo de mercado | Frecuencia | Foco |
|----------------|-----------|------|
| Regulado (fintech, health) | Bi-semanal | Cambios regulatorios, deadlines |
| No regulado | Mensual | Tendencias, tamaño |
| Todos | Siempre | Nuevos competidores, shifts |

**Filtro señal/ruido**: Solo surfacear cambios que sean críticos, revelen patrón, o sean accionables.

---

## Edge Cases

- **Mercado demasiado nuevo para sizing**: Usar mercados comparables como proxy. Documentar asunciones.
- **Empresa en múltiples mercados**: Primario = deep dive, secundarios = Lite.
- **Mercado muy regulado**: Regulación = sección MÁS GRANDE del documento.
- **Datos conflictivos**: Presentar rango, usar el más conservador.
- **Mercado en declive pero empresa creciendo**: Puede estar tomando share o creando sub-segmento nuevo.
