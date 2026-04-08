#!/bin/bash
# Morning Metrics — Growth4U
# Pulls Meta Ads + GHL data, outputs formatted Discord report
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(dirname "$SCRIPT_DIR")"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Load env
source "$SCRIPT_DIR/.meta-ads-env" 2>/dev/null || true
source "$HOME/.openclaw/.env" 2>/dev/null || true

META_TOKEN="${META_ADS_TOKEN:-}"
META_ACCOUNT="act_1507778460268244"
GHL_KEY="${GHL_API_KEY:-}"
GHL_LOC="${GHL_LOCATION_ID:-BnXWP5dcLVMgUudLv10O}"
TODAY=$(date +%Y-%m-%d)

# ---- Meta Ads ----
if [[ -n "$META_TOKEN" ]]; then
  curl -s --max-time 15 "https://graph.facebook.com/v21.0/${META_ACCOUNT}/insights?access_token=${META_TOKEN}&date_preset=yesterday&fields=spend,impressions,clicks,ctr,cpc,reach,actions" > "$TMPDIR/meta_yesterday.json" 2>/dev/null || echo '{"data":[]}' > "$TMPDIR/meta_yesterday.json"
  curl -s --max-time 15 "https://graph.facebook.com/v21.0/${META_ACCOUNT}/insights?access_token=${META_TOKEN}&date_preset=last_7d&fields=spend,impressions,clicks,ctr,cpc,reach,actions&time_increment=1" > "$TMPDIR/meta_7d.json" 2>/dev/null || echo '{"data":[]}' > "$TMPDIR/meta_7d.json"
else
  echo '{"data":[]}' > "$TMPDIR/meta_yesterday.json"
  echo '{"data":[]}' > "$TMPDIR/meta_7d.json"
fi

# ---- GHL Contacts ----
if [[ -n "$GHL_KEY" ]]; then
  curl -s --max-time 15 "https://services.leadconnectorhq.com/contacts/" \
    -H "Authorization: Bearer $GHL_KEY" \
    -H "Version: 2021-07-28" \
    -G \
    --data-urlencode "locationId=$GHL_LOC" \
    --data-urlencode "limit=100" > "$TMPDIR/ghl_contacts.json" 2>/dev/null || echo '{"contacts":[]}' > "$TMPDIR/ghl_contacts.json"
else
  echo '{"contacts":[]}' > "$TMPDIR/ghl_contacts.json"
fi

# ---- GHL Appointments ----
if [[ -n "$GHL_KEY" ]]; then
  YESTERDAY_UTC=$(date -v-1d -u +%Y-%m-%dT00:00:00Z 2>/dev/null || date -d 'yesterday' -u +%Y-%m-%dT00:00:00Z)
  TODAY_END_UTC=$(date -u +%Y-%m-%dT23:59:59Z)
  curl -s --max-time 15 "https://services.leadconnectorhq.com/calendars/events" \
    -H "Authorization: Bearer $GHL_KEY" \
    -H "Version: 2021-04-15" \
    -G \
    --data-urlencode "locationId=$GHL_LOC" \
    --data-urlencode "calendarId=8hQcyWydgrySmdli6vyN" \
    --data-urlencode "startTime=$YESTERDAY_UTC" \
    --data-urlencode "endTime=$TODAY_END_UTC" > "$TMPDIR/ghl_appts.json" 2>/dev/null || echo '{"events":[]}' > "$TMPDIR/ghl_appts.json"
else
  echo '{"events":[]}' > "$TMPDIR/ghl_appts.json"
fi

# ---- Format Report ----
python3 - "$TMPDIR" "$TODAY" "$WORKSPACE" << 'PYEOF'
import json, sys, os
from datetime import datetime, timedelta, timezone

tmpdir = sys.argv[1]
today = sys.argv[2]
workspace = sys.argv[3]

def load(name):
    try:
        with open(os.path.join(tmpdir, name)) as f:
            return json.load(f)
    except:
        return {}

meta_yesterday = load("meta_yesterday.json")
meta_7d = load("meta_7d.json")
ghl_contacts = load("ghl_contacts.json")
ghl_appts = load("ghl_appts.json")

def get_leads(d):
    for a in d.get("actions", []):
        if a["action_type"] == "lead":
            return int(a["value"])
    return 0

report = []
report.append(f"📊 **Morning Metrics — Growth4U** | {today}")
report.append("")

# --- META ADS ---
days = meta_7d.get("data", [])
yesterday_data = meta_yesterday.get("data", [])

if days:
    n = len(days)
    avg_spend = sum(float(d["spend"]) for d in days) / n
    avg_clicks = sum(int(d["clicks"]) for d in days) / n
    avg_cpc = sum(float(d["cpc"]) for d in days) / n
    avg_ctr = sum(float(d["ctr"]) for d in days) / n
    total_leads = sum(get_leads(d) for d in days)
    avg_leads = total_leads / n
    latest = days[-1]
    latest_date = latest["date_start"]

    if yesterday_data:
        yd = yesterday_data[0]
        yd_leads = get_leads(yd)
        report.append("━━━ **META ADS** (ayer) ━━━")
        spend_delta = ((float(yd["spend"]) - avg_spend) / avg_spend * 100) if avg_spend > 0 else 0
        spend_icon = "✅" if abs(spend_delta) < 20 else ("⬆️" if spend_delta > 0 else "⬇️")
        report.append(f'💰 Spend: **€{float(yd["spend"]):.2f}** (media 7d: €{avg_spend:.2f} {spend_icon})')
        avg_imp = int(sum(int(d["impressions"]) for d in days) / n)
        report.append(f'👁️ Impressions: **{int(yd["impressions"]):,}** (media 7d: {avg_imp:,})')
        report.append(f'🖱️ Clicks: **{int(yd["clicks"])}** | CTR: **{float(yd["ctr"]):.2f}%** | CPC: **€{float(yd["cpc"]):.2f}**')
        report.append(f'🎯 Leads: **{yd_leads}** (media 7d: {avg_leads:.1f}/día)')
    else:
        report.append(f"━━━ **META ADS** (último día: {latest_date}) ━━━")
        spend_delta = ((float(latest["spend"]) - avg_spend) / avg_spend * 100) if avg_spend > 0 else 0
        spend_icon = "✅" if abs(spend_delta) < 20 else ("⬆️" if spend_delta > 0 else "⬇️")
        report.append(f'💰 Spend: **€{float(latest["spend"]):.2f}** (media 7d: €{avg_spend:.2f} {spend_icon})')
        report.append(f'👁️ Impressions: **{int(latest["impressions"]):,}**')
        report.append(f'🖱️ Clicks: **{int(latest["clicks"])}** | CTR: **{float(latest["ctr"]):.2f}%** | CPC: **€{float(latest["cpc"]):.2f}**')
        latest_leads = get_leads(latest)
        report.append(f'🎯 Leads: **{latest_leads}** (media 7d: {avg_leads:.1f}/día)')

    report.append("")
    report.append("**Desglose 7d:**")
    report.append("```")
    report.append(f"{'Fecha':<10} {'Spend':>8} {'Imp':>7} {'Clicks':>7} {'CTR':>6} {'CPC':>7} {'Leads':>6}")
    max_leads = max(get_leads(d) for d in days)
    for d in days:
        dl = get_leads(d)
        star = " *" if dl == max_leads and dl > 0 else ""
        report.append(f"{d['date_start'][5:]:<10} €{float(d['spend']):>6.2f} {int(d['impressions']):>7,} {int(d['clicks']):>7} {float(d['ctr']):>5.2f}% €{float(d['cpc']):>5.2f} {dl:>5}{star}")
    avg_imp = int(sum(int(d["impressions"]) for d in days) / n)
    report.append(f"{'Media/d':<10} €{avg_spend:>6.2f} {avg_imp:>7,} {int(avg_clicks):>7} {avg_ctr:>5.2f}% €{avg_cpc:>5.2f} {avg_leads:>5.1f}")
    report.append("```")
else:
    report.append("━━━ **META ADS** ━━━")
    report.append("⚠️ Sin datos de Meta Ads disponibles")
    avg_spend = avg_cpc = avg_ctr = avg_leads = 0

report.append("")

# --- GHL CONTACTS ---
report.append("━━━ **GHL — CONTACTS** (últimas 24h) ━━━")
cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
contacts = ghl_contacts.get("contacts", [])
recent = []
for c in contacts:
    try:
        dt = datetime.fromisoformat(c["dateAdded"].replace("Z", "+00:00"))
        if dt > cutoff:
            recent.append(c)
    except:
        pass

report.append(f"👤 Nuevos contactos: **{len(recent)}**")
if recent:
    for c in recent:
        name = c.get("contactName", "?")
        src = c.get("source") or "Sin fuente"
        tags = ", ".join(c.get("tags", [])) or "—"
        date = c.get("dateAdded", "")[:16].replace("T", " ")
        report.append(f"- **{name}** — {src} — `{tags}` — {date}")
else:
    report.append("(ninguno)")

report.append("")

# --- GHL APPOINTMENTS ---
report.append("━━━ **GHL — APPOINTMENTS** (últimas 24h) ━━━")
events = ghl_appts.get("events", [])
report.append(f"📅 Citas: **{len(events)}**")
if events:
    for e in events:
        title = e.get("title", "?")
        start = e.get("startTime", "")[:16].replace("T", " ")
        status = e.get("status", "?")
        report.append(f"- **{title}** — {start} — {status}")
else:
    report.append("(ninguna)")

report.append("")

# --- ALERTS ---
alerts = []
if days:
    latest = days[-1]
    latest_leads = get_leads(latest)
    latest_cpc = float(latest["cpc"])
    latest_ctr = float(latest["ctr"])
    latest_spend = float(latest["spend"])

    if latest_cpc > avg_cpc * 2:
        alerts.append(f"🔴 **CPC €{latest_cpc:.2f} > 2x media (€{avg_cpc:.2f})** — Coste por click duplicado")
    elif latest_cpc > avg_cpc * 1.5:
        alerts.append(f"🟡 **CPC €{latest_cpc:.2f} > 1.5x media (€{avg_cpc:.2f})** — CPC elevándose")

    if latest_leads == 0 and latest_spend > 10:
        alerts.append(f"🟡 **0 leads con €{latest_spend:.2f} de spend** — Tráfico sin conversión")

    if latest_ctr < avg_ctr * 0.5:
        alerts.append(f"🟡 **CTR {latest_ctr:.2f}% < 50% media ({avg_ctr:.2f}%)** — Engagement bajo")

    if not yesterday_data:
        alerts.append("🟡 **Sin datos de ayer** — Posible lag de reporting o campañas pausadas")

if len(recent) == 0 and datetime.now().weekday() < 5:
    alerts.append("🟡 **0 contactos GHL en día laborable** — Verificar formularios y chat")

suspect = [c for c in recent if not c.get("source")]
if suspect:
    alerts.append(f"🟡 **{len(suspect)} contacto(s) sin fuente** — Posible test/spam")

if alerts:
    report.append("━━━ 🚨 **ALERTAS** ━━━")
    for a in alerts:
        report.append(a)
else:
    report.append("━━━ ✅ **Sin alertas** ━━━")

# Output report
print("\n".join(report))

# Save snapshot
snapshot = {
    "date": today,
    "source": "morning-metrics",
    "meta_ads": {
        "days_with_data": len(days),
        "yesterday_available": len(yesterday_data) > 0,
        "total_spend_7d": round(sum(float(d["spend"]) for d in days), 2) if days else 0,
        "total_leads_7d": sum(get_leads(d) for d in days) if days else 0,
        "avg_spend_day": round(avg_spend, 2),
        "avg_cpc": round(avg_cpc, 2),
        "avg_ctr": round(avg_ctr, 2),
        "avg_leads_day": round(avg_leads, 1),
    },
    "ghl": {
        "contacts_24h": len(recent),
        "appointments_24h": len(events)
    },
    "alerts": [{"text": a} for a in alerts]
}

metrics_dir = os.path.join(workspace, "brand", "growth4u", "operational", "metrics")
os.makedirs(metrics_dir, exist_ok=True)
with open(os.path.join(metrics_dir, f"{today}.json"), "w") as f:
    json.dump(snapshot, f, indent=2, ensure_ascii=False)

PYEOF
