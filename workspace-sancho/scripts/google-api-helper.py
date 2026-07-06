#!/usr/bin/env python3
"""
Google API helper for GSC + GA4 using system Service Account.
Uses .secrets/google-service-account.json for auth.

Usage:
  python3 scripts/google-api-helper.py --service gsc --action sites
  python3 scripts/google-api-helper.py --service gsc --action query --slug growth4u --days 28 --dimensions query --limit 25
  python3 scripts/google-api-helper.py --service ga4 --action accounts
  python3 scripts/google-api-helper.py --service ga4 --action report --slug growth4u --days 28 --metrics sessions,totalUsers --dimensions date
  python3 scripts/google-api-helper.py --service gsc --action token   # Print raw access token
  python3 scripts/google-api-helper.py --service ga4 --action token   # Print raw access token
"""

import json, os, sys, time, hashlib, hmac, base64, struct
import urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.join(SCRIPT_DIR, "..")
SA_PATH = os.path.join(BASE_DIR, ".secrets", "google-service-account.json")

SCOPES = {
    "gsc": "https://www.googleapis.com/auth/webmasters.readonly",
    "ga4": "https://www.googleapis.com/auth/analytics.readonly",
}

def load_sa():
    if not os.path.exists(SA_PATH):
        print(f"❌ Service Account not found at {SA_PATH}", file=sys.stderr)
        sys.exit(1)
    with open(SA_PATH) as f:
        return json.load(f)

def base64url_encode(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")

def create_jwt(sa, scope):
    """Create a signed JWT for Google OAuth2."""
    import subprocess, tempfile
    
    header = base64url_encode(json.dumps({"alg": "RS256", "typ": "JWT"}))
    now = int(time.time())
    claims = {
        "iss": sa["client_email"],
        "scope": scope,
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }
    payload = base64url_encode(json.dumps(claims))
    sign_input = f"{header}.{payload}"
    
    # Write private key to temp file, sign with openssl
    with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as kf:
        kf.write(sa["private_key"])
        kf_path = kf.name
    
    try:
        proc = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", kf_path],
            input=sign_input.encode(),
            capture_output=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"openssl sign failed: {proc.stderr.decode()}")
        signature = base64url_encode(proc.stdout)
    finally:
        os.unlink(kf_path)
    
    return f"{sign_input}.{signature}"

def get_access_token(service):
    """Get an OAuth2 access token using the Service Account."""
    sa = load_sa()
    scope = SCOPES.get(service)
    if not scope:
        print(f"❌ Unknown service: {service}", file=sys.stderr)
        sys.exit(1)
    
    jwt = create_jwt(sa, scope)
    
    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt,
    }).encode()
    
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    
    try:
        resp = urllib.request.urlopen(req)
        tokens = json.loads(resp.read())
        return tokens["access_token"]
    except urllib.error.HTTPError as e:
        print(f"❌ OAuth error: {e.code} — {e.read().decode()[:300]}", file=sys.stderr)
        sys.exit(1)

def load_integrations(slug):
    """Load integrations.json for a client."""
    path = os.path.join(BASE_DIR, "brand", slug, "integrations.json")
    if not os.path.exists(path):
        print(f"❌ No integrations.json for {slug}", file=sys.stderr)
        sys.exit(1)
    with open(path) as f:
        return json.load(f)

def api_request(url, token, method="GET", body=None):
    """Make an authenticated API request."""
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if body:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(body).encode()
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()[:500]
        print(f"❌ API error: {e.code} — {error_body}", file=sys.stderr)
        sys.exit(1)

# --- GSC Actions ---

def gsc_sites(token):
    data = api_request("https://searchconsole.googleapis.com/webmasters/v3/sites", token)
    sites = data.get("siteEntry", [])
    print(f"📊 {len(sites)} site(s):")
    for s in sites:
        print(f"  - {s['siteUrl']} ({s.get('permissionLevel', '?')})")
    return data

def gsc_query(token, slug, days, dimensions, limit, filter_str=None):
    intg = load_integrations(slug)
    site_url = intg.get("dataSources", {}).get("gsc", {}).get("config", {}).get("SITE_URL", "")
    if not site_url:
        print("❌ SITE_URL not configured in integrations.json", file=sys.stderr)
        sys.exit(1)
    
    encoded_site = urllib.parse.quote(site_url, safe="")
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=int(days))
    
    body = {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "dimensions": dimensions.split(","),
        "rowLimit": int(limit),
    }
    
    if filter_str:
        parts = filter_str.split(" ", 2)
        if len(parts) == 3:
            body["dimensionFilterGroups"] = [{
                "filters": [{
                    "dimension": parts[0],
                    "operator": parts[1],
                    "expression": parts[2],
                }]
            }]
    
    url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query"
    data = api_request(url, token, method="POST", body=body)
    
    rows = data.get("rows", [])
    print(f"📊 GSC Query: {site_url} | {start_date} → {end_date} | {len(rows)} rows")
    print(json.dumps(data, indent=2))
    return data

# --- GA4 Actions ---

def ga4_accounts(token, slug="growth4u"):
    """Check GA4 connectivity using the Data API (no Admin API needed)."""
    intg = load_integrations(slug)
    property_id = intg.get("dataSources", {}).get("ga4", {}).get("config", {}).get("PROPERTY_ID", "")
    if not property_id:
        print("❌ PROPERTY_ID not configured in integrations.json", file=sys.stderr)
        sys.exit(1)
    
    data = api_request(f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}/metadata", token)
    metrics = data.get("metrics", [])
    dimensions = data.get("dimensions", [])
    print(f"✅ GA4 connected — Property {property_id}")
    print(f"   Available: {len(metrics)} metrics, {len(dimensions)} dimensions")
    return data

def ga4_report(token, slug, days, metrics, dimensions):
    intg = load_integrations(slug)
    property_id = intg.get("dataSources", {}).get("ga4", {}).get("config", {}).get("PROPERTY_ID", "")
    if not property_id:
        print("❌ PROPERTY_ID not configured in integrations.json", file=sys.stderr)
        sys.exit(1)
    
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=int(days))
    
    body = {
        "dateRanges": [{"startDate": start_date.isoformat(), "endDate": end_date.isoformat()}],
        "metrics": [{"name": m.strip()} for m in metrics.split(",")],
    }
    if dimensions:
        body["dimensions"] = [{"name": d.strip()} for d in dimensions.split(",")]
    
    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
    data = api_request(url, token, method="POST", body=body)
    
    print(f"📊 GA4 Report: Property {property_id} | {start_date} → {end_date}")
    print(json.dumps(data, indent=2))
    return data

# --- Main ---

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Google API helper (GSC + GA4)")
    parser.add_argument("--service", required=True, choices=["gsc", "ga4"])
    parser.add_argument("--action", required=True, help="Action: token, sites, query, accounts, report")
    parser.add_argument("--slug", default="growth4u")
    parser.add_argument("--days", default="28")
    parser.add_argument("--dimensions", default="")
    parser.add_argument("--metrics", default="sessions,totalUsers")
    parser.add_argument("--limit", default="25")
    parser.add_argument("--filter", default=None, dest="filter_str")
    args = parser.parse_args()
    
    if args.action == "token":
        print(get_access_token(args.service))
        return
    
    token = get_access_token(args.service)
    
    if args.service == "gsc":
        if args.action == "sites":
            gsc_sites(token)
        elif args.action == "query":
            if not args.dimensions:
                args.dimensions = "query"
            gsc_query(token, args.slug, args.days, args.dimensions, args.limit, args.filter_str)
        else:
            print(f"❌ Unknown GSC action: {args.action}")
    
    elif args.service == "ga4":
        if args.action == "accounts":
            ga4_accounts(token)
        elif args.action == "report":
            ga4_report(token, args.slug, args.days, args.metrics, args.dimensions)
        else:
            print(f"❌ Unknown GA4 action: {args.action}")

if __name__ == "__main__":
    main()
