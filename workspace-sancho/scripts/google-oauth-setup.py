#!/usr/bin/env python3
"""
Google OAuth setup for GSC + GA4 using gog's client credentials.
Reuses the same OAuth app but requests additional scopes.

Usage:
  python3 scripts/google-oauth-setup.py --step 1   # Print auth URL
  python3 scripts/google-oauth-setup.py --step 2 --code <auth_code>  # Exchange code for tokens
  python3 scripts/google-oauth-setup.py --test      # Test the stored tokens
"""

import json, os, sys, urllib.request, urllib.parse

# Use gog's OAuth client credentials
CLIENT_ID = "871376636741-8urml2ilrapt21qmuamfaui4f8r9h19l.apps.googleusercontent.com"
CLIENT_SECRET = "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"

# Scopes for GSC + GA4
SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
]

TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "brand", "growth4u", "google-tokens.json")
REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"

def step1():
    """Print OAuth URL for user to visit."""
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    print(f"\n🔗 Abre esta URL en tu navegador y autoriza con alfonso@growth4u.io:\n")
    print(url)
    print(f"\nDespués, copia el código de autorización y ejecuta:")
    print(f"  python3 scripts/google-oauth-setup.py --step 2 --code <TU_CODIGO>\n")

def step2(code):
    """Exchange authorization code for tokens."""
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()
    
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    
    try:
        resp = urllib.request.urlopen(req)
        tokens = json.loads(resp.read())
        
        # Save tokens
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        token_data = {
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token"),
            "token_type": tokens.get("token_type", "Bearer"),
            "expires_in": tokens.get("expires_in"),
            "scope": tokens.get("scope", ""),
            "created_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }
        with open(TOKEN_FILE, "w") as f:
            json.dump(token_data, f, indent=2)
        
        print(f"✅ Tokens guardados en {TOKEN_FILE}")
        print(f"   Scopes: {tokens.get('scope', '')}")
        print(f"   Has refresh_token: {bool(tokens.get('refresh_token'))}")
        
    except urllib.error.HTTPError as e:
        print(f"❌ Error: {e.code} — {e.read().decode()}")
        sys.exit(1)

def refresh_access_token():
    """Refresh the access token using stored refresh token."""
    if not os.path.exists(TOKEN_FILE):
        print("❌ No tokens found. Run --step 1 first.")
        sys.exit(1)
    
    with open(TOKEN_FILE) as f:
        tokens = json.load(f)
    
    if not tokens.get("refresh_token"):
        print("❌ No refresh_token stored.")
        sys.exit(1)
    
    data = urllib.parse.urlencode({
        "refresh_token": tokens["refresh_token"],
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "refresh_token",
    }).encode()
    
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    
    resp = urllib.request.urlopen(req)
    new_tokens = json.loads(resp.read())
    
    tokens["access_token"] = new_tokens["access_token"]
    tokens["expires_in"] = new_tokens.get("expires_in")
    tokens["refreshed_at"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
    
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f, indent=2)
    
    return tokens["access_token"]

def test_connections():
    """Test GSC and GA4 connections."""
    token = refresh_access_token()
    
    # Test GSC
    print("\n🔍 Testing Google Search Console...")
    try:
        req = urllib.request.Request("https://searchconsole.googleapis.com/webmasters/v3/sites")
        req.add_header("Authorization", f"Bearer {token}")
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        sites = data.get("siteEntry", [])
        print(f"   ✅ GSC connected — {len(sites)} site(s):")
        for s in sites:
            print(f"      - {s['siteUrl']} ({s.get('permissionLevel', '?')})")
    except urllib.error.HTTPError as e:
        print(f"   ❌ GSC error: {e.code} — {e.read().decode()[:200]}")
    
    # Test GA4
    print("\n📊 Testing Google Analytics 4...")
    try:
        req = urllib.request.Request("https://analyticsadmin.googleapis.com/v1beta/accountSummaries")
        req.add_header("Authorization", f"Bearer {token}")
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        accounts = data.get("accountSummaries", [])
        print(f"   ✅ GA4 connected — {len(accounts)} account(s):")
        for a in accounts:
            print(f"      - {a.get('displayName', '?')} ({a.get('account', '')})")
            for p in a.get("propertySummaries", []):
                print(f"        → {p.get('displayName', '?')} (Property: {p.get('property', '').split('/')[-1]})")
    except urllib.error.HTTPError as e:
        print(f"   ❌ GA4 error: {e.code} — {e.read().decode()[:200]}")

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--step" in args:
        step = args[args.index("--step") + 1]
        if step == "1":
            step1()
        elif step == "2":
            code = args[args.index("--code") + 1]
            step2(code)
    elif "--test" in args:
        test_connections()
    elif "--refresh" in args:
        token = refresh_access_token()
        print(token)
    else:
        print("Usage:")
        print("  --step 1              Print OAuth URL")
        print("  --step 2 --code X     Exchange code for tokens")
        print("  --test                Test GSC + GA4 connections")
        print("  --refresh             Refresh and print access token")
