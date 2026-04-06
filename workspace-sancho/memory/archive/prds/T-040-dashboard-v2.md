# PRD — T-040: Dashboard v2 (Okara-inspired, 4-column layout)

## Objetivo

Rediseñar el Dashboard de Mission Control como un command center de 4 columnas con sidebar, terminal de actividad colapsable, Foundation interactivo, métricas adaptativas, próximos pasos inteligentes, y chat con sistema de threads.

Mockup aprobado: `brand/sanchocmo/presentations/dashboard-v2-mockup.html`

## Contexto

- Dashboard actual: monolítico, todo en una página con scroll, sin interactividad
- Referencia: Okara AI CMO (4 columnas, terminal, chat integrado)
- Feedback Alfonso: quiere claridad, separación visual, Foundation como onboarding, chat con threads por pilar/proyecto

## Arquitectura del Layout

```
┌──────────┬────────────────────────────────────────────────┐
│ SIDEBAR  │  ACTIVITY BAR (colapsable)                     │
│ (210px)  ├────────────┬──────────┬──────────┬─────────────┤
│          │ Foundation │ Métricas │ Próximos │ Chat        │
│ Brand    │            │          │ pasos    │             │
│ Selector │ Onboarding │ PageSpeed│ Ahora    │ Thread list │
│ Nav      │ Pilares    │ o APIs   │ Estrat.  │ /Thread     │
│ Status   │ clickables │ reales   │ Decisión │ activo      │
└──────────┴────────────┴──────────┴──────────┴─────────────┘
```

## Design System

- **Font**: Inter (UI) + JetBrains Mono (terminal/código)
- **Fondo**: #F8F8F6 (warm white), cards #FFFFFF
- **Accent**: #C45D35 (Sancho rust)
- **Estilo**: Clean SaaS moderno (Notion/Linear vibe), no Comic UI
- **Separación**: 1px borders entre columnas, headers fijos

## Fases de Implementación

### Fase 1: Layout + Sidebar + Activity (1 día)
- [ ] Nuevo layout grid: sidebar 210px + main area
- [ ] Sidebar: brand, selector cliente, nav links, status agentes
- [ ] Activity bar colapsable (reemplaza terminal): feed de eventos con timestamps
- [ ] localStorage: persist client + page + activity collapsed state
- [ ] Las 4 columnas con headers fijos + scroll bodies

### Fase 2: Foundation Interactivo (1 día)
- [ ] Onboarding box: input URL → trigger sancho-start
- [ ] Pilares clickables con estados: ⬜ pendiente / 🔄 en progreso / 🟡 esperando confirmación / ✅ confirmado / 🔒 cerrado
- [ ] Cada pilar → al click, abre thread en chat (o crea si no existe)
- [ ] Todos los pilares del foundation-state.json: skills, pillars, syntheses, presentations
- [ ] Secciones: Company Brief, Market & Us, Go-To-Market, Brand Identity, Strategic Plan
- [ ] Progress bar con conteo real
- [ ] Links: Documentos, APIs conectadas

### Fase 3: Métricas Dual (0.5 día)
- [ ] Estado 1 (sin metrics plan): PageSpeed Insights (API gratuita), Core Web Vitals, SEO Quick Audit, Uptime
- [ ] Estado 2 (con metrics plan): KPIs + fuentes reales (GA4, GSC, Meta Ads, GHL, Metricool)
- [ ] CTA "Conecta tus APIs" arriba (estado 1)
- [ ] Transición automática cuando pilar metrics-plan = completed
- [ ] API endpoint para PageSpeed Insights (server-side, cache 24h)

### Fase 4: Próximos Pasos (0.5 día)
- [ ] "⚡ Ahora": acciones urgentes con colores (rojo/verde/amarillo)
- [ ] "📋 Estrategias": del Strategic Plan, con progreso y siguiente paso
- [ ] "❓ Tu decisión": items que necesitan input del usuario
- [ ] Estado onboarding: si no hay Strategic Plan → "Completa Foundation" + ideas con disclaimer
- [ ] Cada item clickable → abre/crea thread en chat

### Fase 5: Chat con Threads (2-3 días)
- [ ] Backend: channel nativo MC (no Discord)
  - API: POST /api/chat/send, GET /api/chat/threads, GET /api/chat/thread/:id
  - Persistencia: JSON files en `brand/{slug}/chat/threads/`
  - Integración OpenClaw: nuevo channel type "webchat" → sessions
- [ ] Frontend: Thread list (historial) + Thread view (mensajes)
  - Toggle entre list/view
  - Thread header con back button + nombre + status badge
  - Thread list: icon estado, nombre, preview, tiempo
  - "+" Nuevo thread libre
  - Real-time: polling o WebSocket para mensajes nuevos
- [ ] Conexión pilares → threads:
  - Click pilar Foundation → abre/crea thread con ese nombre
  - Click proyecto → abre/crea thread
  - Click acción "Ahora" → abre/crea thread
  - Thread guarda referencia al pilar/proyecto que lo creó
- [ ] Sancho recibe contexto: al abrir thread de pilar, Sancho sabe qué skill ejecutar

### Fase 6: Polish + Testing (0.5 día)
- [ ] Responsive: colapsar a 2 columnas en tablets, 1 en mobile
- [ ] Dark mode (toggle en sidebar)
- [ ] Keyboard shortcuts
- [ ] Test con datos reales de todos los clientes
- [ ] Portal mode: filtrar correctamente para clientes

## Mapping Pilar → Skill

| Pilar | Skill |
|-------|-------|
| Company Context | company-context |
| Business Model | business-model-audit |
| Budget | budget-constraints |
| Market Analysis | market-intelligence + deep-research |
| Competitors | competitor-intelligence |
| Self Analysis | self-intelligence |
| SWOT | auto-synthesis |
| Niche Discovery | niche-discovery / ecp-validation |
| Existing Customer Data | (manual input) |
| Positioning | positioning-messaging |
| Pricing | pricing-strategy |
| ECP Validation | ecp-validation |
| Metrics Plan | acquisition-metrics-plan |
| Brand Voice | brand-voice |
| Visual Identity | visual-identity / canvas-design |
| Strategic Plan | channel-prioritization |

## Archivos Afectados

| Archivo | Cambio |
|---------|--------|
| mission-control.html | Rewrite completo del dashboard page |
| scripts/mc-server.js | Nuevos endpoints: /api/chat/*, /api/pagespeed |
| mc-data.js / regenerate.py | Incluir thread data, activity feed |
| brand/{slug}/chat/ | Nuevo directorio para threads |
| scripts/collect-pagespeed.js | Nuevo: recopilar PageSpeed data |

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Chat backend complejo | Fase 5 es la más larga; empezar simple (polling, JSON files) |
| PageSpeed API rate limits | Cache 24h server-side |
| mission-control.html ya es 4000+ líneas | Considerar split en módulos JS separados |
| Portal mode compatibility | Testear cada fase con portal tokens |

## Estimación

| Fase | Tiempo |
|------|--------|
| 1. Layout | 1 día |
| 2. Foundation | 1 día |
| 3. Métricas | 0.5 día |
| 4. Próximos pasos | 0.5 día |
| 5. Chat | 2-3 días |
| 6. Polish | 0.5 día |
| **Total** | **~6 días** |

## Notas

- El dashboard actual sigue funcional durante la implementación (no breaking change hasta merge)
- El chat es el componente más complejo — puede implementarse como MVP (sin real-time) primero
- Cada fase es deployable independientemente
