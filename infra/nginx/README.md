# infra/nginx

Versioned reverse-proxy configs that the deploy workflows don't manage.

## Why this exists

`docker-compose.yml`, deploy workflows, and GitHub Environment secrets are
the source of truth for everything inside the containers. The nginx config
on the host *outside* the containers isn't reachable by those mechanisms,
so any patch to it (TLS terminator, header injection, redirect rules)
historically lived only on the running VPS — invisible to PRs and lost if
the server is rebuilt.

Files here are the canonical version of those configs. Apply them by hand
when bootstrapping a new VPS or fixing a drift; the file in
`/etc/nginx/sites-enabled/` should match the one in this directory.

## Files

| File | Vhost | Purpose |
|------|-------|---------|
| `od.conf` | `od.<env>.sanchocmo.ai` | Reverse proxy for the Open Design daemon container with Phase 5 bearer + Origin injection. |

## Applying `od.conf` to a VPS

```bash
# 0) Variables you'll fill in
DOMAIN=od.staging.sanchocmo.ai           # public FQDN
TOKEN=$(grep OD_API_TOKEN /root/.openclaw/.env | cut -d= -f2)  # same as container env

# 1) Drop a plain HTTP-only stub so certbot can grab a cert
sudo tee /etc/nginx/sites-available/sancho-od >/dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location / { return 404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/sancho-od /etc/nginx/sites-enabled/sancho-od
sudo nginx -t && sudo systemctl reload nginx

# 2) Issue the cert (certbot rewrites the file with listen 443 + ssl_*)
sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email ops@sanchocmo.ai

# 3) Replace the certbot-augmented stub with the versioned config from this repo
sudo cp /etc/nginx/sites-enabled/sancho-od /etc/nginx/sites-enabled/sancho-od.bak-$(date +%Y%m%d-%H%M%S)
sudo cp ~/.openclaw/infra/nginx/od.conf /etc/nginx/sites-available/sancho-od
sudo sed -i "s|<OD_DOMAIN>|${DOMAIN}|g; s|<OD_API_TOKEN>|${TOKEN}|g" /etc/nginx/sites-available/sancho-od
sudo ln -sf /etc/nginx/sites-available/sancho-od /etc/nginx/sites-enabled/sancho-od

# 4) Validate + reload
sudo nginx -t && sudo systemctl reload nginx

# 5) Smoke test — should be HTTP 200 (panel MCP loaded successfully)
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://${DOMAIN}/api/mcp/install-info
```

## Rotating the OD_API_TOKEN

Token lives in two places: the GitHub Environment (consumed by the container)
and the nginx config (consumed by the proxy). They must match. To rotate:

1. Update the secret in GitHub Environment → next deploy refreshes the
   container's env.
2. SSH to the VPS and `sed -i "s|Bearer <old>|Bearer <new>|" /etc/nginx/sites-enabled/sancho-od && sudo systemctl reload nginx`.

Doing one without the other yields 401 on every browser request.

## Convention

- `sites-enabled/sancho-od` should be a symlink to `sites-available/sancho-od`.
  If you find them diverging (e.g. `sites-enabled/sancho-od` is a real file),
  unify with: `sudo cp sites-enabled/sancho-od sites-available/sancho-od && sudo ln -sf ../sites-available/sancho-od /etc/nginx/sites-enabled/sancho-od`.
- The `sancho-od.bak-*` files are local rollback snapshots; not committed.
