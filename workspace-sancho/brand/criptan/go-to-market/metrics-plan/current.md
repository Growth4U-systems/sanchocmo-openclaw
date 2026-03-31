# Metrics Plan — Criptan
<!-- source: metrics-setup | date: 2026-03-30 -->
<!-- Self-QA: PASS | 2026-03-30 -->

---

## 1. Business Profile

| Campo | Valor |
|-------|-------|
| **Arquetipo** | Fintech |
| **Modelo** | B2C principal + B2B secundario |
| **Growth Motion** | Product-Led + Content Marketing |
| **Activation Event** | **Primer Depósito** (registro → KYC → dinero real en plataforma) |
| **Value Metric** | Amount Deposited (€) |
| **NSM** | 5.000 nuevos usuarios con primer depósito en 3-6 meses |
| **CAC actual** | ~70€/primer depósito (creadores YouTube) |
| **Payback objetivo** | 2-3 meses |
| **Budget** | ~10.000€/mes |

### ¿Por qué Primer Depósito y no Signup?
El signup no genera valor. Un usuario registrado que no deposita es un coste sin retorno. El primer depósito es el momento donde el usuario compromete dinero real — a partir de ahí, Earn con rendimientos semanales actúa como retention loop natural.

---

## 2. Jerarquía de Métricas

### L1 — Primary KPI (diario)
| Métrica | Definición | Fuente | Frecuencia |
|---------|-----------|--------|------------|
| **First Deposits** | Nº de usuarios que hacen su primer depósito | CleverTap | Diario |

### L2 — Quality KPIs (semanal)
| Métrica | Definición | Fuente | Frecuencia |
|---------|-----------|--------|------------|
| **Activation Rate** | Registros → Primer Depósito (%) | CleverTap | Semanal |
| **CAC por Primer Depósito** | Spend / First Deposits (por canal) | Ads + CleverTap | Semanal |
| **Depósito Medio** | € medio del primer depósito | CleverTap | Semanal |
| **Time to Deposit** | Días desde registro hasta primer depósito | CleverTap | Semanal |

### L3 — Funnel Steps (semanal, diagnóstico)
| Paso | Métrica | Fuente | Método |
|------|---------|--------|--------|
| 1. Descubrimiento | Visitas web + Descargas app | GA4 + App Stores | Automático (GA4) / Manual (stores) |
| 2. Registro | Signups completados | CleverTap | Automático |
| 3. KYC | KYC completados | CleverTap | Automático |
| 4. **Primer Depósito** ⭐ | Depósitos nuevos | CleverTap | Automático |
| 5. Earn Activado | Usuarios que activan Earn | CleverTap | Automático |
| 6. Recurrencia | 2º depósito o reinversión | CleverTap | Automático |

**Tasas de conversión a monitorizar:**
- Visita → Registro
- Registro → KYC
- KYC → Primer Depósito (= Activation Rate)
- Primer Depósito → Earn
- Earn → Recurrencia (30d)

### L4 — Sostenibilidad (mensual/trimestral)
| Métrica | Definición | Benchmark Fintech | Fuente |
|---------|-----------|-------------------|--------|
| **LTV/CAC** | Lifetime Value / CAC | >4x | CleverTap + Finance |
| **Payback Period** | Meses hasta recuperar CAC | 3-6 meses | CleverTap + Finance |
| **Cohort Retention** | % activos a 30/60/90 días | — | CleverTap |
| **ARPU** | Revenue medio por usuario activo | — | Internal |
| **Churn Rate** | % usuarios que dejan de operar (90d) | — | CleverTap |

---

## 3. Tracking por Canal

| Canal | Grupo | Métrica principal | Fuente datos | Estado |
|-------|-------|-------------------|--------------|--------|
| Creadores YouTube | Affiliates | First Deposits + CAC | UTMs + CleverTap | 🟡 Activo (manual) |
| Pobre Millenial | Affiliates | First Deposits | UTM `pm` | 🟡 Activo |
| Inversor Nacional | Affiliates | First Deposits | UTM `in` | 🟡 Activo |
| Invertir para Conseguir | Affiliates | First Deposits | UTM `ipc` | 🟡 Activo |
| SEO / Orgánico | Organic | Traffic + Registros | GA4 + GSC | 🟡 GA4 ✅ / GSC 🔴 |
| Blog (análisis mercado) | Brand | Traffic + Time on site | GA4 | ✅ Conectado |
| Social (X, IG, LI, YT, TT) | Brand | Engagement + Referrals | Metricool (futuro) | ⚪ No conectado |
| Google Ads | Paid | Spend + CPL + CPA | Google Ads (futuro) | ⚪ No conectado |
| Meta Ads | Paid | Spend + CPL + CPA | Meta Ads (futuro) | ⚪ No conectado |
| Referidos | Referral | Invites + Conversions | CleverTap / Internal | 🟡 Activo (manual) |
| Podcast / PR | Awareness | Brand searches | GSC | 🔴 Pendiente conectar |
| Outreach B2B | Direct | Empresas contactadas + Activadas | Manual / CRM | ⚪ No activo |

---

## 4. Data Sources & Integraciones

### Confirmadas por el cliente
| Herramienta | Rol | Datos clave | Estado |
|-------------|-----|-------------|--------|
| **GA4** | Web Analytics | Tráfico, conversiones web, fuentes | ✅ Conectado (Property 387759614) |
| **Google Search Console** | SEO | Impresiones, clics, posiciones, keywords | ✅ Conectado (`sc-domain:criptan.com`) |
| **CleverTap** | CRM / CDP | Funnel in-app completo, cohortes, push, segmentos | 🔴 Pendiente conectar |

### Recomendadas (fase 2)
| Herramienta | Rol | Prioridad |
|-------------|-----|-----------|
| Google Ads | Paid search/display | 🟡 Alta (cuando se active paid) |
| Meta Ads | Paid social | 🟡 Alta (cuando se active paid) |
| Metricool | Social analytics | 🟢 Media |
| App Store Connect / Google Play Console | ASO + descargas | 🟢 Media |

### Fuentes manuales (interim)
| Dato | Método | Responsable | Frecuencia |
|------|--------|-------------|------------|
| Descargas app | Export manual App Store / Play Store | Iván Sevilla | Semanal |
| Spend creadores YouTube | Registro manual en sheet | Iván Sevilla | Mensual |
| Revenue / ARPU | Export finance | Equipo Criptan | Mensual |

---

## 5. Benchmarks & Decision Criteria

### Benchmarks Fintech
| Métrica | Target | Alerta si... |
|---------|--------|---------------|
| Activation Rate (Registro → Depósito) | 20-25% | < 15% |
| CAC por Primer Depósito | < 70€ (mejorar vs actual) | > 100€ |
| Payback Period | 2-3 meses | > 6 meses |
| LTV/CAC | > 4x | < 2.5x |
| Time to Deposit | < 7 días | > 14 días |

### Decision Framework
- **CAC por canal > 100€** → pausar/optimizar canal
- **Activation Rate < 15%** → investigar fricción en funnel (KYC, onboarding)
- **Payback > 6 meses** → revisar value metric o pricing
- **Cohort D30 retention < 40%** → activar campañas de re-engagement

---

## 6. Review Cadence

| Cadencia | Qué revisar | Quién |
|----------|------------|-------|
| **Diario** | First Deposits (count), anomalías | Sancho (auto) |
| **Semanal** | Activation Rate, CAC por canal, funnel conversion rates | Iván + Alfonso |
| **Mensual** | LTV/CAC, ARPU, cohort retention, channel ROI | Equipo completo |
| **Trimestral** | Recalibrar benchmarks, evaluar nuevos canales, payback analysis | Estratégico |

---

## 7. Siguiente Paso: Conexiones

Para activar el dashboard automático, hay que conectar las 3 herramientas confirmadas:

1. **GA4** → Property ID + acceso Service Account
2. **Google Search Console** → Site URL + acceso Service Account
3. **CleverTap** → Account ID + Passcode + Region

Las conexiones se gestionan vía Mission Control (links seguros, nunca credenciales por chat).
