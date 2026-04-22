# Landscape de Harnesses de IA y Comparativa con Sancho CMO

> Análisis del ecosistema de harnesses third-party para IA, frameworks de orquestación de agentes, y plataformas de "AI CMO" — comparados con el enfoque único de SanchoCMO.

---

## 1. Qué es un Harness de IA

Un **harness** es la infraestructura que envuelve un modelo de IA para hacerlo fiable y útil: herramientas, memoria, permisos, subagentes, skills, y flujos de trabajo estructurados. El término "harness engineering" entró en uso mainstream a principios de 2026, reconocido como disciplina distinta por Martin Fowler y Anthropic.

**Componentes típicos de un harness:**
- Sistema de prompts/instrucciones persistentes (CLAUDE.md, AGENTS.md)
- Herramientas y acceso a APIs
- Sistema de memoria (corto y largo plazo)
- Skills de progressive disclosure
- Permisos y guardrails de seguridad
- Orquestación de subagentes

---

## 2. Categorías de Harnesses en el Mercado

### 2.1 Frameworks de Orquestación de Agentes (Developer-Focused)

| Framework | Filosofía | Fortaleza | Debilidad vs Sancho |
|-----------|-----------|-----------|---------------------|
| **LangChain/LangGraph** | Grafos de control de flujo | 47M+ descargas PyPI, ecosistema masivo | Sin dominio vertical, requiere programación |
| **CrewAI** | Roles y tripulaciones | Multi-agente simple, production-ready | Genérico, sin knowledge base estructurada |
| **Microsoft Agent Framework** (ex-AutoGen + Semantic Kernel) | Conversacional multi-agente | Integración Microsoft stack, GA Q1 2026 | Enterprise-heavy, sin marketing vertical |
| **OpenAI Agents SDK** | Barrera de entrada mínima | Fácil de empezar | Sin estructura de proyectos/tareas |
| **n8n** | Workflows visuales low-code | No-code friendly | Sin inteligencia contextual profunda |

**Diferencia clave con Sancho:** Estos frameworks son **toolkits genéricos** — proporcionan primitivas (grafos, roles, herramientas) pero no tienen opinión sobre qué hacer con ellas. Sancho es un **harness opinionated** que ya sabe que su trabajo es entender una empresa, crear estrategia, e implementarla.

### 2.2 Harnesses para Claude Code (Developer-Focused)

| Harness | Descripción | Diferencia vs Sancho |
|---------|-------------|---------------------|
| **Chachamaru claude-code-harness** | Ciclo autónomo Plan→Work→Review para desarrollo de software. Paralelismo auto-detectado, guardrails contra escrituras destructivas. | Solo desarrollo de software, sin dominio de negocio |
| **everything-claude-code** (affaan-m) | 38 agentes especializados, 156 skills, 72 comandos. Sistema de memoria, instintos, seguridad. 10+ meses de uso diario. | Optimización de desarrollo, no estrategia empresarial |
| **Claude Agent SDK** (Anthropic oficial) | Expone el mismo harness de Claude Code como SDK. Subagentes, herramientas, MCP. Python + TypeScript. | Framework base, no solución vertical |
| **Harness Engineering patterns** (community) | CLAUDE.md + skills + hooks como estándar abierto. Soportado por Claude Code, Codex, OpenCode. | Patrones genéricos, sin pipeline estratégico |

**Diferencia clave con Sancho:** Estos harnesses optimizan el **desarrollo de software**. Sancho opera en un dominio completamente diferente: **gestión estratégica de marketing**. No compiten — operan en capas distintas.

### 2.3 Plataformas de "AI CMO" (Marketing-Focused)

| Plataforma | Modelo | Agentes | Precio | Diferencia vs Sancho |
|------------|--------|---------|--------|---------------------|
| **Okara AI CMO** | Orquestación de 6 agentes autónomos sobre 20-30 modelos open-source | SEO, GEO, Copywriter, Community, X, Analytics | $99/mes | Ejecución táctica sin fase de understanding profundo |
| **NoimosAI** | "Brand Memory Layer" + agentes especializados | Strategy, SEO, GEO, Social Media | SaaS | Brand memory superficial vs Foundation de 15 pilares |
| **Jasper** | Copiloto de contenido con brand voice | Generación de contenido | Enterprise | Solo contenido, no estrategia end-to-end |
| **Copy.ai** | Workflows de GTM automatizados | Ventas, Marketing | SaaS | Workflows fijos, no adaptativo |

---

## 3. Tabla Comparativa Detallada: Sancho vs Competidores

| Capacidad | Sancho CMO | Okara AI CMO | NoimosAI | CrewAI | Claude Code Harnesses |
|-----------|-----------|--------------|----------|--------|----------------------|
| **Fase de Understanding** (Foundation) | ✅ 15 pilares, deep research por pilar | ❌ URL scan inicial | ⚠️ Brand Memory básica | ❌ No aplica | ❌ No aplica |
| **Estrategia antes de ejecución** | ✅ Estrategia → Proyectos → Tareas | ❌ Ejecución directa | ⚠️ "Growth Strategy" genérica | ❌ Manual | ❌ No aplica |
| **Knowledge base estructurada** | ✅ Foundation con 15 pilares verificados | ❌ No tiene | ⚠️ "Unified Intelligence" | ❌ No tiene | ⚠️ CLAUDE.md plano |
| **Skills especializadas** | ✅ 149+ skills por dominio | ⚠️ 6 agentes fijos | ⚠️ 4 agentes fijos | ✅ Extensible | ✅ Skills system |
| **Dispatch por threads** | ✅ Threads → Proyectos → Tareas | ❌ Dashboard | ❌ Dashboard | ❌ No tiene | ❌ No tiene |
| **Multi-canal** (WhatsApp, Telegram, Discord) | ✅ OpenClaw gateway | ❌ Solo web | ❌ Solo web | ❌ No aplica | ❌ Terminal/IDE |
| **Deep research verificado** | ✅ 10+ fuentes por sección, ES+EN | ⚠️ Web scraping básico | ⚠️ Análisis competitivo | ❌ Manual | ❌ WebSearch básico |
| **Adaptabilidad por empresa** | ✅ Foundation personalizada | ⚠️ URL-based | ⚠️ Brand memory | ❌ Config manual | ⚠️ CLAUDE.md |
| **Verificación/QA integrada** | ✅ qa-bot + checklist por skill | ❌ No | ❌ No | ❌ Manual | ⚠️ Hooks |
| **Open source** | ⚠️ Semi (OpenClaw base) | ❌ SaaS cerrado | ❌ SaaS cerrado | ✅ Open source | ✅ Open source |

---

## 4. Lo que Sancho Hace que Nadie Más Hace

### 4.1 El Pipeline Foundation → Strategy → Execution

**Ningún competidor tiene un pipeline de 3 fases con esta profundidad:**

1. **Foundation** (Entender): 15 pilares de conocimiento empresarial (brand identity, market analysis, competitors, ICP, etc.) cada uno investigado en profundidad con fuentes verificadas. Esto crea una **base de conocimiento estructurada** que informa todas las decisiones posteriores.

2. **Strategy** (Planificar): Estrategias derivadas de la Foundation, no genéricas. Proyectos con tareas concretas, deadlines, y asignación.

3. **Execution** (Implementar): Skills especializadas que ejecutan las tareas usando el contexto de Foundation. El agente sabe POR QUÉ hace lo que hace.

**Okara y NoimosAI** saltan directamente a ejecución. Escanean una URL y empiezan a generar contenido. No hay fase de understanding profundo. No saben quién es el ICP, cuáles son los pain points del mercado, ni cuál es la propuesta de valor diferencial — lo adivinan de la web.

### 4.2 Dispatch por Conversación Natural (Threads)

Sancho recibe instrucciones por **WhatsApp/Telegram/Discord** y las mapea a proyectos y tareas. Esto es radicalmente diferente a:
- Dashboards web (Okara, NoimosAI)
- Terminales (Claude Code harnesses)
- APIs programáticas (LangChain, CrewAI)

El modelo de interacción de Sancho es **conversacional y asíncrono**, como hablar con un CMO real.

### 4.3 Foundation como Diferenciador Estructural

La Foundation de 15 pilares no es simplemente "brand memory" como NoimosAI o "custom instructions" como CLAUDE.md. Es:
- **Investigada en profundidad** (deep-research con 10+ fuentes por sección)
- **Versionada** (history.json, backups por pilar)
- **Verificable** (qa-bot, checklist por skill)
- **Evolutiva** (se actualiza con cada interacción y descubrimiento)
- **Cross-referenciada** (los pilares se informan mutuamente)

### 4.4 Escala de Skills (149+)

Mientras Okara tiene 6 agentes fijos y NoimosAI tiene 4, Sancho tiene **149+ skills ready** que cubren desde competitive intelligence hasta keyword research, content creation, customer research, y operations. Cada skill sabe cómo leer la Foundation y actuar en contexto.

---

## 5. Vulnerabilidades y Riesgos

### 5.1 Dependencia de Claude/Anthropic
- Anthropic cortó acceso OAuth para third-party harnesses el 5 de abril de 2026
- OpenClaw necesita migrar a API keys directas (más caro, sin cache optimization)
- Los harnesses de Claude Code tienen ventaja por ser first-party

### 5.2 Complejidad
- 149+ skills y 15 pilares Foundation = curva de aprendizaje significativa
- Los competidores como Okara son "plug and play" ($99/mes, URL, listo)
- Sancho requiere onboarding profundo

### 5.3 Mercado Emergente
- "Harness engineering" como disciplina tiene menos de 6 meses
- Los frameworks genéricos (LangChain, CrewAI) podrían añadir verticales
- Okara/NoimosAI podrían profundizar su understanding layer

---

## 6. Conclusiones

### ¿Es Sancho Novedoso?

**Sí, significativamente.** Sancho ocupa un espacio que nadie más llena:

1. **No es un framework genérico** como LangChain/CrewAI — es opinionated sobre marketing estratégico
2. **No es un AI CMO superficial** como Okara/NoimosAI — tiene Foundation profunda antes de ejecutar
3. **No es un harness de desarrollo** como claude-code-harness — opera en dominio de negocio
4. **No es un copiloto de contenido** como Jasper — es estrategia end-to-end

**La combinación única de Sancho es:**
- Foundation estructurada de 15 pilares → Estrategia informada → Ejecución contextual
- Dispatch conversacional multi-canal (WhatsApp/Telegram/Discord)
- 149+ skills especializadas con QA integrada
- Deep research verificado con fuentes reales

**El competidor más cercano** es NoimosAI por su "Brand Memory Layer", pero es superficial comparado con Foundation (escaneo web vs 15 pilares investigados en profundidad).

**El riesgo principal** no es que alguien haga exactamente lo mismo, sino que:
- Anthropic restrinja más el acceso third-party
- Un framework genérico (CrewAI) lance un "Marketing Pack" vertical
- Okara/NoimosAI profundicen su capa de understanding

---

## Fuentes

- [LangGraph vs CrewAI vs AutoGen: Top 10 AI Agent Frameworks](https://o-mega.ai/articles/langgraph-vs-crewai-vs-autogen-top-10-agent-frameworks-2026)
- [Complete AI Agent Framework Comparison 2026](https://dev.to/agdex_ai/langchain-vs-crewai-vs-autogen-vs-dify-the-complete-ai-agent-framework-comparison-2026-4j8j)
- [Claude Code Agent Harness Architecture](https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture/)
- [Anthropic Bans Third-Party Harness OpenClaw](https://creati.ai/ai-news/2026-04-04/anthropic-bans-openclaw-from-claude-subscriptions/)
- [Okara AI CMO Explained](https://www.digit.in/features/general/okara-ai-cmo-explained-the-autonomous-marketing-agent-for-startups.html)
- [NoimosAI Best Autonomous AI Agents for Marketing](https://noimosai.com/en/blog/best-autonomous-ai-agents-for-marketing-in-2026-the-ultimate-guide)
- [Harness Engineering Complete Guide 2026](https://www.nxcode.io/resources/news/what-is-harness-engineering-complete-guide-2026)
- [Skill Issue: Harness Engineering for Coding Agents](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents)
- [Martin Fowler: Harness Engineering for Coding Agent Users](https://martinfowler.com/articles/harness-engineering.html)
- [Chachamaru claude-code-harness](https://github.com/Chachamaru127/claude-code-harness)
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [AI CMO: How AI Agents Are Reshaping Marketing Leadership](https://improvado.io/blog/ai-cmo)
- [Anthropic Clarifies Ban on Third-Party Tool Access](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/)
