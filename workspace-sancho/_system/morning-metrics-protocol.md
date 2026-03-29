# Morning Metrics Protocol

> Informe diario automático de métricas por cliente. Se publica en #intelligence del guild del cliente.

## Trigger
- Cron diario 08:30 Europe/Madrid
- Ejecutado como agentTurn aislado → Sancho pull + format + post

## Por Cliente

### Growth4U (guild: 1477741643762241548)

**Canal #insights**: `1477741644789842031`

**APIs disponibles:**

#### Meta Ads
- Token: `source scripts/.meta-ads-env` → `$META_ADS_TOKEN`
- Ad Account: `act_1507778460268244`
- Endpoint: `https://graph.facebook.com/v21.0/act_1507778460268244/insights`
- Métricas: spend, impressions, clicks, ctr, cpc, reach, actions (lead, link_click, video_view)
- Comparativa: yesterday vs media 7d

#### GHL (GoHighLevel)
- Token: `.env` → `$GHL_API_KEY` (pit-token)
- Location: `$GHL_LOCATION_ID` = `BnXWP5dcLVMgUudLv10O`
- Base URL: `https://services.leadconnectorhq.com`
- Contacts: `GET /contacts/?locationId={loc}&limit=20&startAfter=...` (filtrar por dateAdded últimas 24h)
- Calendars: `GET /calendars/?locationId={loc}` → calendarId → `GET /calendars/events?calendarId={id}&startTime=...&endTime=...`
- Headers: `Authorization: Bearer $GHL_API_KEY`, `Version: 2021-07-28` (contacts) / `2021-04-15` (calendars)

---

## Formato del Informe

```
📊 Morning Metrics — {Cliente} | {fecha}

━━━ META ADS (ayer) ━━━
💰 Spend: €{X} (media 7d: €{Y}, {+/-Z%})
👁️ Impressions: {X} (media 7d: {Y})
🖱️ Clicks: {X} | CTR: {X}% | CPC: €{X}
🎯 Leads: {X} (media 7d: {Y})
📹 Video views: {X}

━━━ GHL — CONTACTS (últimas 24h) ━━━
👤 Nuevos contactos: {X}
  - {nombre} — {source} — {tags}
  ...

━━━ GHL — APPOINTMENTS (últimas 24h) ━━━  
📅 Citas: {X}
  - {título} — {fecha/hora} — {status}
  ...

━━━ 🚨 ALERTAS ━━━
{Solo si hay anomalías}
```

## Umbrales de Alerta (defaults v1)

| Métrica | Condición | Nivel |
|---------|-----------|-------|
| CPC | > 2x media 7d | 🔴 |
| CPC | > 1.5x media 7d | 🟡 |
| Spend | > 120% presupuesto diario | 🔴 |
| Spend | = €0 (campaña activa) | 🔴 |
| Leads | = 0 (con spend > €10) | 🟡 |
| CTR | < 50% media 7d | 🟡 |
| Contacts GHL | = 0 (día laborable) | 🟡 |

## Post-Informe
1. Publicar informe como mensaje en #intelligence
2. Crear hilo desde ese mensaje: "📊 Metrics {fecha}"
3. Si hay alertas 🔴: incluir propuesta de acción en el hilo
4. Guardar snapshot en `brand/growth4u/operational/metrics/YYYY-MM-DD.json`

## Extensibilidad
- Para añadir otro cliente: agregar sección aquí + API credentials + intelligence channel ID
- Hospital Capilar: pendiente conexión APIs
- Paymatico: pendiente conexión APIs
