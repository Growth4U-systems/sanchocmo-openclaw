import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app";

// ============================================================
// Guide Page — Two full versions: ES / EN
// ============================================================

const i18n = {
  es: {
    title: "¿Cómo empezar?",
    subtitle: "Todo lo que necesitas saber",
    heroTitle: "🐴 Bienvenido a SanchoCMO",
    heroDesc: 'Un CMO virtual con <strong class="text-foreground">10 agentes de IA especializados</strong>, orquestados por Sancho — desde estrategia y research hasta contenido, outreach, paid ads y QA.',
    heroCta: "Tú decides. Sancho orquesta. Los agentes ejecutan.",
    flywheelTitle: "⚡ Cómo funciona — El Flywheel",
    flywheelSubtitle: "Un ciclo que se repite y mejora con cada vuelta.",
    flywheelSteps: [
      { icon: "🔍", label: "Encuentra", desc: "Research, intelligence,\nkeywords, competidores" },
      { icon: "📋", label: "Decide", desc: "Canales, calendario,\nprioridades, presupuesto" },
      { icon: "✍️", label: "Crea", desc: "SEO, social, emails,\nlanding pages, ads" },
      { icon: "🚀", label: "Ejecuta", desc: "Publica, outreach,\ncampañas, distribución" },
      { icon: "📊", label: "Aprende", desc: "Métricas, patrones,\nfeedback → mejora" },
    ],
    flywheelLoop: "↩️ El ciclo se repite. Cada vuelta es mejor que la anterior.",
    hormoziTitle: "📐 Los 4 Canales de Crecimiento",
    hormoziSubtitle: "Basado en la Matriz Hormozi (Core Four). SanchoCMO cubre los 4 cuadrantes.",
    hormozi: [
      { quadrant: "1:1 × Sin presupuesto", title: "🎯 Outreach Directo", desc: "Buscar empresas → encontrar decisores → enriquecer contactos → secuencias frías" },
      { quadrant: "1:Many × Sin presupuesto", title: "📝 Contenido Orgánico", desc: "SEO, social, newsletter, lead magnets, email nurture" },
      { quadrant: "1:1 × Con presupuesto", title: "🤝 Partners & Afiliados", desc: "Alianzas, co-marketing, influencers, referrals" },
      { quadrant: "1:Many × Con presupuesto", title: "📣 Paid Ads", desc: "Facebook, Google, LinkedIn ads, retargeting" },
    ],
    hormoziGap: "❌ = gap pendiente de desarrollar",
    phasesTitle: "🗺️ Las 4 Fases — De cero a escalar",
    phasesSubtitle: 'Todo cliente pasa por estas fases. <code class="text-xs">sancho-start</code> detecta automáticamente en cuál estás y te enruta.',
    phases: [
      { phase: "P0 · Diagnose", time: "~2 horas · automático", question: "¿Dónde está el cuello de botella?", desc: 'Sancho escanea web, reviews, competencia. Determina la "meta": ¿ARREGLAR, LANZAR, LEADS, o ESCALAR? Enruta a la fase correcta.' },
      { phase: "P1 · Foundation", time: "1 día (Lite) — 1 semana (Deep)", question: "¿Quiénes somos, a quién servimos, qué decimos?", desc: "12 pilares en 6 layers (DAG v2.0): Company Brief → Research → Synthesis → Discovery → Activation → Brand Identity. Conversacional desde Discord en #onboarding con Sancho." },
      { phase: "P2 · Funnel", time: "1 — 2 semanas", question: "Si mando 1.000 personas, ¿cuántas convierten?", desc: "Landing pages (El Arquitecto), email sequences (El Comercial), lead magnets, trust engine (casos de éxito). La infraestructura de conversión." },
      { phase: "P3 · Scale", time: "Continuo", question: "¿Cómo generamos tráfico y crecemos?", desc: "Los 4 canales Hormozi en acción. Daily Pulse + Thief Marketer alimentan ideas. Content Calendar planifica. Agentes ejecutan. Learning loops mejoran." },
    ],
    foundationTitle: "🏗️ Foundation — Los 16 Pilares",
    foundationSubtitle: 'Organizados en capas (DAG). Cada capa depende de la anterior. <strong>Lite</strong> = 7 pilares esenciales. <strong>Deep</strong> = los 16.',
    foundationLayers: [
      { label: "L0", title: "Siempre primero (en paralelo)", checkpoint: "" },
      { label: "L1", title: "Análisis paralelo", checkpoint: "" },
      { label: "L2", title: "Síntesis", checkpoint: "Checkpoint: cliente valida" },
      { label: "L3", title: "Discovery — el corazón", checkpoint: "Checkpoint: cliente elige ECPs" },
      { label: "L4", title: "Activación", checkpoint: "" },
      { label: "L5", title: "Visual", checkpoint: "" },
    ],
    agentsTitle: "🤖 Los 10 Agentes",
    agentsSubtitle: "Cada uno tiene su canal Discord, su personalidad (SOUL.md), y sus skills asignadas. Sancho les envía briefs, ellos ejecutan.",
    agents: [
      { name: "Cervantes", ch: "Webchat + #admin", model: "Opus 4.6", role: "Arquitecto del sistema", emoji: "✒️" },
      { name: "Sancho", ch: "Todos los canales Discord", model: "Opus 4.6", role: "CMO Estratega / Orchestrator", emoji: "🤠" },
      { name: "Hamete", ch: "#research, #intelligence", model: "Sonnet 4.5", role: "Cronista — Research & Market Intel", emoji: "📜" },
      { name: "Dulcinea", ch: "#content, #web", model: "Sonnet 4.5", role: "Musa — Contenido escrito", emoji: "✍️" },
      { name: "Rocinante", ch: "#prospecting, #partners", model: "Sonnet 4.5", role: "Outreach & Partnerships", emoji: "🐴" },
      { name: "Maese Pedro", ch: "#creatives, #design, #web", model: "Opus 4.6", role: "Visual Director / Creative Engine", emoji: "🎭" },
      { name: "Yalc Agent", ch: "Mission Control / GTM-OS", model: "Sonnet 4.5", role: "YALC operator / outbound GTM", emoji: "🧭" },
      { name: "Mambrino", ch: "#paid-ads", model: "Sonnet 4.5", role: "Paid Ads & Retargeting", emoji: "🪖" },
      { name: "Merlín", ch: "#learning", model: "Sonnet 4.5", role: "Data, atribución & forecasting", emoji: "🔮" },
      { name: "Sansón", ch: "Invocado por Sancho (QA)", model: "Sonnet 4.5", role: "QA, brand-check & devil's advocate", emoji: "🛡️" },
    ],
    pillarsTitle: "🧱 Los 5 Pilares del Sistema",
    pillarsSubtitle: "La arquitectura que hace que todo funcione.",
    pillars: [
      { icon: "📜", name: "Shared Protocol", desc: 'brand-memory.md — la "constitución" que define cómo se comunican todas las skills entre sí.' },
      { icon: "🗄️", name: "Persistent Memory", desc: "./brand/ (Context Lake) — 3 tiers: Constitution, Strategic, Transitory. Los datos del cliente viven aquí." },
      { icon: "🎯", name: "Scored Context", desc: "Context Matrix — cada skill lee SOLO lo que necesita. No se dumpa todo. Freshness TTLs evitan datos obsoletos." },
      { icon: "📐", name: "Schema Contracts", desc: "7 JSON schemas en _system/schemas/ — typed interfaces entre skills. Sin re-explicar entre sesiones." },
      { icon: "🔄", name: "Learning Loops", desc: "Feedback → learnings.md → adapt. El sistema mejora con el uso. Insights se promueven de Tier 3 → 2 → 1." },
    ],
    dataTitle: "💾 Dónde viven los datos",
    dataSubtitle: "Principio dual: identidad de marca en archivos, datos operacionales en base de datos.",
    dataFiles: "📁 Archivos <code>./brand/</code>",
    dataFilesContent: '<strong>Tier 1 Constitution:</strong> empresa, ICP, ECPs, positioning, voice<br /><strong>Tier 2 Strategic:</strong> competidores, mercado, SWOT, pricing<br /><strong>Tier 3 Transitory:</strong> meeting notes, daily pulse, validaciones<br /><br />Human-readable, git-trackable, OpenClaw-nativo.',
    dataDb: "🗃️ Supabase (PostgreSQL)",
    dataDbContent: "Sin tablas activas actualmente.<br /><br />Concurrencia, queries SQL, Row-Level Security.",
    discordTitle: "💬 Discord — Centro de operaciones",
    discordSubtitle: "Cada cliente tiene un servidor Discord con 14 canales en 5 categorías. Los agentes están vinculados a sus canales.",
    discordCategories: [
      { name: "Estrategia", channels: "#el-toboso · #campaigns · #intelligence" },
      { name: "Outreach (1:1)", channels: "#partners · #prospecting" },
      { name: "Content (1:many)", channels: "#organic-content · #social · #paid-ads · #web" },
      { name: "Soporte", channels: "#sales · #design · #research" },
      { name: "Sistema", channels: "#learning · #admin" },
    ],
    discordDispatch: "<strong>Auto-dispatch:</strong> Sancho crea briefs en #campaigns → al aprobar (✅), se despachan threads a los canales de cada agente automáticamente.",
    automationsTitle: "⚙️ Automatizaciones activas",
    automationsSubtitle: "Sancho trabaja en segundo plano. Dos tipos de automatización:",
    heartbeat: "💓 Heartbeat",
    heartbeatFreq: "cada 3h",
    heartbeatDesc: "Checks rápidos y baratos en la sesión principal: email, calendario, regenerar dashboard. Si no hay nada → silencio.",
    cronTitle: "⏰ Cron Jobs",
    cronFreq: "hora exacta",
    cronDesc: "Tareas pesadas en sesiones aisladas: Daily Pulse, Meeting Intel, Weekly Synthesis. Output directo a Discord.",
    automations: [
      { name: "Daily Pulse", schedule: "L-V 9:00 → #intelligence", icon: "📊" },
      { name: "Meeting Intel", schedule: "L-V 18:00 → #intelligence", icon: "🧠" },
      { name: "Weekly Synthesis", schedule: "Lunes 10:00 → #learning", icon: "📝" },
      { name: "Thief Marketer", schedule: "Miércoles 8:00 (post-Foundation)", icon: "🕵️" },
      { name: "Dashboard Regen", schedule: "4x al día (Sonnet)", icon: "🔄" },
      { name: "Memory Maint.", schedule: "Domingo 22:00 (Sonnet)", icon: "🗄️" },
    ],
    tasksTitle: "✅ Sistema de tareas",
    tasksSubtitle: 'Nada cambia sin tarea aprobada. <code class="text-xs">TASKS.md</code> es la fuente de verdad.',
    taskSteps: [
      { label: "📥 Propuesta", color: "bg-violet-500/15 text-rust" },
      { label: "👀 Review", color: "bg-amber-500/15 text-amber-500" },
      { label: "✅ Aprobada", color: "bg-green-500/15 text-green-500" },
      { label: "🔧 En progreso", color: "bg-blue-500/15 text-blue-500" },
      { label: "✔️ Hecha", color: "bg-green-500/25 text-green-500" },
    ],
    taskHowTo: [
      '<strong>3 formas de proponer:</strong> botón ➕ en este dashboard, Discord <code>#admin</code>, o webchat.',
      '<strong>Aprobar:</strong> click "✅ Aprobar" en la tarjeta, o dile a Sancho por chat.',
      '<strong>Ejecutar:</strong> click "▶️ Ejecutar" o escribe: <em>"Ejecuta T-XXX"</em>.',
      '<strong>Completada:</strong> Sancho registra en <code>CHANGELOG.md</code> automáticamente.',
    ],
    skillsTitle: "🧰 38 Skills — El arsenal",
    skillsSubtitle: "Cada skill es un módulo especializado. Sancho elige cuál usar según el contexto.",
    skillCategories: [
      { name: "Foundation", count: 16, desc: "empresa, mercado, competidores, nicho, posicionamiento, voz, visual..." },
      { name: "Decide", count: 3, desc: "canales, calendario, outreach sequences" },
      { name: "Intelligence", count: 5, desc: "daily pulse, meetings, patterns, thief marketer, signals" },
      { name: "Content", count: 7, desc: "SEO, atomizer, newsletter, email, lead magnet, copy, keyword" },
      { name: "Outreach", count: 3, desc: "company finder, decision maker, contact enrichment" },
      { name: "Utilities", count: 4, desc: "orchestrators, diagnostics, routing" },
    ],
    skillsViewAll: "Ver todas las skills →",
    faqTitle: "❓ Preguntas frecuentes",
    faq: [
      { q: "¿Sancho puede publicar cosas sin mi permiso?", a: "No. Sancho propone, tú apruebas. Nada sale al exterior sin tu OK explícito. El flujo es: DRAFT → REVIEW → APPROVE → PUBLISH." },
      { q: "¿Qué pasa si Foundation está incompleta?", a: "Sancho se adapta. Trabaja con lo que hay, pero la calidad mejora con más contexto. Foundation Lite (7 pilares) es suficiente para empezar a ejecutar." },
      { q: "¿Los datos de un cliente se mezclan con otro?", a: "No. Cada cliente tiene su propio servidor Discord, proyecto Supabase, y directorio brand/. Zero data leakage. Solo las skills y agentes se comparten (vía symlinks)." },
      { q: "¿Cuánto cuesta operar?", a: "APIs de IA (Anthropic ~$20-100/mes según uso), Supabase (free tier 2 proyectos, luego $25/proyecto), Tailscale (free para equipos pequeños). No hay fee del sistema." },
      { q: "¿Puedo añadir más agentes o skills?", a: "Sí. Skills con skill-creator, agentes en openclaw.json. Propón una tarea y Sancho lo monta." },
      { q: "¿Qué gaps tiene el sistema?", a: "Principalmente en Ejecuta (publicación automática, ad creators) y Aprende (analytics, funnel analysis). El sistema Encuentra + Decide + Crea está casi completo." },
    ],
    accessTitle: "🔑 Accesos",
    accessInternal: "👨‍💻 Equipo interno",
    accessInternalContent: '1. Instalar Tailscale<br />2. Unirse a la Tailnet<br />3. <code class="text-[10px]">https://sancho-cmo.taild48df2.ts.net</code><br />4. Discord: todos los canales',
    accessClient: "🏢 Clientes",
    accessClientContent: "Solo Discord. Invitación al servidor del cliente.<br />No necesitan Tailscale, dashboard, ni configurar nada.",
  },
  en: {
    title: "Getting started",
    subtitle: "Everything you need to know",
    heroTitle: "🐴 Welcome to SanchoCMO",
    heroDesc: 'A virtual CMO with <strong class="text-foreground">10 specialized AI agents</strong>, orchestrated by Sancho — from strategy and research to content, outreach, paid ads, and QA.',
    heroCta: "You decide. Sancho orchestrates. The agents execute.",
    flywheelTitle: "⚡ How it works — The Flywheel",
    flywheelSubtitle: "A cycle that repeats and improves with each turn.",
    flywheelSteps: [
      { icon: "🔍", label: "Find", desc: "Research, intelligence,\nkeywords, competitors" },
      { icon: "📋", label: "Decide", desc: "Channels, calendar,\npriorities, budget" },
      { icon: "✍️", label: "Create", desc: "SEO, social, emails,\nlanding pages, ads" },
      { icon: "🚀", label: "Execute", desc: "Publish, outreach,\ncampaigns, distribution" },
      { icon: "📊", label: "Learn", desc: "Metrics, patterns,\nfeedback → improve" },
    ],
    flywheelLoop: "↩️ The cycle repeats. Each turn is better than the last.",
    hormoziTitle: "📐 The 4 Growth Channels",
    hormoziSubtitle: "Based on the Hormozi Matrix (Core Four). SanchoCMO covers all 4 quadrants.",
    hormozi: [
      { quadrant: "1:1 × No budget", title: "🎯 Direct Outreach", desc: "Find companies → find decision makers → enrich contacts → cold sequences" },
      { quadrant: "1:Many × No budget", title: "📝 Organic Content", desc: "SEO, social, newsletter, lead magnets, email nurture" },
      { quadrant: "1:1 × With budget", title: "🤝 Partners & Affiliates", desc: "Alliances, co-marketing, influencers, referrals" },
      { quadrant: "1:Many × With budget", title: "📣 Paid Ads", desc: "Facebook, Google, LinkedIn ads, retargeting" },
    ],
    hormoziGap: "❌ = gap pending development",
    phasesTitle: "🗺️ The 4 Phases — From zero to scale",
    phasesSubtitle: 'Every client goes through these phases. <code class="text-xs">sancho-start</code> automatically detects where you are and routes you.',
    phases: [
      { phase: "P0 · Diagnose", time: "~2 hours · automatic", question: "Where is the bottleneck?", desc: 'Sancho scans web, reviews, competition. Determines the "goal": FIX, LAUNCH, LEADS, or SCALE? Routes to the right phase.' },
      { phase: "P1 · Foundation", time: "1 day (Lite) — 1 week (Deep)", question: "Who are we, who do we serve, what do we say?", desc: "12 pillars in 6 layers (DAG v2.0): Company Brief → Research → Synthesis → Discovery → Activation → Brand Identity. Conversational from Discord in #onboarding with Sancho." },
      { phase: "P2 · Funnel", time: "1 — 2 weeks", question: "If I send 1,000 people, how many convert?", desc: "Landing pages (El Arquitecto), email sequences (El Comercial), lead magnets, trust engine (case studies). The conversion infrastructure." },
      { phase: "P3 · Scale", time: "Ongoing", question: "How do we generate traffic and grow?", desc: "The 4 Hormozi channels in action. Daily Pulse + Thief Marketer feed ideas. Content Calendar plans. Agents execute. Learning loops improve." },
    ],
    foundationTitle: "🏗️ Foundation — The 16 Pillars",
    foundationSubtitle: 'Organized in layers (DAG). Each layer depends on the previous one. <strong>Lite</strong> = 7 essential pillars. <strong>Deep</strong> = all 16.',
    foundationLayers: [
      { label: "L0", title: "Always first (in parallel)", checkpoint: "" },
      { label: "L1", title: "Parallel analysis", checkpoint: "" },
      { label: "L2", title: "Synthesis", checkpoint: "Checkpoint: client validates" },
      { label: "L3", title: "Discovery — the heart", checkpoint: "Checkpoint: client chooses ECPs" },
      { label: "L4", title: "Activation", checkpoint: "" },
      { label: "L5", title: "Visual", checkpoint: "" },
    ],
    agentsTitle: "🤖 The 10 Agents",
    agentsSubtitle: "Each has its own Discord channel, personality (SOUL.md), and assigned skills. Sancho sends them briefs, they execute.",
    agents: [
      { name: "Cervantes", ch: "Webchat + #admin", model: "Opus 4.6", role: "System architect", emoji: "✒️" },
      { name: "Sancho", ch: "All Discord channels", model: "Opus 4.6", role: "CMO Strategist / Orchestrator", emoji: "🤠" },
      { name: "Hamete", ch: "#research, #intelligence", model: "Sonnet 4.5", role: "Chronicler — Research & Market Intel", emoji: "📜" },
      { name: "Dulcinea", ch: "#content, #web", model: "Sonnet 4.5", role: "Muse — Written content", emoji: "✍️" },
      { name: "Rocinante", ch: "#prospecting, #partners", model: "Sonnet 4.5", role: "Outreach & Partnerships", emoji: "🐴" },
      { name: "Maese Pedro", ch: "#creatives, #design, #web", model: "Opus 4.6", role: "Visual Director / Creative Engine", emoji: "🎭" },
      { name: "Yalc Agent", ch: "Mission Control / GTM-OS", model: "Sonnet 4.5", role: "YALC operator / outbound GTM", emoji: "🧭" },
      { name: "Mambrino", ch: "#paid-ads", model: "Sonnet 4.5", role: "Paid Ads & Retargeting", emoji: "🪖" },
      { name: "Merlín", ch: "#learning", model: "Sonnet 4.5", role: "Data, attribution & forecasting", emoji: "🔮" },
      { name: "Sansón", ch: "Invoked by Sancho (QA)", model: "Sonnet 4.5", role: "QA, brand-check & devil's advocate", emoji: "🛡️" },
    ],
    pillarsTitle: "🧱 The 5 System Pillars",
    pillarsSubtitle: "The architecture that makes everything work.",
    pillars: [
      { icon: "📜", name: "Shared Protocol", desc: 'brand-memory.md — the "constitution" that defines how all skills communicate with each other.' },
      { icon: "🗄️", name: "Persistent Memory", desc: "./brand/ (Context Lake) — 3 tiers: Constitution, Strategic, Transitory. Client data lives here." },
      { icon: "🎯", name: "Scored Context", desc: "Context Matrix — each skill reads ONLY what it needs. No dumping everything. Freshness TTLs prevent stale data." },
      { icon: "📐", name: "Schema Contracts", desc: "7 JSON schemas in _system/schemas/ — typed interfaces between skills. No re-explaining between sessions." },
      { icon: "🔄", name: "Learning Loops", desc: "Feedback → learnings.md → adapt. The system improves with use. Insights are promoted from Tier 3 → 2 → 1." },
    ],
    dataTitle: "💾 Where data lives",
    dataSubtitle: "Dual principle: brand identity in files, operational data in database.",
    dataFiles: "📁 Files <code>./brand/</code>",
    dataFilesContent: '<strong>Tier 1 Constitution:</strong> company, ICP, ECPs, positioning, voice<br /><strong>Tier 2 Strategic:</strong> competitors, market, SWOT, pricing<br /><strong>Tier 3 Transitory:</strong> meeting notes, daily pulse, validations<br /><br />Human-readable, git-trackable, OpenClaw-native.',
    dataDb: "🗃️ Supabase (PostgreSQL)",
    dataDbContent: "No active tables currently.<br /><br />Concurrency, SQL queries, Row-Level Security.",
    discordTitle: "💬 Discord — Operations center",
    discordSubtitle: "Each client has a Discord server with 14 channels in 5 categories. Agents are linked to their channels.",
    discordCategories: [
      { name: "Strategy", channels: "#el-toboso · #campaigns · #intelligence" },
      { name: "Outreach (1:1)", channels: "#partners · #prospecting" },
      { name: "Content (1:many)", channels: "#organic-content · #social · #paid-ads · #web" },
      { name: "Support", channels: "#sales · #design · #research" },
      { name: "System", channels: "#learning · #admin" },
    ],
    discordDispatch: "<strong>Auto-dispatch:</strong> Sancho creates briefs in #campaigns → upon approval (✅), threads are dispatched to each agent's channels automatically.",
    automationsTitle: "⚙️ Active automations",
    automationsSubtitle: "Sancho works in the background. Two types of automation:",
    heartbeat: "💓 Heartbeat",
    heartbeatFreq: "every 3h",
    heartbeatDesc: "Quick and cheap checks in the main session: email, calendar, regenerate dashboard. If nothing → silence.",
    cronTitle: "⏰ Cron Jobs",
    cronFreq: "exact time",
    cronDesc: "Heavy tasks in isolated sessions: Daily Pulse, Meeting Intel, Weekly Synthesis. Direct output to Discord.",
    automations: [
      { name: "Daily Pulse", schedule: "Mon-Fri 9:00 → #intelligence", icon: "📊" },
      { name: "Meeting Intel", schedule: "Mon-Fri 18:00 → #intelligence", icon: "🧠" },
      { name: "Weekly Synthesis", schedule: "Monday 10:00 → #learning", icon: "📝" },
      { name: "Thief Marketer", schedule: "Wednesday 8:00 (post-Foundation)", icon: "🕵️" },
      { name: "Dashboard Regen", schedule: "4x per day (Sonnet)", icon: "🔄" },
      { name: "Memory Maint.", schedule: "Sunday 22:00 (Sonnet)", icon: "🗄️" },
    ],
    tasksTitle: "✅ Task system",
    tasksSubtitle: 'Nothing changes without an approved task. <code class="text-xs">TASKS.md</code> is the source of truth.',
    taskSteps: [
      { label: "📥 Proposed", color: "bg-violet-500/15 text-rust" },
      { label: "👀 Review", color: "bg-amber-500/15 text-amber-500" },
      { label: "✅ Approved", color: "bg-green-500/15 text-green-500" },
      { label: "🔧 In progress", color: "bg-blue-500/15 text-blue-500" },
      { label: "✔️ Done", color: "bg-green-500/25 text-green-500" },
    ],
    taskHowTo: [
      '<strong>3 ways to propose:</strong> ➕ button on this dashboard, Discord <code>#admin</code>, or webchat.',
      '<strong>Approve:</strong> click "✅ Approve" on the card, or tell Sancho via chat.',
      '<strong>Execute:</strong> click "▶️ Execute" or type: <em>"Execute T-XXX"</em>.',
      '<strong>Completed:</strong> Sancho logs it in <code>CHANGELOG.md</code> automatically.',
    ],
    skillsTitle: "🧰 38 Skills — The arsenal",
    skillsSubtitle: "Each skill is a specialized module. Sancho chooses which to use based on context.",
    skillCategories: [
      { name: "Foundation", count: 16, desc: "company, market, competitors, niche, positioning, voice, visual..." },
      { name: "Decide", count: 3, desc: "channels, calendar, outreach sequences" },
      { name: "Intelligence", count: 5, desc: "daily pulse, meetings, patterns, thief marketer, signals" },
      { name: "Content", count: 7, desc: "SEO, atomizer, newsletter, email, lead magnet, copy, keyword" },
      { name: "Outreach", count: 3, desc: "company finder, decision maker, contact enrichment" },
      { name: "Utilities", count: 4, desc: "orchestrators, diagnostics, routing" },
    ],
    skillsViewAll: "View all skills →",
    faqTitle: "❓ Frequently asked questions",
    faq: [
      { q: "Can Sancho publish things without my permission?", a: "No. Sancho proposes, you approve. Nothing goes out without your explicit OK. The flow is: DRAFT → REVIEW → APPROVE → PUBLISH." },
      { q: "What if Foundation is incomplete?", a: "Sancho adapts. Works with what's available, but quality improves with more context. Foundation Lite (7 pillars) is enough to start executing." },
      { q: "Does one client's data mix with another?", a: "No. Each client has their own Discord server, Supabase project, and brand/ directory. Zero data leakage. Only skills and agents are shared (via symlinks)." },
      { q: "How much does it cost to operate?", a: "AI APIs (Anthropic ~$20-100/month depending on usage), Supabase (free tier 2 projects, then $25/project), Tailscale (free for small teams). No system fee." },
      { q: "Can I add more agents or skills?", a: "Yes. Skills with skill-creator, agents in openclaw.json. Propose a task and Sancho sets it up." },
      { q: "What gaps does the system have?", a: "Mainly in Execute (automatic publishing, ad creators) and Learn (analytics, funnel analysis). The Find + Decide + Create system is nearly complete." },
    ],
    accessTitle: "🔑 Access",
    accessInternal: "👨‍💻 Internal team",
    accessInternalContent: '1. Install Tailscale<br />2. Join the Tailnet<br />3. <code class="text-[10px]">https://sancho-cmo.taild48df2.ts.net</code><br />4. Discord: all channels',
    accessClient: "🏢 Clients",
    accessClientContent: "Discord only. Invitation to the client's server.<br />No Tailscale, dashboard, or configuration needed.",
  },
} as const;

// Foundation layers — shared structure, only titles differ per locale
const FOUNDATION_PILLARS = [
  { color: "bg-red-500 text-white", pillars: ["🏢 company-context", "💰 budget-constraints", "📊 business-model"] },
  { color: "bg-amber-400 text-black", pillars: ["🔬 self-intelligence", "🕵️ competitor-intel", "🌍 market-intel"], optional: ["📋 customer-data"] },
  { color: "bg-violet-500 text-white", pillars: ["⚔️ SWOT + TOWS"] },
  { color: "bg-green-500 text-black", pillars: ["🎯 niche-discovery-100x → ECPs"], optional: ["🧪 ecp-validation"] },
  { color: "bg-cyan-500 text-black", pillars: ["💬 positioning-messaging", "🗣️ brand-voice", "💲 pricing-hooks"] },
  { color: "bg-pink-500 text-white", pillars: ["🎨 visual-identity"] },
];

const SKILL_COLORS = [
  { color: "border-amber-300 bg-amber-500/5", numColor: "text-amber-500" },
  { color: "border-blue-300 bg-blue-500/5", numColor: "text-blue-500" },
  { color: "border-pink-300 bg-pink-500/5", numColor: "text-pink-500" },
  { color: "border-violet-300 bg-violet-500/5", numColor: "text-violet-500" },
  { color: "border-green-300 bg-green-500/5", numColor: "text-green-500" },
  { color: "border-gray-300 bg-gray-500/5", numColor: "text-gray-500" },
];

const HORMOZI_CORNERS = ["rounded-tl-xl", "rounded-tr-xl", "rounded-bl-xl", "rounded-br-xl"];
const HORMOZI_COLORS = ["bg-blue-500/5", "bg-green-500/5", "bg-amber-500/5", "bg-violet-500/5"];
const HORMOZI_SKILLS = [
  ["company-finder", "decision-maker", "outreach-sequences"],
  ["seo-content", "content-atomizer", "newsletter"],
  ["El Conector"],
  ["El Amplificador"],
];
const HORMOZI_GAPS = [false, false, true, true];

const DISCORD_COLORS = ["text-rust", "text-blue-500", "text-green-500", "text-yellow-500", "text-muted-foreground"];
const PHASE_COLORS = [
  { color: "bg-red-500 text-white", bgCard: "bg-red-500/5" },
  { color: "bg-amber-400 text-black", bgCard: "bg-amber-500/5" },
  { color: "bg-violet-500 text-white", bgCard: "bg-violet-500/5" },
  { color: "bg-green-500 text-black", bgCard: "bg-green-500/5" },
];

const FLYWHEEL_COLORS = [
  "border-blue-400/30 bg-blue-500/10",
  "border-amber-400/30 bg-amber-500/10",
  "border-violet-400/30 bg-violet-500/10",
  "border-green-400/30 bg-green-500/10",
  "border-pink-400/30 bg-pink-500/10",
];

export default function GuidePage() {
  const locale = useAppStore((s) => s.locale);
  const c = i18n[locale];

  return (
    <DashboardLayout>
      <Head><title>{c.title} — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">📖 {c.title}</h1>
      <p className="text-sm text-muted-foreground mb-6">{c.subtitle}</p>

      <div className="space-y-5">
        {/* Hero */}
        <ComicCard className="bg-gradient-to-br from-violet-500/10 to-violet-500/[0.02] border-violet-400/30">
          <div className="text-3xl font-extrabold mb-2">{c.heroTitle}</div>
          <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
            <span dangerouslySetInnerHTML={{ __html: c.heroDesc }} />
            <br />
            <strong className="text-foreground">{c.heroCta}</strong>
          </p>
        </ComicCard>

        {/* Flywheel */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.flywheelTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.flywheelSubtitle}</p>
          <div className="flex items-center justify-center gap-0 flex-wrap">
            {c.flywheelSteps.map((step, i, arr) => (
              <div key={step.label} className="flex items-center">
                <div className={cn("border-2 rounded-xl p-4 text-center min-w-[140px]", FLYWHEEL_COLORS[i])}>
                  <div className="text-2xl">{step.icon}</div>
                  <div className="font-extrabold text-sm mt-1">{step.label}</div>
                  <div className="text-muted-foreground text-[10px] leading-snug mt-1 whitespace-pre-line">{step.desc}</div>
                </div>
                {i < arr.length - 1 && <span className="text-xl text-muted-foreground px-1.5">→</span>}
              </div>
            ))}
          </div>
          <p className="text-center text-muted-foreground text-xs mt-2">{c.flywheelLoop}</p>
        </ComicCard>

        {/* Hormozi Matrix */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.hormoziTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.hormoziSubtitle}</p>
          <div className="grid grid-cols-2 gap-0.5 max-w-2xl">
            {c.hormozi.map((h, i) => (
              <div key={i} className={cn("p-4", HORMOZI_COLORS[i], HORMOZI_CORNERS[i])}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{h.quadrant}</div>
                <div className="font-bold text-sm mb-2">{h.title}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{h.desc}</p>
                <div className="flex gap-1 flex-wrap mt-2">
                  {HORMOZI_SKILLS[i].map((s) => (
                    <span key={s} className={cn("bg-background px-2 py-0.5 rounded text-[10px]", HORMOZI_GAPS[i] && "opacity-50")}>
                      {s}{HORMOZI_GAPS[i] ? " ❌" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">{c.hormoziGap}</p>
        </ComicCard>

        {/* 4 Phases */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.phasesTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: c.phasesSubtitle }} />
          <div className="flex flex-col gap-0.5">
            {c.phases.map((p, i, arr) => (
              <div key={p.phase} className="flex">
                <div className={cn("p-4 min-w-[160px] flex flex-col justify-center", PHASE_COLORS[i].color, i === 0 && "rounded-tl-lg", i === arr.length - 1 && "rounded-bl-lg")}>
                  <div className="font-extrabold text-sm">{p.phase}</div>
                  <div className="text-[10px] opacity-80">{p.time}</div>
                </div>
                <div className={cn("p-4 flex-1", PHASE_COLORS[i].bgCard, i === 0 && "rounded-tr-lg", i === arr.length - 1 && "rounded-br-lg")}>
                  <div className="font-semibold text-xs mb-1">{p.question}</div>
                  <div className="text-muted-foreground text-xs leading-relaxed">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </ComicCard>

        {/* Foundation */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.foundationTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: c.foundationSubtitle }} />
          <div className="flex flex-col gap-1.5">
            {c.foundationLayers.map((layer, i) => (
              <div key={layer.label} className="flex gap-1.5 items-start">
                <div className={cn("px-2.5 py-1 rounded-md text-[10px] font-bold min-w-[48px] text-center", FOUNDATION_PILLARS[i].color)}>
                  {layer.label}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold mb-1">{layer.title}</div>
                  <div className="flex gap-1 flex-wrap">
                    {FOUNDATION_PILLARS[i].pillars.map((p) => (
                      <span key={p} className="bg-muted border border-border px-2.5 py-1 rounded-md text-[10px]">{p}</span>
                    ))}
                    {FOUNDATION_PILLARS[i].optional?.map((p) => (
                      <span key={p} className="bg-muted border border-border px-2.5 py-1 rounded-md text-[10px] opacity-60">{p} <em>opt</em></span>
                    ))}
                    {layer.checkpoint && (
                      <span className="bg-red-500/15 px-2.5 py-1 rounded-md text-[10px] text-red-500">🛑 {layer.checkpoint}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ComicCard>

        {/* Agents */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.agentsTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.agentsSubtitle}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {c.agents.map((a) => (
              <Link key={a.name} href="/dashboard/agents" className="bg-muted border border-border rounded-lg p-3 hover:border-rust transition-colors">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xl">{a.emoji}</span>
                  <span className="font-bold text-sm">{a.name}</span>
                </div>
                <div className="text-muted-foreground text-xs">{a.role}</div>
                <div className="text-blue-500 text-[10px] mt-1">{a.ch}</div>
                <div className="text-muted-foreground text-[9px] mt-0.5">{a.model}</div>
              </Link>
            ))}
          </div>
        </ComicCard>

        {/* 5 System Pillars */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.pillarsTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.pillarsSubtitle}</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {c.pillars.map((p) => (
              <div key={p.name} className="bg-muted rounded-lg p-3">
                <div className="text-lg mb-1">{p.icon}</div>
                <div className="font-bold text-xs">{p.name}</div>
                <div className="text-muted-foreground text-[10px] mt-1 leading-snug">{p.desc}</div>
              </div>
            ))}
          </div>
        </ComicCard>

        {/* Data Architecture */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.dataTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.dataSubtitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-muted rounded-lg p-4">
              <div className="font-bold text-sm mb-2" dangerouslySetInnerHTML={{ __html: c.dataFiles }} />
              <div className="text-xs text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: c.dataFilesContent }} />
            </div>
            <div className="bg-muted rounded-lg p-4">
              <div className="font-bold text-sm mb-2">{c.dataDb}</div>
              <div className="text-xs text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: c.dataDbContent }} />
            </div>
          </div>
        </ComicCard>

        {/* Discord */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.discordTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.discordSubtitle}</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {c.discordCategories.map((cat, i) => (
              <div key={cat.name} className="bg-muted rounded-lg p-3">
                <div className={cn("font-bold text-[11px] uppercase tracking-wide mb-1.5", DISCORD_COLORS[i])}>📁 {cat.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{cat.channels}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-violet-500/5 rounded-lg p-3 text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: c.discordDispatch }} />
        </ComicCard>

        {/* Automations */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.automationsTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.automationsSubtitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="bg-muted rounded-lg p-3">
              <div className="font-bold text-xs mb-1">{c.heartbeat} <span className="text-muted-foreground font-normal">{c.heartbeatFreq}</span></div>
              <div className="text-xs text-muted-foreground leading-relaxed">{c.heartbeatDesc}</div>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <div className="font-bold text-xs mb-1">{c.cronTitle} <span className="text-muted-foreground font-normal">{c.cronFreq}</span></div>
              <div className="text-xs text-muted-foreground leading-relaxed">{c.cronDesc}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
            {c.automations.map((a) => (
              <div key={a.name} className="bg-muted border border-border rounded-lg px-3 py-2.5">
                <div className="font-bold text-xs">{a.icon} {a.name}</div>
                <div className="text-muted-foreground text-[10px]">{a.schedule}</div>
              </div>
            ))}
          </div>
        </ComicCard>

        {/* Task system */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.tasksTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: c.tasksSubtitle }} />
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {c.taskSteps.map((s, i, arr) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className={cn("px-3 py-1.5 rounded-full text-xs font-semibold", s.color)}>{s.label}</span>
                {i < arr.length - 1 && <span className="text-muted-foreground text-lg">→</span>}
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            {c.taskHowTo.map((line, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: line }} />
            ))}
          </div>
        </ComicCard>

        {/* Skills */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-1">{c.skillsTitle}</h2>
          <p className="text-xs text-muted-foreground mb-4">{c.skillsSubtitle}</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {c.skillCategories.map((cat, i) => (
              <Link key={cat.name} href="/dashboard/skills" className={cn("border rounded-lg p-3 hover:shadow-comic-sm transition-shadow", SKILL_COLORS[i].color)}>
                <div className="font-bold text-xs">{cat.name}</div>
                <div className={cn("text-2xl font-extrabold", SKILL_COLORS[i].numColor)}>{cat.count}</div>
                <div className="text-muted-foreground text-[10px] leading-snug">{cat.desc}</div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-3">
            <Link href="/dashboard/skills" className="text-rust text-xs font-semibold hover:underline">{c.skillsViewAll}</Link>
          </div>
        </ComicCard>

        {/* FAQ */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-3">{c.faqTitle}</h2>
          <div className="space-y-3.5">
            {c.faq.map((item) => (
              <div key={item.q}>
                <div className="font-semibold text-sm">{item.q}</div>
                <div className="text-muted-foreground text-xs mt-1">{item.a}</div>
              </div>
            ))}
          </div>
        </ComicCard>

        {/* Access */}
        <ComicCard>
          <h2 className="font-heading text-base text-navy mb-3">{c.accessTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-muted rounded-lg p-4">
              <div className="font-bold text-sm mb-1.5">{c.accessInternal}</div>
              <div className="text-xs text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: c.accessInternalContent }} />
            </div>
            <div className="bg-muted rounded-lg p-4">
              <div className="font-bold text-sm mb-1.5">{c.accessClient}</div>
              <div className="text-xs text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: c.accessClientContent }} />
            </div>
          </div>
        </ComicCard>
      </div>
    </DashboardLayout>
  );
}
