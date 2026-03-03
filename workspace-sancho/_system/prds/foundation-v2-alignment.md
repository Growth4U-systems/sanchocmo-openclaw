# Foundation v2.0 — Alineación Completa

> Documento de referencia para verificar consistencia entre Foundation Threads, Orchestrator, Pillar Registry y Foundation Protocol.

---

## 1. Resumen Ejecutivo

| Componente | Estado |
|-----------|--------|
| foundation-threads | ✅ 8 hilos |
| foundation-orchestrator | ✅ 6 layers DAG |
| pillar-registry | ✅ Mapa de dependencias |
| foundation-protocol | ✅ 4 secciones output |

**Conclusión:** Todo alineado. No hay inconsistencias.

---

## 2. Foundation Threads (8 hilos)

| # | Hilo | Skill(s) | Output Path |
|---|------|----------|-------------|
| 01 | 📋 Company Brief | company-context → business-model → budget | `company-brief/current.md` (3 secciones) |
| 02 | 📊 Market Analysis | market-intelligence | `market-and-us/market-analysis.md` |
| 03 | ⚔️ Competitor Analysis | competitor-intelligence | `market-and-us/competitor-{slug}.md` |
| 04 | 🔍 Self Analysis | self-intelligence | `market-and-us/self-analysis.md` |
| 05 | 🔄 SWOT & Síntesis | swot-analysis + orchestrator | `market-and-us/swot.md` + summary + ope-canvas |
| 06 | 👥 Niche Discovery | niche-discovery-100x | `go-to-market/ecps.md` |
| 07 | 💬 Positioning & Pricing | positioning-messaging + pricing-strategy | `go-to-market/positioning-{ecp}.md` + pricing.md |
| 08 | 🎨 Brand Identity | brand-voice + visual-identity | `brand-identity/voice-profile.md` + visual-identity.md |

**Notas:**
- Company Brief usa 1 hilo para 3 skills (flujo continuo, 1 aprobación)
- SWOT & Síntesis comparte hilo
- Positioning & Pricing comparten hilo
- Brand Identity comparte hilo (voice → visual secuencial)

---

## 3. Foundation Orchestrator (DAG de 6 Layers)

```
L0 INTAKE:     company-brief (3 skills → 1 aprobación)
L1 RESEARCH:   market-analysis + competitor-analysis + self-analysis
L2 SYNTHESIS:  swot + summary* + ope-canvas*    (* = inline por orchestrator)
L3 DISCOVERY:  niche-discovery + existing-customer-data?
L4 ACTIVATION: positioning + pricing + ecp-validation? + messaging-summary*
L5 BRAND:      brand-voice + visual-identity
```

### Gate Check

- **requires**: BLOQUEA si el prerequisito no está `approved`
- **enriches_with**: Si está approved, carga como contexto extra. Si no, funciona sin ello (silencioso).

---

## 4. Pillar Registry (Mapa de Dependencias)

| Pillar | Skill | Output | requires | enriches_with |
|--------|-------|--------|----------|---------------|
| company-brief | company-context, business-model, budget | company-brief/current.md | - | - |
| market-analysis | market-intelligence | market-and-us/market-analysis.md | company-brief | competitor-analysis, self-analysis |
| competitor-analysis | competitor-intelligence | market-and-us/competitor-*.md | company-brief | market-analysis, self-analysis |
| self-analysis | self-intelligence | market-and-us/self-analysis.md | company-brief | market-analysis, competitor-analysis |
| swot | swot-analysis | market-and-us/swot.md | market+competitor+self | - |
| niche-discovery | niche-discovery-100x | go-to-market/ecps.md | swot | existing-customer-data |
| positioning | positioning-messaging | go-to-market/positioning-*.md | niche-discovery | - |
| pricing | pricing-strategy | go-to-market/pricing.md | niche-discovery | positioning |
| brand-voice | brand-voice | brand-identity/voice-profile.md | positioning | - |
| visual-identity | visual-identity | brand-identity/visual-identity.md | brand-voice | - |

---

## 5. Foundation Protocol (4 Secciones de Output)

```
brand/{slug}/
├── company-brief/
│   └── current.md        ← Doc único: Identity + Business Model + Budget
├── market-and-us/
│   ├── market-analysis.md      ← TAM, segmentos, tendencias, regulación
│   ├── competitor-{nombre}.md  ← Battle card por competidor
│   ├── self-analysis.md        ← 3 lentes de autopercepción
│   ├── swot.md                 ← SWOT + TOWS
│   ├── summary.md              ← Síntesis: mercado + competidores + nosotros
│   ├── ope-canvas.md           ← One-Page Endgame
│   └── sources/                ← Datos raw de scrapers
├── go-to-market/
│   ├── ecps.md                 ← Perfiles ECP con JTBD
│   ├── positioning-{ecp}.md   ← Messaging playbook por ECP
│   ├── pricing.md              ← Framework de pricing + hooks
│   └── messaging-summary.md    ← Síntesis GTM
├── brand-identity/
│   ├── voice-profile.md         ← Brand voice
│   └── visual-identity.md       ← Sistema visual
└── operational/
    ├── budget.md               ← Presupuesto detallado
    ├── assets.md
    ├── learnings.md
    └── stack.md
```

---

## 6. Verificación Cruzada

| Item | Threads | Orchestrator | Registry | Protocol |
|------|---------|--------------|----------|----------|
| 8 hilos | ✅ | ✅ | ✅ | ✅ |
| 4 secciones output | ✅ | ✅ | ✅ | ✅ |
| 6 layers DAG | ✅ | ✅ | ✅ | ✅ |
| requires/enriches_with | - | ✅ | ✅ | ✅ |
| Company Brief = 1 aprobación | ✅ | ✅ | ✅ | ✅ |
| Síntesis inline (L2, L4) | ✅ | ✅ | ✅ | ✅ |
| Paths matching | ✅ | ✅ | ✅ | ✅ |

---

## 7. Reglas Clave

1. **Gate check SIEMPRE** antes de cada pilar
2. **Resumen ejecutivo** — nunca el doc entero (5-10 bullets)
3. **Flujo automático** — al aprobar, siguiente arranca solo
4. **Company Brief = 1 aprobación** para las 3 skills internas
5. **Estado siempre actualizado** — foundation-state.json tras cada transición
6. **enriches_with es silencioso** — si no está disponible, funcionar sin avisar
7. **Retry automático** — 3 intentos con model fallback (Opus → MiniMax)

---

*Documento generado: 2026-03-03*
*Versión: v2.0*
