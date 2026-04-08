#!/bin/bash
# Push Airfoods case study landing to Alarife

KEY="ak_5UUfUvFhHZZtyt5zD1U6jvRJODIw07Hd3UIcW8joTMk"
BASE="https://alarife.growth4u.io"
CLIENT_ID="7SRxn8rDeE3PWEi-oQjle"

# Read HTML file
HTML_CONTENT=$(cat ~/.openclaw/workspace-sancho/brand/paymatico/campaigns/content/landing-caso-airfoods.html)

# Create JSON payload using python to properly escape
python3 -c "
import json, sys

html = open('$HOME/.openclaw/workspace-sancho/brand/paymatico/campaigns/content/landing-caso-airfoods.html').read()

payload = {
    'detectedType': 'page',
    'data': {
        'title': 'Caso de Éxito: Airfoods × Paymático',
        'slug': 'caso-exito-airfoods',
        'category': 'landing',
        'template': 'freeform',
        'sections': [{
            'type': 'raw_html',
            'name': 'Landing Caso Airfoods',
            'config': {
                'html': html
            }
        }],
        'status': 'draft',
        'metaTitle': 'Caso de Éxito: Airfoods × Paymático — Control financiero en 20+ locales',
        'metaDescription': 'Descubre cómo Airfoods recuperó el control y visibilidad financiera de su red de 20+ locales en aeropuertos con Paymático.'
    }
}

print(json.dumps(payload))
" | curl -s -X POST "${BASE}/api/clients/${CLIENT_ID}/import/save" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d @-
