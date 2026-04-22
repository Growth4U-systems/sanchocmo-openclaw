# Alarife → Producción: Plan de Deploy

> Fecha: 2026-03-20 | Estado: En preparación

## Resumen

Alarife (LP Factory) → Hetzner VPS con Docker + Caddy. Multi-tenant por hostname.
CI/CD ya configurado en GitHub Actions pero **builds fallando** por bug de Docker cache.

---

## Paso 0: Fix CI/CD (Sancho puede hacer esto)

**Problema**: GitHub Actions falla con `Cache export is not supported for the docker driver`.
**Fix**: Añadir `docker/setup-buildx-action` antes del build, o quitar `cache-from/cache-to`.

### Fix rápido — quitar GHA cache:

En `.github/workflows/build-push.yml`, cambiar ambos jobs:

```yaml
# ANTES (falla):
      - uses: docker/build-push-action@v6
        with:
          ...
          cache-from: type=gha
          cache-to: type=gha,mode=max

# DESPUÉS (funciona):
      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v6
        with:
          ...
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Añadir el step `docker/setup-buildx-action@v3` ANTES del build-push en ambos jobs.

---

## Paso 1: Provisionar Hetzner (👤 Humano)

1. Crear cuenta en [Hetzner Cloud](https://console.hetzner.cloud)
2. Crear servidor:
   - **Nombre**: `alarife-prod`
   - **Plan**: CX22 (2 vCPU, 4GB RAM, 40GB SSD) — €4.51/mes
   - **OS**: Ubuntu 24.04
   - **Datacenter**: Falkenstein (fsn1) o Nuremberg (nbg1)
   - **SSH Key**: añadir la clave pública de Alfonso
   - **Firewall**: crear regla permitiendo puertos 22, 80, 443
3. Anotar la **IP pública** del servidor

---

## Paso 2: Setup del Servidor (👤 Humano, script preparado)

Conectar por SSH y ejecutar este script:

```bash
#!/bin/bash
# === Alarife Production Server Setup ===

# 1. Update system
apt update && apt upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com | sh

# 3. Create deploy user
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy

# 4. Create app directory
mkdir -p /opt/alarife
chown deploy:deploy /opt/alarife

# 5. Create uploads directory (for images)
mkdir -p /data/uploads
chown deploy:deploy /data/uploads

# 6. Setup SSH for deploy user (copy your key)
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 7. Configure firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 8. Login to GHCR (needs a GitHub PAT with packages:read)
echo "TOKEN_AQUI" | docker login ghcr.io -u growth4u-systems --password-stdin

echo "✅ Server ready. Next: create .env and docker-compose files in /opt/alarife"
```

---

## Paso 3: Configurar .env en el Servidor (🤖+👤)

Crear `/opt/alarife/.env`:

```env
# Database (Neon — ya existente)
DATABASE_URL=postgresql://...RELLENAR...

# Auth
BETTER_AUTH_SECRET=GENERAR_CON_openssl_rand_-base64_32
BETTER_AUTH_URL=https://admin.sanchocmo.com
GOOGLE_CLIENT_ID=...RELLENAR...
GOOGLE_CLIENT_SECRET=...RELLENAR...

# Admin UI
NEXT_PUBLIC_APP_URL=https://admin.sanchocmo.com

# Marketing
PUBLIC_SITE_URL=https://alarife.sanchocmo.com
PUBLIC_CLIENT_SLUG=neo-bank-audi

# Caddy
ADMIN_DOMAIN=admin.sanchocmo.com
```

⚠️ **AI keys y PostHog** se configuran desde el Setup Wizard (no hace falta en .env).

---

## Paso 4: Copiar docker-compose al Servidor (👤 Humano)

```bash
# Como deploy@alarife-prod:
cd /opt/alarife

# Opción A: clonar repo
git clone https://github.com/Growth4U-systems/alarife.git .

# Opción B: solo copiar los archivos necesarios
# (docker-compose.yml, docker-compose.prod.yml, Caddyfile)
```

---

## Paso 5: DNS (👤 Humano)

En el registrador de `sanchocmo.com`, crear:

| Tipo | Nombre | Valor | TTL |
|------|--------|-------|-----|
| A | `admin.sanchocmo.com` | `<IP_HETZNER>` | 300 |
| A | `alarife.sanchocmo.com` | `<IP_HETZNER>` | 300 |

Para clientes futuros, cada uno apunta su dominio:
```
landing.cliente.com  →  CNAME  →  alarife.sanchocmo.com
```

---

## Paso 6: Primer Deploy (👤 Humano)

```bash
cd /opt/alarife
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verificar
docker compose ps          # 3 servicios: admin, marketing, caddy
docker compose logs caddy  # SSL provisioning
curl -I https://admin.sanchocmo.com/api/health
```

---

## Paso 7: Configurar GitHub Secrets para CI/CD (🤖 Sancho puede hacer)

```
VPS_HOST     → <IP_HETZNER>
VPS_USER     → deploy
VPS_SSH_KEY  → <clave privada SSH>
```

Una vez configurados, cada push a `main` → build → deploy automático.

---

## Paso 8: Setup Wizard (👤 Humano)

1. Ir a `https://admin.sanchocmo.com`
2. Login con Google (alfonso@growth4u.io)
3. El wizard redirige automáticamente al setup
4. Configurar: Anthropic API key + OpenRouter key (opcionales para el copilot)
5. Completar → dashboard operativo

---

## Checklist Post-Deploy

- [ ] `https://admin.sanchocmo.com` carga login
- [ ] Google OAuth funciona
- [ ] Setup Wizard completa sin errores
- [ ] Dashboard muestra clientes
- [ ] `https://admin.sanchocmo.com/api/health` → 200
- [ ] Marketing: dominio de cliente carga página correcta
- [ ] SSL automático funciona (verificar candado verde)
- [ ] GitHub Actions build pasa (tras fix del Paso 0)
- [ ] Auto-deploy funciona (push → build → deploy)

---

## Coste mensual estimado

| Concepto | Coste |
|----------|-------|
| Hetzner CX22 | €4.51/mes |
| Neon PostgreSQL (free tier) | €0 |
| Dominios | Ya existentes |
| SSL (Let's Encrypt) | €0 |
| **Total** | **€4.51/mes** |
