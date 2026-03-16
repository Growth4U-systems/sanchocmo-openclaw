# MEMORY.md - Sancho Long-Term Memory

## Sistema
- Gateway running (LaunchAgent), Tailscale serve (`https://sancho-cmo.taild48df2.ts.net`), Discord bot SanchoCMO
- Google Workspace (alfonso@growth4u.io), Notion API, Supabase (psapmujzxhaxraphddlv)
- **Cost alerts** → publicar en hilo "Costes APIs" (thread `1481910083255406694`) dentro de #infra. NO crear mensajes sueltos en #infra.
- **Plan Anthropic**: Claude Max $200/mes (20x). Coste fijo, NO por API. Los $ que trackea cost-tracker.py son teóricos. Alertar solo por anomalías de volumen (>2x promedio diario), no por umbral de $.
- 4 agentes (Cervantes/Sancho/Rocinante/Escudero), 38 skills

## Personas
- **Alfonso** — Madrid, técnico + marketing. Directo, prefiere acción sobre explicación.

## Clientes Activos

### Hospital Capilar
- Foundation: VACÍA — reset 2026-03-02 (DAG no seguido, GTM prematuro)
- Backup: `_backups/2026-03-02/hospital-capilar-backup/`
- Próximo paso: Foundation desde cero siguiendo DAG
- **Avances Post-Reset (Mar 8-14)**:
  - Presentación Mercado+Competidores (~40 slides): Pricing, SEO/ROI, GAPs críticos, 4 paciente personas, mapas posicionamiento, battle cards, Q&A. Preparada para sesión 2h con equipo.
  - **6 ECPs validados con equipo HC** (Mar 10 meeting):
    1. 🪞 El Espejo (hombres jóvenes 20-28, alopecia temprana) — ALTA
    2. 💊 La Farmacia Sin Salida (OTC frustrados 1-3 años) — ALTA
    3. ❓ ¿Qué Me Pasa? (undiagnosed, ~150K SAM) — ALTA
    4. 💸 La Inversión Que Se Deshace (post-cirugía sin mantenimiento) — MEDIA
    5. 🏪 El Negocio, No El Paciente (insatisfechos con competidores) — MEDIA
    6. 👩 Es Normal, Ya Pasará (mujeres hormonales) — ESTRATÉGICO ("mercado brutal, fácil captación" — quote equipo HC)
  - **Quiz arquitectura**: Diseño completado. Casos que obligan analítica: mujeres con temas hormonales, alopecias raras (areata, frontal fibrosante), efluvios telógenos.
  - **Pricing test**: €25/€50/€100/€195 en paralelo (múltiples flows)
  - **Target lanzamiento**: 24/03/2026
  - **Key insight**: Treatment-first positioning = cuadrante vacío (competidores 100% cirugía)
  - **Ley SARA**: Protocolos CRT/HRT (no PRP/dutasteride)
  - **Pendiente post-lanzamiento**: competitors/current.md, self/current.md v1.1, pricing/current.md

### Paymático (desde 2026-03-04)
- **Contacto**: Alex G (Discord ID 1478058457419616349)
- **Empresa**: Entidad de pago regulada BdE #6861 (2013)
- **Slug**: paymatico | **Guild**: 1477995837719056458
- **Foundation**: Layers 0-3 completas. Layer 4 (Positioning + Pricing) pending.
- **ECPs v1**: (1) Franquicias multi-ubicación, (2) Corporates cash pooling, (3) Gestores fiduciarios
- **ECPs v4 EXPANDED (Mar 4)**: 24 sub-nichos scoring, top 3: Gasolineras independientes (88.6), Redes talleres (88.0), Fast Food (87.0)
- **Alex G insider inputs incorporated**: Stack propietario full stack (no 3rd party dependency), pagos asegurados (orquestación), onboarding 3 días (vs Paycomet 2 meses), licencia como escudo regulatorio
- **Alex G preferences**: Profundidad alta, solo negocios offline (no marketplaces/SaaS), incorporar su insider knowledge, sub-nichos granulares

### SanchoCMO (Self-Marketing)
- **Foundation COMPLETA** (2026-03-08). All 6 layers done.
- Visual Identity: "Sancho Futurista Light" — SaaS moderno (Notion/Linear/Vercel) con personaje Sancho rechoncho + burrito tech. Comic book descartado por sensación "antiguo" vs producto IA.
- Paleta: blanco + charcoal (#1A1A2E) + rust accent (#C45D35) + steel blue (#2C5F7C). Tipografía: Inter/Geist.
- Pendiente: ilustrador profesional para personaje (brief en doc, ~€800 Dribbble), dark mode Phase 2.
- **Siguiente: Phase 2 Ejecución** — Landing page rediseño → Contenido orgánico → Outreach directo. Plan a presentar 2026-03-09.
- Contacto: Martin (martinfpm, Discord 1402171221747040369)

### Growth4U
- **Competitors pillar COMPLETE (Mar 2-3)**: Snowball, Product Hackers (strongest), TheGrowtHacker (weakest - 0 SEO, ex-employee case studies only)
- **Kleva partnership**: Meeting Tue 10 Mar 2026 17:30 (rescheduled from Thu 5 Mar)
- **Foundation Layers 0-3 complete. Layer 4 (Positioning + Pricing) pending.**
- **Visual Identity Snapshot v1 drafted** (Quick mode, pre-positioning). Concept: "Growth Lab", Alfonso as face of brand. Ref: hsu.es. Photos: alfonso-headshot-studio.jpg, alfonso-office-teal.jpg (BEST). Pending approval.
- **Niche Discovery COMPLETE (Mar 5)**: 120 problems → 96 filtered → 5 ECPs (by NEED, not persona):
  1. "Necesita sistema de growth repetible" (8.95) ⭐ MEDIO
  2. "Crecer cumpliendo regulación" (8.40) 🏆 ALTO
  3. "Canal principal muriendo" (8.15) ⭐ MEDIO
  4. "Quemado por agencias" (7.70) ⭐ MEDIO
  5. "Invisible para el comprador" (7.35) ⭐ MEDIO
- **Wave 1**: ECP 1+2 | **Wave 2**: ECP 3+4 (when own cases exist)
- **niche-discovery-100x skill v4.0 (Mar 5)**: Cluster por NECESIDAD (no persona), Solution Filter (no ICP Filter), Reachability = Trust Map → Search Map → Channel Map. Scoring: Pain×0.35 + Reachability×0.40 + SAM×0.25. Output: problems.md + ecps.md. Founder Moat = badge qualifier (🏆/⭐/—).
- **Positioning skill v5.0 (Mar 6)**: Mandatory anchor linking (#N → shared doc), Assets/Value Criteria global (no per-ECP), bidirectional links required.
- **Reachability Discovery findings**: José Carlos Cortizo, Samuel Gil (29K), David Bonilla (17.8K), Product Hackers Go! Slack (1.3K), growclub (Skool), newsletters + podcasts list
- **Tailscale Funnel** enabled for /mc → public access at https://sancho-cmo.taild48df2.ts.net/mc/
- **APIs conectades**: GA4 ✅, GSC ✅ (via MC)
- **Morning Metrics**: Cron configurado 08:30 weekdays, test funcionando (GA4, Meta Ads)

## Skills
- **niche-discovery-100x v4.0 (2026-03-05)**: Rewrite completo. Cluster por NECESIDAD no persona. Solution Filter (no ICP Filter). Reachability = Trust Map → Search Map → Channel Map (con NOMBRES: influencers, comunidades, newsletters, podcasts, eventos). Scoring: Pain×0.35 + Reachability×0.40 + SAM×0.25. Output: problems.md + ecps.md. Founder Moat = badge qualifier (🏆/⭐/—). Sin límite rígido de ECPs.
- **frontend-slides templates (2026-03-08)**: Sistema de templates aprobado por Alfonso. Tipos: Foundation Report (40 slides) y Market Strategy (25 slides). Layouts: Cover, Index/TOC, Section Divider, Gap Analysis Table, Competitor Landscape, Competitor Deep-Dive (2-col S/W + KPIs/Ratings/Reviews), SWOT+TOWS (single slide), OPE Canvas. Preferencias Alfonso: NO whitespace excesivo, texto denso, bullets con spacing, logos reales (Google Favicon Service), brand colors, links funcionales.
- **connect-api skill (2026-03-12)**: Firing keywords "conecta/conectar/integrar/vincular" + API name. Mapea nombres coloquiales a IDs del catálogo. Solo responde con link MC. No acepta credenciales por chat.
- **metrics-collector skill (2026-03-14)**: 7 adaptadores (GA4, GSC, Metricool, Meta Ads, GHL, Instantly, Sheets). Recoge métricas y sincroniza a Google Sheets. Growth4U: GA4 y Meta Ads funcionando, GHL con problemas API v2.

## MC Projects (2026-03-14)
- Kanban + Project list views en `/projects` route
- Drag & drop desktop, dropdowns mobile
- Owner convention: "Sancho" default, "Equipo" solo cuando necesita humano
- Cada task muestra su Discord channel
- Edit modal para tasks y projects
- Sincronización Discord threads pendiente

## Bugs Pendientes
- Scripts Python niche-discovery-100x: SIGTERM silencioso. Workaround: usar web_search en vez de scripts.

## Learnings Clave
- Foundation ANTES de GTM — sin atajos
- DAG de pillars: Layer 0→1→2→3→4→5, gate check SIEMPRE
- Self-QA obligatorio, Rocinante opcional
