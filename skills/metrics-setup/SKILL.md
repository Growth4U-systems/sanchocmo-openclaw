---
name: metrics-setup
description: "Diseña plan de métricas, conecta herramientas de analytics/ads/CRM, y genera el dashboard. Flujo: clasificar negocio → definir KPIs → elegir integraciones → conectar vía MC UI → generar metrics-plan.json → dashboard listo. Absorbe: acquisition-metrics-plan + connect-api + generate-plan. Soporta 6 arquetipos (SaaS, Fintech, Marketplace, E-commerce, Lead-to-Sale + sub-variantes). 12+ integraciones (GA4, GSC, Meta Ads, Google Ads, HubSpot, GHL, Metricool, Instantly, etc.)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Foundation
  pillar: metrics-setup
  layer: 'Execute'
  depends_on: company-brief, positioning, pricing
  updated: '2026-03-27'
  changes: v1.0 — Merge de acquisition-metrics-plan + connect-api + generate-plan.
context_required:
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/go-to-market/positioning/positioning.current.md
- brand/{slug}/go-to-market/pricing/pricing.current.md
context_writes:
- brand/{slug}/go-to-market/metrics-plan/metrics-plan.current.md
- brand/{slug}/metrics-plan.json
- brand/{slug}/integrations.json
---

# Metrics Setup — Plan, Conectar, Dashboard

> Define qué medir, conecta las herramientas, genera el dashboard. Todo en una sesión.

**Input**: Company Brief + Positioning + Pricing (para determinar arquetipo y funnel)
**Output**: metrics-plan.md + metrics-plan.json + integraciones conectadas
**Thread**: `{slug}:metrics-setup`

---

## Principio Core

**El evento de activación NUNCA es el signup.** Es el momento donde el usuario ve valor real. Todos los cohortes empiezan ahí.

---

## Flujo de Ejecución (7 pasos)

### Step 1: Clasificar el Negocio (~2 min)

Leer `company-brief/company-brief.current.md`. Inferir arquetipo:

| Arquetipo | Evento de Activación | KPI Primario | Value Metric |
|-----------|---------------------|--------------|--------------|
| SaaS/App | Core Feature Used | Core Feature Used | MRR per User |
| Fintech | First Transaction | First Transaction | Amount Deposited |
| Marketplace | First Transaction | First Transaction | GMV |
| E-commerce/D2C | First Purchase | Purchases | AOV |
| Lead-to-Sale | Qualified Meeting | Qualified Meetings | Deal Size |

**Sub-variantes de Lead-to-Sale:**
- Local Services: First Visit/Consultation
- Enterprise/SaaS Enterprise: Demo Completed
- B2B Services: First Meeting

Presentar clasificación al usuario para confirmar.

### Step 2: Definir Evento de Activación (~1 min)

Confirmar el activation event con el usuario. Si no encaja en ningún arquetipo estándar, definir custom.

### Step 3: Construir Jerarquía de Métricas (~3 min)

| Nivel | Qué mide | Frecuencia |
|-------|----------|------------|
| L1: Primary KPI | Activation event count | Diario |
| L2: Quality KPIs | Activation Rate, CAC, value metric | Semanal |
| L3: Funnel Steps | Cada paso del funnel (diagnóstico) | Semanal |
| L4: Sostenibilidad | LTV/CAC, ROAS, Payback, Cohort Retention | Mensual/Trimestral |

Presentar la jerarquía al usuario.

### Step 4: Mapear Fuentes de Datos (~3 min)

Para cada métrica, identificar:
- **Dónde vive el dato** (GA4, CRM, Ads, Manual)
- **Cómo se recoge** (API automática vs manual en Sheets)
- **Frecuencia** de actualización

### Step 5: Seleccionar Herramientas a Integrar (~5 min)

Presentar opciones priorizadas:

```
📊 INTEGRACIONES RECOMENDADAS

🔴 Críticas (sin esto no hay métricas):
  • Web Analytics → GA4 (tráfico, conversiones web)
  • [CRM/Pipeline] → [HubSpot|GHL|Pipedrive] (leads, deals)

🟡 Importantes (mejoran mucho el dashboard):
  • Paid Ads → Meta Ads / Google Ads (spend, CTR, CPL)
  • SEO → Google Search Console (impressions, position)

🟢 Nice to have (datos complementarios):
  • Social → Metricool (engagement, impressions)
  • Outbound → Instantly / Lemlist (emails, reply rate)
  • Revenue → Stripe (MRR, churn)

¿Cuáles quieres conectar?
```

El usuario elige. No forzar — es su decisión qué conectar.

### Step 6: Conectar Integraciones (~5-15 min)

Para CADA herramienta seleccionada:

1. **Generar link de conexión en MC** (usar el formato de URL de `workspace-sancho/PROTOCOLS.md` Rule 3 / `TOOLS.md` — el host ya está pre-resuelto ahí):
   ```
   👉 <MC_BASE>/admin/{adminToken}/connect/{slug}/{apiId}   ← guild interno
   👉 <MC_BASE>/portal/{mcToken}/connect/{apiId}            ← guild de cliente
   Ahí tienes las instrucciones y el formulario para conectarlo.
   ```
   (Sustituye `<MC_BASE>` por el host pre-resuelto que aparece en PROTOCOLS.md/TOOLS.md.)

2. **NUNCA pedir credenciales en el chat** — toda la gestión de secretos va por MC UI

3. **Google APIs (GA4, GSC, Google Ads)**: usan Service Account compartido
   - El usuario solo necesita dar acceso de Viewer al email del SA
   - Config: Property ID (GA4), Site URL (GSC), Customer ID (Google Ads)

4. Esperar confirmación del usuario de que conectó cada herramienta

5. **Verificar conexión**: `node scripts/test-connection.js --slug {slug} --source {sourceId}`

**Mapeo de nombres a API IDs:**
- google analytics, ga4 → `ga4`
- search console, gsc → `gsc`
- meta ads, facebook ads → `meta_ads`
- google ads → `google_ads`
- hubspot → `hubspot`
- gohighlevel, ghl → `ghl`
- pipedrive → `pipedrive`
- metricool → `metricool`
- instantly → `instantly`
- lemlist → `lemlist`
- stripe → `stripe`
- shopify → `shopify`

### Step 7: Generar Dashboard (~1 min)

Ejecutar:
```bash
node skills/acquisition-metrics-plan/scripts/generate-plan.js \
  --slug "{slug}" \
  --archetype "{archetype}" \
  [--sub-variant "{variant}"]
```

Esto genera `brand/{slug}/metrics-plan.json` con:
- Arquetipo y activation event
- Funnel steps con source mappings (automático vs manual)
- KPIs con fórmulas
- Integration modules (lo que se conectó)
- Missing integrations (lo que falta)
- Channels

Mission Control lee este JSON para renderizar el dashboard de métricas.

### Step 7.5: Crear Google Sheet de Métricas (~2 min)

Crear una Google Sheet para input manual de métricas que no vienen de APIs (funnel steps sin integración conectada).

**Flujo:**

1. **Crear la Sheet** vía `gog`:
   ```bash
   gog sheets create "Métricas — {ClientName}" --sheets "Summary,GA4,GSC,Meta-ads,GHL" --json
   ```
   Del output JSON, extraer `spreadsheetId` y construir la URL: `https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit`

2. **Compartir con el Service Account** (para que el collector pueda leerla):
   ```bash
   gog drive share "{spreadsheetId}" --email "sancho-analytics@gen-lang-client-0422972889.iam.gserviceaccount.com" --role reader
   ```

3. **Escribir la plantilla de input manual** en la pestaña `Summary`:
   - Primera columna: `semana_del` (fechas de lunes, cadencia semanal)
   - Resto de columnas: los campos del funnel que son manuales (depende del cliente)
   - Ejemplo Fintech: `signups, kyc_completed, first_deposit, amount_deposited_eur, earn_activated, second_deposit, app_downloads, ad_spend_eur, notes`
   - Pre-rellenar 12 semanas de filas vacías con fechas de lunes

4. **Guardar en integrations.json** — añadir dos cosas:
   ```json
   "metricsSheet": {
     "spreadsheetId": "{spreadsheetId}",
     "url": "https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit"
   }
   ```
   Y en `dataSources`:
   ```json
   "sheets": {
     "provider": "sheets",
     "status": "connected",
     "config": {
       "spreadsheetId": "{spreadsheetId}",
       "range": "Summary!A:Z"
     }
   }
   ```

5. **Compartir el link** con el usuario:
   > 📊 Tu Google Sheet de métricas: {url}
   > Rellena los datos manuales cada lunes. Pulsa "Sincronizar" en MC para importarlos.

**Nombres de pestañas** según las APIs conectadas. Solo crear las que tengan datos:
- `Summary` — siempre (input manual + resumen)
- `GA4` — si GA4 conectado
- `GSC` — si GSC conectado
- `Meta-ads` — si Meta Ads conectado
- `GHL` — si GHL conectado
- etc.

**IMPORTANTE:**
- La Sheet es para INPUT (datos manuales del cliente), no para exportar datos automáticos
- El link aparece en MC automáticamente cuando `metricsSheet` existe en `integrations.json`
- Compartir siempre con el SA para que el adapter `sheets.js` del collector pueda leerla

### Step 8: Definir Benchmarks y Cadencia (~2 min)

**Benchmarks por defecto según arquetipo:**
- SaaS: Activation Rate 15-30%, CAC Payback 6-12 meses, LTV/CAC >3x
- Fintech: Activation Rate 20-25%, CAC Payback 3-6 meses, LTV/CAC >4x
- E-commerce: Activation Rate 2-5%, CAC Payback inmediato-3m, LTV/CAC >3x
- Lead-to-Sale: Activation Rate 10-25%, CAC Payback 1-6 meses, LTV/CAC >3x

**Cadencia de review:**
- **Semanal**: KPI primario total y por canal, activation rate
- **Mensual**: CAC por activación, ARPU, tasas de conversión del funnel
- **Trimestral**: Cohort analysis, LTV/CAC, payback period, recalibrar benchmarks

### Step 9: Crear tareas de conexión en P00-Metrics (~1 min)

Tras generar el Metrics Plan y el dashboard, crear tareas individuales en el proyecto P00-Metrics para cada conexión necesaria.

**Flujo:**
1. Leer `brand/{slug}/integrations.json` para ver qué APIs ya están conectadas
2. Leer `skills/acquisition-metrics-plan/schemas/api-catalog.json` para info del catálogo
3. Del Metrics Plan generado, identificar las conexiones necesarias para este cliente
4. Leer `brand/{slug}/projects/P00-Metrics/tasks.json`
5. Por cada conexión necesaria, añadir tarea:

```json
{
  "id": "P00-MET-T{XX}",
  "name": "Conectar {nombre_api}",
  "description": "Enlace de conexión: <MC_BASE>/admin/{adminToken}/connect/{slug}/{apiId}\n\n{instrucciones según caso}",
  "type": "execution",
  "skill": "metrics-setup",
  "channel": "intelligence",
  "owner": "{según ownership}",
  "status": "{completed si ya conectada, todo si no}",
  "depends_on": "P00-MET-T01"
}
```

**IMPORTANTE:** Toda tarea de tipo "Conectar X" DEBE incluir el enlace de conexión MC como primera línea del campo `description`. Formato: `<MC_BASE>/admin/{adminToken}/connect/{slug}/{apiId}` (guild interno) o `<MC_BASE>/portal/{mcToken}/connect/{apiId}` (guild cliente). `<MC_BASE>` = host pre-resuelto en `workspace-sancho/PROTOCOLS.md` / `TOOLS.md` (NUNCA inventes uno distinto). Usa el mapeo de nombres a API IDs del Step 6 para obtener el `{apiId}` correcto.

**Reglas según ownership y estado:**
- API ya conectada (`status: "connected"` en integrations.json) → crear tarea con `status: "completed"`, nota "Ya conectada"
- API no conectada + `ownership: "system"` → `status: "todo"`, `owner: "Sancho"` — Escudero la puede conectar directamente
- API no conectada + `ownership: "client"` → `status: "todo"`, `owner: "Equipo"`, descripción: "Enlace de conexión: <MC_BASE>/admin/{adminToken}/connect/{slug}/{apiId}\n\nContactar al equipo de {cliente} para obtener credenciales de {api}. Mientras tanto, trackear vía Excel."

6. Añadir tarea final de verificación:
```json
{
  "id": "P00-MET-T{last}",
  "name": "Verificar dashboard y flujo de datos",
  "description": "Comprobar que todas las fuentes de datos fluyen al dashboard. Validar que las métricas se calculan correctamente.",
  "type": "execution",
  "skill": "metrics-collector",
  "channel": "intelligence",
  "owner": "Sancho",
  "status": "todo",
  "depends_on": "P00-MET-T{last-1}"
}
```

7. Escribir el tasks.json actualizado

---

## Output Files

### 1. Metrics Plan Document → `brand/{slug}/go-to-market/metrics-plan/metrics-plan.current.md`
- Business profile y arquetipo
- Activation event y justificación
- KPIs Level 1-4 con definiciones
- Channel tracking table
- Data sources (métrica, fuente, método, frecuencia)
- Benchmarks y decision criteria
- Review cadence

### 2. Machine-Readable Plan → `brand/{slug}/metrics-plan.json`
- Generado por `generate-plan.js`
- Leído por Mission Control para el dashboard

### 3. Integrations Config → `brand/{slug}/integrations.json`
- Actualizado con cada conexión exitosa
- Non-sensitive config (Property IDs, Site URLs, etc.)
- Secretos van en `brand/{slug}/.env`

---

## Self-QA

- [ ] Arquetipo correctamente clasificado y confirmado por usuario
- [ ] Activation event definido (no es "signup")
- [ ] KPIs Level 1-4 completos
- [ ] Al menos 1 integración crítica conectada
- [ ] metrics-plan.json generado y válido
- [ ] Dashboard de MC renderiza correctamente
- [ ] Benchmarks establecidos
- [ ] Review cadence definida
- [ ] Tareas de conexión creadas en P00-Metrics tasks.json
- [ ] APIs ya conectadas marcadas como completed
- [ ] APIs sin conectar (client) tienen instrucción de contactar equipo
- [ ] Tarea final de verificación de dashboard creada
- [ ] Cada tarea de conexión incluye enlace MC (`/mc/connect/{slug}/{apiId}`)
- [ ] Google Sheet creada y `metricsSheet.spreadsheetId` guardado en integrations.json
- [ ] Link de la Sheet compartido con el usuario

---

## Cross-Pillar Data Flow

```
INPUTS:
  company-brief    → clasificación del negocio, modelo, equipo
  positioning      → segmentos target (para channel tracking)
  pricing          → value metric, tiers

OUTPUTS alimentan:
  MC Dashboard     ← metrics-plan.json (renderizado automático)
  metrics-collector ← integrations.json + .env (pull de datos)
  strategic-plan   ← KPIs base para objetivos de proyectos
  daily-pulse      ← métricas para alertas diarias
```
