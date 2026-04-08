#!/bin/bash
# Meta Ads → Slack Daily Report
# Reports previous day's performance by ad set
set -euo pipefail

# --- Config (from env) ---
META_TOKEN="${META_ADS_TOKEN:-}"
AD_ACCOUNT="${META_AD_ACCOUNT:-act_1507778460268244}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_META:-}"

if [[ -z "$META_TOKEN" || -z "$SLACK_WEBHOOK" ]]; then
  echo "ERROR: META_ADS_TOKEN and SLACK_WEBHOOK_META env vars required"
  exit 1
fi

# Yesterday's date (macOS compatible)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)
export YESTERDAY

# --- Fetch ad set insights from Meta Marketing API ---
RESPONSE=$(curl -s "https://graph.facebook.com/v21.0/${AD_ACCOUNT}/insights" \
  --data-urlencode "access_token=${META_TOKEN}" \
  --data-urlencode "level=adset" \
  --data-urlencode "time_range={\"since\":\"${YESTERDAY}\",\"until\":\"${YESTERDAY}\"}" \
  --data-urlencode "fields=adset_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type" \
  --data-urlencode "limit=50")

# Check for API errors
ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('error',{}).get('message',''); print(e)" 2>/dev/null || echo "")
if [[ -n "$ERROR" ]]; then
  curl -s -X POST "$SLACK_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"❌ *Meta Ads Report Error* (${YESTERDAY})\\n\`\`\`${ERROR}\`\`\`\"}"
  exit 1
fi

export META_RESPONSE="$RESPONSE"

# --- Parse and format ---
REPORT=$(python3 << 'PYEOF'
import json, sys, os

yesterday = os.environ.get("YESTERDAY", "unknown")
raw = os.environ.get("META_RESPONSE", "{}")

try:
    data = json.loads(raw)
except:
    print(f"❌ Error parsing Meta API response for {yesterday}")
    sys.exit(0)

entries = data.get("data", [])

if not entries:
    print(f"📊 *Meta Ads Report — {yesterday}*\n\nNo hay datos de ad sets para ayer. Puede que no haya campañas activas.")
    sys.exit(0)

lines = [f"📊 *Meta Ads Report — {yesterday}*\n"]
total_spend = 0
total_impressions = 0
total_clicks = 0
total_forms = 0
total_conversions = 0

for e in entries:
    name = e.get("adset_name", "Unknown")
    spend = float(e.get("spend", 0))
    impressions = int(e.get("impressions", 0))
    clicks = int(e.get("clicks", 0))
    ctr = e.get("ctr", "0")
    cpc = e.get("cpc", "0")

    total_spend += spend
    total_impressions += impressions
    total_clicks += clicks

    forms = 0
    conversions = 0
    for a in e.get("actions", []):
        atype = a["action_type"]
        aval = int(a["value"])
        if atype in ("lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"):
            forms += aval
        if atype in ("purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration"):
            conversions += aval

    total_forms += forms
    total_conversions += conversions

    extras = ""
    if forms > 0:
        extras += f" | 📝 Forms: {forms}"
    if conversions > 0:
        extras += f" | 🎯 Conv: {conversions}"

    lines.append(f"*{name}*")
    lines.append(f"  💰 €{spend:.2f} | 👁️ {impressions:,} imp | 👆 {clicks} clicks | CTR {float(ctr):.2f}% | CPC €{float(cpc):.2f}{extras}")
    lines.append("")

total_ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
total_cpc = (total_spend / total_clicks) if total_clicks > 0 else 0

lines.append("─" * 30)
summary = f"*TOTAL*: 💰 €{total_spend:.2f} | 👁️ {total_impressions:,} imp | 👆 {total_clicks} clicks | CTR {total_ctr:.2f}% | CPC €{total_cpc:.2f}"
if total_forms > 0:
    summary += f" | 📝 {total_forms} forms"
if total_conversions > 0:
    summary += f" | 🎯 {total_conversions} conv"
lines.append(summary)

print("\n".join(lines))
PYEOF
)

# --- Send to Slack ---
PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'text': sys.stdin.read()}))" <<< "$REPORT")
curl -s -X POST "$SLACK_WEBHOOK" -H "Content-Type: application/json" -d "$PAYLOAD"

echo ""
echo "✅ Report sent to Slack for ${YESTERDAY}"
