#!/usr/bin/env python3
"""Fix and import Paymatico Fitness LP HTML to Alarife"""
import json
import re
import subprocess
import os

# Read the original HTML
html_path = "/Users/ragi/.openclaw/media/inbound/0b6259e7-527c-4524-add0-838736d45dcf.txt"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Fix Google Fonts link
html = html.replace(
    'href="./Paymático — Pagos para Cadenas de Fitness y Clubes Deportivos v5_files/css2"',
    'href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500&display=swap"'
)

# Fix image URLs - these are Unsplash photos saved locally
unsplash_images = {
    "photo-1534438327276-14e5300c3a48": "photo-1534438327276-14e5300c3a48",
    "photo-1570829460005-c840387bb1ca": "photo-1570829460005-c840387bb1ca", 
    "photo-1551288049-bebda4e38f71": "photo-1551288049-bebda4e38f71",
    "photo-1556742049-0cfed4f6a45d": "photo-1556742049-0cfed4f6a45d",
    "photo-1593079831268-3381b0db4a77": "photo-1593079831268-3381b0db4a77",
    "photo-1454165804606-c3d57bc86b40": "photo-1454165804606-c3d57bc86b40",
    "photo-1526628953301-3e589a6a8b74": "photo-1526628953301-3e589a6a8b74",
    "photo-1460925895917-afdab827c52f": "photo-1460925895917-afdab827c52f",
}

for local_name, unsplash_id in unsplash_images.items():
    old_src = f'./Paymático — Pagos para Cadenas de Fitness y Clubes Deportivos v5_files/{local_name}'
    new_src = f'https://images.unsplash.com/{unsplash_id}?w=800&auto=format&q=80'
    html = html.replace(old_src, new_src)

# Fix CTA links - replace local file:/// URLs
html = re.sub(
    r'href="file:///[^"]*#reservar-demo"',
    'href="#reservar-demo"',
    html
)
html = re.sub(
    r'href="file:///[^"]*#pillars"',
    'href="#pillars"',
    html
)

# Fix nav logo link
html = html.replace('href="https://www.paymatico.com/"', 'href="/"')

# Extract CSS from <style> tag and HTML body
style_match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
css_content = style_match.group(1).strip() if style_match else ""

# Extract body content
body_match = re.search(r'<body[^>]*>(.*)</body>', html, re.DOTALL)
body_content = body_match.group(1).strip() if body_match else ""

# Build the full self-contained HTML for Alarife
# Alarife partner-lps expect: name, slug, html, css, metaTitle, metaDescription
payload = {
    "name": "Fitness - Cadenas de Gimnasios",
    "slug": "fitness-cadenas-gimnasios",
    "metaTitle": "Paymático — Pagos para Cadenas de Fitness y Clubes Deportivos",
    "metaDescription": "Convierte los pagos de tu red de gimnasios en una ventaja competitiva. Dashboard unificado, split payments, conciliación automática y más.",
    "css": css_content,
    "html": body_content,
}

# Get API key
env_path = os.path.expanduser("~/.openclaw/workspace-sancho/brand/sanchocmo/.env")
api_key = ""
with open(env_path, "r") as f:
    for line in f:
        if line.startswith("SANCHOCMO_ALARIFE_API_KEY="):
            api_key = line.strip().split("=", 1)[1]
            break

if not api_key:
    print("ERROR: No API key found")
    exit(1)

client_id = "7SRxn8rDeE3PWEi-oQjle"
url = f"https://alarife.growth4u.io/api/clients/{client_id}/partner-lps"

# Save payload to temp file for curl
payload_path = "/tmp/alarife-fitness-lp.json"
with open(payload_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)

print(f"Payload saved ({len(json.dumps(payload))} bytes)")
print(f"CSS length: {len(css_content)}")
print(f"HTML length: {len(body_content)}")
print(f"Posting to: {url}")

# Use curl via subprocess
result = subprocess.run(
    [
        "curl", "-s", "-X", "POST", url,
        "-H", f"Authorization: Bearer {api_key}",
        "-H", "Content-Type: application/json",
        "-d", f"@{payload_path}"
    ],
    capture_output=True, text=True, timeout=30
)

print(f"\nStatus: {result.returncode}")
print(f"Response: {result.stdout[:2000]}")
if result.stderr:
    print(f"Stderr: {result.stderr[:500]}")
