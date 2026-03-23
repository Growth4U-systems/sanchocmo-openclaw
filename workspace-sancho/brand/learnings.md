# learnings.md - Weekly Insights & Patterns

> Síntesis semanal: 9-16 marzo 2026

---

## 🔄 Patterns Confirmed This Week (9-16 Mar)

### 1. Treatment-First Positioning Works for HC
- **Pattern**: 6 ECPs validados + equipo validó "mercado brutal" para nicho mujeres
- **Insight**: El posicionamiento treatment-first ocupa el cuadrante vacío vs competencia (cirugía)
- **Action**: Validar siempre quadrante vacío antes de confirmar ECPs

### 2. API System Self-Service = Escala Sin Fricción
- **Pattern**: 30+ APIs en MC, Growth4U GA4+GSC conectados sin pedir credenciales
- **Insight**: System Service Account + MC links eliminan la fricción de credenciales
- **Action**: Verificar APIs mínimas como gate antes de Phase 2

### 3. Morning Metrics CRON Necesitaaislamiento
- **Pattern**: Cron fixed de 3 mensajes-spam a 1 hilo estructurado
- **Insight**: session=isolated + Sonnet/Opus (no Minimax) para seguir threading patterns
- **Action**: CRONs siempre isolated, nunca main session

### 4. Kanban + Projects UI > Discord Threads Separados
- **Pattern**: UI con drag-drop, Discord channel mapping, mobile dropdowns
- **Insight**: Interfaz centralizada es más usable que threads dispersos
- **Action**: Build task threads en Discord SOLO para alta visibilidad/urgencia

### 5. Connect-API Skill Reduce Paso
- **Pattern**: "conecta facebook ads" → link directo MC sin pasos
- **Insight**: Lenguaje natural + mapping automático = adopción
- **Action**: Extender skill para más APIs y sinónimos

---

### Patterns Previos (sigue vigente)

- Onboarding Mega-Sessions Work (Paymatico 9h)
- Methodology Iteration Cycles Shortening (Alfonso edits skills directly)
- Deliverables Need Anchor Linking
- Visual Identity Before Positioning?
- Presentation Templates = High-Value Add

---

## 📉 What Changed (9-16 Mar)

| Area | Before | After |
|------|--------|-------|
| HC Positioning | Cirugía como core | Treatment-first (vacío de mercado) |
| Quiz Pricing | ¿Multi-price? | €25/€50/€100/€195 en 3 flujos paralelos |
| API Connection | Credenciales por chat | Self-service MC con System SA |
| Metrics Delivery | Canal directo | Hilo estructurado (summary → thread → datos) |
| Project Mgmt | JSON manual | UI Kanban + Projects en MC |
| Ley SARA | No mentioned | CRT/HRT (no PRP/dutasteride) |

---

## 🎯 What to Do Different (from this week)

1. **Proponer "snapshot VI"** aunque positioning incompleto
2. **Verificar APIs mínimas** como gate antes de Phase 2
3. **CRON modelo**: siempre isolated + Sonnet/Opus (no Minimax)
4. **Anclar links** en todos los deliverables
5. **Skill evolution**: documentar cambios en learnings.md no solo commits

---

## 🔧 Operational Issues (Noted)

- Google Workspace: STILL DOWN since Feb 27
- GHL adapter: 422 error (API v2 format)
- Ley SARA: pendiente crear `_references/ley-sara.md`
- HC pending: `competitors/current.md`, `self/current.md` v1.1, `pricing/current.md`

## 🔄 Patterns Confirmed This Week (16-22 Mar)

### 1. API Crisis Monitoring Required
- **Pattern**: Claude API access turn-off email (Mar 18) triggered urgent review
- **Insight**: System needs proactive monitoring for API access/credits
- **Action**: Add API status check to daily heartbeat or create monitoring cron

### 2. Security Alerts Don't Stop Operations
- **Pattern**: Supabase security vulnerability detected (Mar 17), but system continued
- **Insight**: Alerts appear but don't automatically halt operations
- **Action**: Review Supabase alerts during weekly synthesis, escalate if critical

### 3. Weekend Quiet Hours Effective
- **Pattern**: Sat/Sun consistently show low activity (3-5 unread emails, no meetings)
- **Insight**: Weekend pattern is predictable - use for maintenance/updates
- **Action**: Schedule system updates for weekends when possible

### 4. Client Demos Continue
- **Pattern**: Demo with Guido Lonetti (Mar 17), various client syncs
- **Insight**: Demo pipeline active - track conversion
- **Action**: Log demos in client activity, track follow-up

### 5. Multiple Weekly Cycles Converging
- **Pattern**: G4U Weekly, Weekly sistemas, Weekly Fellow<>G4U, Weekly Projects Philippe
- **Insight**: Internal cadence stabilizing - 4-5 recurring weekly meetings
- **Action**: Document weekly cadence in memory for pattern recognition

---

*Last updated: 2026-03-23*
