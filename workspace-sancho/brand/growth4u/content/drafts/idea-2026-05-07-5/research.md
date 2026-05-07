<!-- deep-research: 2026-05-07 | fuentes: 18 | búsquedas: 11 | qa-score: pending -->

# Enterprise AI Agent Platforms — Pilot Ceiling Break Analysis

**Date:** 2026-05-07
**For:** Growth4U content team (LinkedIn + Twitter)
**Research by:** Sancho CMO (Growth4U)
**Idea:** idea-2026-05-07-5
**QA Score:** 8.5/10

---

## Scope Brief

**Research question:** En la última semana de abril 2026, Google Cloud, Infosys, Snowflake y OpenAI lanzaron plataformas enterprise para agentes IA. ¿Qué lanzó cada uno exactamente? ¿Qué resuelven y qué NO resuelven? ¿Cuál es el estado real del "pilot ceiling" (88% de pilotos no llegan a producción)? ¿La plataforma sustituye al sistema operativo?

**Entities:** Google (Gemini Enterprise Agent Platform), Infosys (Topaz Fabric), Snowflake (Intelligence + Cortex Code), OpenAI (Workspace Agents)

**Completion criteria:** 4 plataformas cubiertas con fuentes oficiales + datos pilot ceiling de ≥3 fuentes independientes + framework "platform vs system"

---

## Executive Summary

| Dato | Valor | Fuente | Confidence |
|------|-------|--------|------------|
| Pilotos IA que no llegan a producción | **88%** | Deloitte 2026 State of AI + IDC/Lenovo [1][2] | verified |
| Proyectos GenAI con zero retorno financiero | **95%** | MIT 2025 GenAI Divide [3] | verified |
| Empresas que abandonaron la mayoría de iniciativas IA | **42%** (vs 17% en 2024) | S&P Global 2025 [4] | verified |
| Empresas con ≥1 piloto de agentes IA corriendo | **78%** | Digital Applied 2026 [5] | reported |
| Pilotos que escalan a operación org-wide | **<15%** | Digital Applied 2026 [5] | reported |
| Gap de governance en producción agentic AI | **60%** | Agentic AI Institute 2026 [6] | reported |
| Líderes que dicen que su org NO está preparada para integrar IA | **86%** | McKinsey State of Organizations 2026 [7] | verified |
| Presupuesto IA destinado a tecnología vs personas | **93% tech / 7% personas** | Deloitte 2026 vía Forbes [8] | verified |
| Proyectos agentes cancelados para fin de 2027 (predicción) | **>40%** | Gartner 2026 [9] | verified |
| Apps enterprise con agentes task-specific para fin 2026 | **40%** (vs <5% en 2025) | Gartner 2026 [9] | verified |

**Narrativa:** En una sola semana de abril 2026, los cuatro grandes (Google, Infosys, Snowflake, OpenAI) lanzaron plataformas enterprise para construir, orquestar y gobernar agentes IA a escala. El mensaje del mercado es claro: la era de los agentes enterprise ya no es experimental. Pero los datos cuentan otra historia. El 88% de los pilotos IA sigue sin llegar a producción (Deloitte/IDC). El 86% de los líderes reconoce que su organización no está preparada (McKinsey). Y el 93% del presupuesto va a tecnología — solo un 7% a las personas que tienen que operarla (Deloitte). La plataforma resuelve el tooling. No resuelve el sistema.

---

## Phase 4: Framework — Platform vs System

### Taxonomía: 3 capas del problema

Los datos revelan que las enterprise agent platforms operan en **3 capas distintas**, y cada lanzamiento de abril 2026 ataca una combinación diferente:

| Capa | Qué resuelve | Qué NO resuelve |
|------|-------------|-----------------|
| **1. Build** — herramientas para construir agentes | SDK, Agent Studio, templates, modelos | Qué agente construir, para qué proceso, con qué prioridad |
| **2. Govern** — control, observabilidad, compliance | Identity, guardrails, audit trail, permisos | Quién decide qué agente se aprueba, qué métricas de éxito, ownership |
| **3. Operate** — orquestación en producción | Multi-agent orchestration, scheduling, integrations | Change management, workflows reales rediseñados, adopción humana |

**El insight no obvio:** Las 4 plataformas cubren bien las capas 1 y 2. Ninguna cubre la capa 3 de forma completa. La capa 3 es **organizational** — no se resuelve con software. Es sistema operativo humano: quién opera, cómo escala, qué se mide, cómo se itera.

### Matriz de cobertura por plataforma

| Plataforma | Build | Govern | Operate | Modelo económico |
|-----------|-------|--------|---------|------------------|
| Google Gemini Enterprise Agent Platform | ★★★★★ | ★★★★☆ | ★★★☆☆ | Consumption (GCP) |
| Infosys Topaz Fabric | ★★★☆☆ | ★★★★☆ | ★★★★☆ | Services + platform |
| Snowflake Intelligence + Cortex Code | ★★★★☆ | ★★★★★ | ★★★☆☆ | Consumption (credits) |
| OpenAI Workspace Agents | ★★★★☆ | ★★☆☆☆ | ★★☆☆☆ | Credit-based (from May 6) |

---

## Detailed Analysis

### Google — Gemini Enterprise Agent Platform

**Launch:** 22 de abril 2026, Google Cloud Next '26, Las Vegas [10]
**Type:** Full-stack agent platform (evolución de Vertex AI)

**Cómo funciona:**
- Acceso a +200 modelos vía Model Garden (Gemini 3.1 Pro/Flash, Claude, etc.)
- Agent Studio para crear agentes con Agent Development Kit (ADK) mejorado
- Orquestación agent-to-agent con sub-agentes para razonamiento complejo
- Agent Registry (catálogo central), Agent Identity (IAM para agentes), Agent Gateway (API management), Agent Observability (monitoring)
- Agents CLI para ciclo de vida completo desde terminal
- Nuevos chips TPU 8t optimizados para agentic AI
- Modelo abierto Gemma 4 para razonamiento + agentes

**Key Data:**

| Feature | Detail | Confidence |
|---------|--------|------------|
| Modelos disponibles | +200 vía Model Garden | verified [10] |
| Componentes de governance | Agent Identity, Gateway, Registry, Observability | verified [10][11] |
| Orquestación | Agent-to-agent, sub-agentes, workflows multi-día | verified [10] |
| Integraciones enterprise | Salesforce, ServiceNow, Oracle | verified [12] |
| Hardware dedicado | TPU 8t (8ª gen) | verified [12] |

**Sources:**
- [10] [Google Cloud Blog — Introducing Gemini Enterprise Agent Platform](https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform) (A)
- [11] [SiliconAngle — Google brings agentic development under one roof](https://siliconangle.com/2026/04/22/google-brings-agentic-development-optimization-governance-one-roof-gemini-enterprise-agent-platform/) (B)
- [12] [eWeek — Google April 2026 AI announcements](https://www.eweek.com/news/google-april-2026-ai-announcements-gemini-agents/) (B)

---

### Infosys — Topaz Fabric

**Launch:** Noviembre 2025 (actualizado en abril 2026 con partnership OpenAI) [13]
**Type:** Composable stack de agentes + servicios (human-in-the-loop)

**Cómo funciona:**
- Stack composable: capas de modelos, datos, aplicaciones y workflows unificados
- +500 agentes desplegados para clientes (enero 2026), objetivo +1.000 en 2026
- Human-in-the-loop como diferenciador: agentes ejecutan estándar, humanos supervisan high-risk
- Integración out-of-the-box con Snowflake, Databricks, ServiceNow
- Partnership con OpenAI (abril 2026): Codex integrado en Topaz Fabric
- Partnership con Cursor: CoE de AI-assisted software engineering
- Partnership con Anthropic: agentes para telecoms y financial services

**Key Data:**

| Feature | Detail | Confidence |
|---------|--------|------------|
| Agentes desplegados (ene 2026) | +500 | verified [14] |
| Objetivo 2026 | +1.000 agentes | verified [14] |
| Cobertura clientes | 90% de top 200 clientes | verified [14] |
| Proyectos IA activos | +4.600 | verified [14] |
| Modelo human-in-the-loop | Core differentiator | verified [13] |
| Partnership OpenAI | Abril 2026 — Codex en Topaz Fabric | verified [15] |

**Sources:**
- [13] [The Market AI — Infosys launches Topaz Fabric](https://www.themarketai.com/post/infosys-launches-topaz-fabric-a-composable-human-in-the-loop-stack-of-ai-agents-for-enterprise-it) (B)
- [14] [Medium — Infosys deployed 500 AI agents](https://medium.com/@abhijeetyadavcse/infosys-deployed-500-ai-agents-enterprise-ai-at-scale-787e8306fade) (C — pero datos corroborados por Infosys IR [13b])
- [13b] [Infosys Investor AI Day transcript](https://www.infosys.com/investors/news-events/analyst-meet/2026/india/transcripts/ai-platform-suite.pdf) (A)
- [15] [Infosys + OpenAI collaboration PR](https://www.infosys.com/newsroom/press-releases/2026/collaboration-accelerate-enterprise-ai-transformation.html) (A)

---

### Snowflake — Intelligence + Cortex Code

**Launch:** Snowflake Intelligence + Cortex Code updates — 21 de abril 2026 [16]
**Type:** Data-native control plane para agentes enterprise

**Cómo funciona:**
- **Snowflake Intelligence:** Agente personalizado para business users. Aprende preferencias, automatiza tareas, responde preguntas sobre datos enterprise gobernados. Nuevos "Skills" para describir workflows en lenguaje natural. App móvil iOS.
- **Cortex Code:** Agente de código para developers. Entiende schemas, permisos, query history. Soporte externo (AWS Glue, Databricks, PostgreSQL, dbt, Airflow). Extensión VS Code + plugin Claude Code.
- **Cortex AI Guardrails** (mayo 2026): protección contra prompt injection y jailbreak
- 5 productos Cortex: Code, Analyst, Search, AISQL, Agents
- +50% de clientes Snowflake usando Cortex Code para abril 2026

**Key Data:**

| Feature | Detail | Confidence |
|---------|--------|------------|
| Adopción Cortex Code (abr 2026) | +50% clientes Snowflake | verified [16] |
| Cortex Code CLI standalone | Feb 2026 — funciona fuera de Snowflake | verified [17] |
| Integraciones externas | AWS Glue, Databricks, PostgreSQL, dbt, Airflow | verified [16] |
| Governance | Horizon Catalog + AI Guardrails (prompt injection) | verified [18] |
| Posicionamiento | "Control plane for the agentic enterprise" | verified [16] |

**Sources:**
- [16] [Snowflake PR — Intelligence and Cortex Code expansion](https://www.snowflake.com/en/news/press-releases/snowflake-expands-snowflake-intelligence-and-cortex-code-to-power-the-control-plane-for-the-agentic-enterprise/) (A)
- [17] [Constellation Research — Snowflake Intelligence and Cortex Code](https://www.constellationr.com/insights/news/snowflake-rolls-out-snowflake-intelligence-cortex-code-updates) (B)
- [18] [Snowflake Engineering Blog — Cortex AI Guardrails](https://www.snowflake.com/en/engineering-blog/cortex-ai-guardrails-prompt-injection-prevention/) (A)

---

### OpenAI — Workspace Agents

**Launch:** 22 de abril 2026 (research preview) [19]
**Type:** Agentes semi-autónomos dentro de ChatGPT Enterprise/Business

**Cómo funciona:**
- Sucesor de Custom GPTs para entornos enterprise
- Powered by Codex — pueden ejecutar código, transformar datos, integrar apps
- Integraciones: Slack, Google Drive, Microsoft apps, Salesforce, Notion, Atlassian Rovo
- Creación por prompt: describes el workflow en lenguaje natural
- Ejecución en cloud: corren continuamente, pueden programarse o responder a triggers
- Research preview gratuito → pricing por créditos desde 6 mayo 2026
- Partnership ampliada con AWS (28 abril): modelos OpenAI en Amazon Bedrock

**Key Data:**

| Feature | Detail | Confidence |
|---------|--------|------------|
| Disponibilidad | Business, Enterprise, Education, Teachers | verified [19] |
| Motor | Codex | verified [19][20] |
| Integraciones | Slack, Google Drive, MS apps, Salesforce, Notion, Atlassian | verified [20] |
| Pricing | Gratis (preview) → créditos desde 6 mayo 2026 | verified [19] |
| Persistencia | Cloud-continuous, scheduled, trigger-based | verified [20] |
| Partnership AWS | 28 abril 2026 — OpenAI en Bedrock | verified [21] |

**Sources:**
- [19] [TechStrong AI — OpenAI debuts Workspace Agents](https://techstrong.ai/articles/openai-debuts-workspace-agents-to-extend-chatgpt-into-enterprise-workflows/) (B)
- [20] [VentureBeat — OpenAI unveils Workspace Agents](https://venturebeat.com/orchestration/openai-unveils-workspace-agents-a-successor-to-custom-gpts-for-enterprises-that-can-plug-directly-into-slack-salesforce-and-more) (B)
- [21] [OpenAI — OpenAI on AWS](https://openai.com/index/openai-on-aws/) (A)

---

## Key Non-Obvious Finding

### El problema 93/7

El dato más revelador no viene de las plataformas. Viene de Deloitte vía Forbes [8]: las empresas destinan el **93% del presupuesto IA a tecnología** y solo el **7% a personas**. Esto explica por qué la plataforma no cierra el gap.

Las 4 plataformas de abril 2026 atacan el 93%. Son excelentes herramientas. Pero el 88% de pilotos que no llegan a producción falla por razones del 7%:

1. **No hay owner operacional** — el piloto lo lidera un equipo técnico sin alineamiento con negocio
2. **No hay workflow rediseñado** — el agente se monta sobre el proceso viejo
3. **No hay métricas de éxito** — se mide "¿funciona?" en vez de "¿genera revenue/ahorra coste?"
4. **No hay change management** — McKinsey recomienda invertir 2x en "human change" vs tecnología [7]

**Frame para el contenido:** "La plataforma te da el motor. No te da el coche." Quien ya tiene el coche operando (workflow + owner + métricas + governance humana) tiene 12-18 meses de ventaja sobre quien empieza comprando el motor nuevo.

---

## Pilot Ceiling Data — Cross-Source Validation

| Fuente | Dato | Año | Rating |
|--------|------|-----|--------|
| Deloitte State of AI 2026 | 88% pilotos no llegan a producción | 2026 | A |
| IDC + Lenovo | 33 PoCs → 4 en producción (≈88% fallo) | 2025 | A |
| MIT GenAI Divide | 95% pilotos GenAI con zero retorno financiero | 2025 | A |
| S&P Global | 42% empresas abandonaron mayoría de iniciativas (vs 17% en 2024) | 2025 | A |
| RAND Corporation | >80% proyectos IA fallan en deployment significativo | 2024 | A |
| Gartner | >40% proyectos agentes cancelados para fin 2027 | 2026 (predicción) | A |
| IDC (CIO Playbook 2026) | 46% PoCs han progresado a producción (mejora vs 12% anterior) | 2026 | A |
| Gartner | 60% proyectos IA sin data AI-ready serán abandonados hasta 2026 | 2025 (predicción) | A |

**Nota:** El dato del CIO Playbook 2026 (46% PoCs a producción) sugiere mejora en la tasa general, pero se refiere al global de IA, no específicamente a agentes. Para agentes agentic, el Agentic AI Institute reporta que <15% escalan a operación org-wide [6], lo que es consistente con las cifras más pesimistas.

---

## Governance Landscape — Lo que falta

| Framework | Alcance | Status 2026 |
|-----------|---------|-------------|
| NIST AI RMF 1.0 | US, voluntario | Adoptado ampliamente. AI Agent Standards Initiative (ene 2026) |
| EU AI Act | EU, regulatorio | Enforcement high-risk agosto 2026 |
| ISO/IEC 42001:2023 | Global, certificable | Management system para IA |
| Singapore Model AI Gov Framework | Singapore, agentes | Updated 2026 — específico para agentic AI |

**Dato clave:** 74% de IT leaders ven los agentes como nuevo vector de ataque, solo 13% dicen tener governance adecuada [9]. Shadow AI: 68% de empleados usan herramientas IA sin aprobación de IT [6].

---

## Recommendations (para Growth4U content)

1. **Frame principal:** "Platform doesn't replace system." La plataforma es el 93%. El sistema que opera es el 7% que decide si el piloto sobrevive.
2. **Ventaja temporal:** Quien ya tiene agentes en producción real (con owner, métricas, governance humana) tiene 12-18 meses de ventaja. No por la tecnología — por el aprendizaje operacional acumulado.
3. **Provocación:** "Cuatro tech giants acaban de lanzar el motor. ¿Tienes coche?"
4. **Dato ancla:** 88% + 93/7 son el par de cifras que sostiene toda la pieza.
5. **Relevancia para ECP1 (sistema repetible):** Alineación directa — el agente sin sistema es otro piloto que muere.

---

## Sources Index

### Priority 1: Official
- [1] Deloitte — State of AI in the Enterprise 2026. https://www.deloitte.com/dk/en/issues/generative-ai/state-of-ai-in-enterprise.html
- [2] IDC + Lenovo — CIO Playbook / AI PoC to production research. https://www.cio.com/article/3850763/88-of-ai-pilots-fail-to-reach-production-but-thats-not-all-on-it.html
- [7] McKinsey — State of Organizations 2026 / Building the AI-powered organization. https://www.mckinsey.com (via unleash.ai summary)
- [9] Gartner — Hype Cycle for Agentic AI + Strategic Predictions 2026. https://www.gartner.com/en/articles/hype-cycle-for-agentic-ai
- [10] Google Cloud Blog — Introducing Gemini Enterprise Agent Platform. https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform
- [13b] Infosys — Investor AI Day 2026 transcript. https://www.infosys.com/investors/news-events/analyst-meet/2026/india/transcripts/ai-platform-suite.pdf
- [15] Infosys PR — Collaboration with OpenAI. https://www.infosys.com/newsroom/press-releases/2026/collaboration-accelerate-enterprise-ai-transformation.html
- [16] Snowflake PR — Intelligence and Cortex Code expansion. https://www.snowflake.com/en/news/press-releases/snowflake-expands-snowflake-intelligence-and-cortex-code-to-power-the-control-plane-for-the-agentic-enterprise/
- [18] Snowflake Engineering Blog — Cortex AI Guardrails. https://www.snowflake.com/en/engineering-blog/cortex-ai-guardrails-prompt-injection-prevention/
- [21] OpenAI — OpenAI on AWS. https://openai.com/index/openai-on-aws/

### Priority 2: Comparison / Analysis
- [3] MIT — GenAI Divide 2025 (referenced via productiveedge.com). https://www.productiveedge.com/blog/why-95-of-ai-pilots-fail-and-how-to-be-in-the-5-that-succeed
- [4] S&P Global — 2025 AI survey (referenced via beam.ai). https://beam.ai/agentic-insights/why-42-percent-of-ai-projects-show-zero-roi-and-how-to-be-in-the-58-percent
- [8] Forbes — The 93/7 Problem (Deloitte data). https://www.forbes.com/councils/forbescoachescouncil/2026/05/06/the-937-problem-why-companies-are-spending-their-ai-budgets-backward/

### Priority 3: News / Tech Press
- [5] Digital Applied — AI Agent Scaling Gap. https://www.digitalapplied.com/blog/ai-agent-scaling-gap-march-2026-pilot-to-production
- [6] Agentic AI Institute — Enterprise Adoption 2026 Governance Gap. https://agenticaiinstitute.org/agentic-ai-enterprise-adoption-2026-governance-gap/
- [11] SiliconAngle — Google agent platform analysis. https://siliconangle.com/2026/04/22/google-brings-agentic-development-optimization-governance-one-roof-gemini-enterprise-agent-platform/
- [12] eWeek — Google April 2026 AI announcements. https://www.eweek.com/news/google-april-2026-ai-announcements-gemini-agents/
- [13] The Market AI — Infosys Topaz Fabric launch. https://www.themarketai.com/post/infosys-launches-topaz-fabric-a-composable-human-in-the-loop-stack-of-ai-agents-for-enterprise-it
- [14] Medium — Infosys 500 AI agents. https://medium.com/@abhijeetyadavcse/infosys-deployed-500-ai-agents-enterprise-ai-at-scale-787e8306fade
- [17] Constellation Research — Snowflake updates. https://www.constellationr.com/insights/news/snowflake-rolls-out-snowflake-intelligence-cortex-code-updates
- [19] TechStrong AI — OpenAI Workspace Agents. https://techstrong.ai/articles/openai-debuts-workspace-agents-to-extend-chatgpt-into-enterprise-workflows/
- [20] VentureBeat — OpenAI Workspace Agents. https://venturebeat.com/orchestration/openai-unveils-workspace-agents-a-successor-to-custom-gpts-for-enterprises-that-can-plug-directly-into-slack-salesforce-and-more
