# Cervantes Web Chat (nginx + ttyd + tmux + claude CLI) — Plan

## Context

Hoy Cervantes (agente arquitecto del sistema sanchocmo) corre como **servicio systemd en el host** del VPS Hetzner, invocando `claude --permission-mode acceptEdits --channels plugin:discord@claude-plugins-official` contra `workspace-cervantes/`, autenticado con `CLAUDE_CODE_OAUTH_TOKEN` (membresía Max del usuario).

Se le escribe **via Discord, en varios canales a la vez**: los "canales base" están listados como keys de `groups` en `/root/.claude/channels/discord/access.json`, y Cervantes responde en hilos o DMs de cualquiera de ellos (política en `workspace-cervantes/config/discord.json` + `workspace-cervantes/CLAUDE.md:74-82`). `#cervantes-admin` es sólo uno de esos canales — el destinado a mensajes con formato `ADMIN REQUEST` (bugs/infra/cambios). La limitación no es "un solo canal" sino "todos los canales pasan por Discord".

El usuario quiere **reemplazar Discord por un chat web** con feature parity respecto a la Claude Code VS Code extension que usa en local: slash commands, selector de modelo, modos (plan/auto/accept-edits), sesiones persistentes, paralelismo. Restricciones adicionales:

- **No depender de la VSIX** de la extension: es propietaria, sin licencia para redistribución, no está en OpenVSX, y la extension embebe el mismo CLI adentro — no aporta features exclusivas en un VPS.
- Corre en un **docker separado** del container `sanchocmo` existente.
- Debe poder **administrar el docker de Sancho** (down/up/logs, editar `workspace-sancho/`).
- URL staging: `https://cervates-staging.sanchocmo.ai` (nombre corto; agente sigue siendo "Cervantes").
- SSH al VPS a veces tiene lag → queremos algo **más snappy que SSH**.
- Sancho queda fuera de alcance en este plan.

## Decisión técnica

**`ttyd` + `tmux` + `claude` CLI** adentro de un container `cervantes` nuevo. **nginx** (ya instalado en el VPS, maneja el dominio principal via `docker/nginx.conf.template` + `setup-vps.sh`) como reverse proxy, con HTTPS via Let's Encrypt (certbot) y basic auth via `htpasswd`.

Por qué este stack cubre el requerimiento de "mismas opciones/commands que la extension":

- El CLI `claude` **en modo interactivo** (sin `-p`) abre el TUI completo: slash commands (`/model`, `/plan`, `/resume`, `/compact`, `/cost`, `/help`, skills), selector de modelo con picker, `Shift+Tab` cicla entre modos (normal → auto-accept → plan → bypass), `/resume` con lista interactiva de sesiones, MCP, checkpoints. La extension es UI sobre **ese mismo CLI** — no tiene slash commands propios.
- **Session store compartido**: ambos (CLI y extension) leen/escriben `~/.claude/projects/<cwd-hash>/sessions/*.jsonl`. Podés empezar una sesión desde la extension local, y continuarla con `claude --resume` en el ttyd del VPS (si montamos el mismo `~/.claude`).
- **Paralelismo**: tmux nativo. `Ctrl+b c` abre una nueva ventana con su propio `claude`. `Ctrl+b 0-9` cambia entre ventanas. Cerrar el browser no mata las sesiones (tmux persiste); reabrir reengancha al mismo estado.
- **Lag vs SSH**: ttyd es PTY sobre websocket con xterm.js renderizando client-side. No hay handshake per-keystroke ni compresión server-side pesada como SSH. Sensiblemente más rápido.
- **Footprint**: ttyd idle ~20 MB, cada sesión activa de claude ~200-300 MB. Code-server arrancaba en 300-500 MB *antes* de la extension. ~3-5x más liviano.

**Control del docker de Sancho**: Docker-outside-of-Docker — el container Cervantes monta `/var/run/docker.sock` y trae `docker` + `docker compose` CLI. Desde una ventana tmux: `docker compose -f /workspaces/sanchocmo-openclaw/docker-compose.yml down sanchocmo && … up -d sanchocmo`. Trade-off de seguridad explícito: el socket es equivalente a root en el host; aceptable por ser single-tenant tras basic auth en subdominio privado.

**Coexistencia con el Cervantes systemd actual**: no se apaga en este plan. El systemd sigue corriendo con el canal Discord. Una vez validado el chat web end-to-end, se retira con `systemctl disable --now cervantes-claude-code` (paso posterior, fuera de alcance). Ambos comparten `~/.claude/` sin conflicto (refresh de token es atómico; sesiones se organizan por cwd).

**Edición de archivos**: el CLI `claude` hace todo el trabajo via sus propias tools (Read/Edit/Write). Para edición manual puntual, `vim` o `nano` en una ventana tmux aparte. Si en el futuro falta la UX de IDE (diff viewer, file tree), se puede sumar code-server como *segundo* servicio apuntando a las mismas mounts — no bloquea nada ahora.

## Arquitectura

```
   browser (solo el usuario)
        │  HTTPS + Basic Auth
        ▼
   nginx (host, :443, cervates-staging.sanchocmo.ai)
   cert: /etc/letsencrypt/live/cervates-staging.sanchocmo.ai/
   auth: /etc/nginx/.htpasswd-cervantes
        │  proxy_pass http://127.0.0.1:7681 + Upgrade/Connection headers
        ▼
   container "cervantes" (ttyd :7681)
        │   └─ ttyd -W (writable)  -c user:hash  -t fontSize=14
        │        attached to ↓
        │      tmux (session "cervantes" con 1+ ventanas)
        │        └─ ventana 0: cd /root/.openclaw/workspace-cervantes && claude
        │        └─ ventana N: claude en otro cwd, o docker compose, o vim, ...
        │
        ├── bin adentro del container:
        │      node 22, claude CLI, tmux, ttyd, docker CLI, docker-compose-plugin,
        │      git, openssh-client, tini
        │
        ├── mounts:
        │      ~/.claude                → /root/.claude          (OAuth + sessions, rw)
        │      ~/.ssh                   → /root/.ssh  (ro)       (git)
        │      <repo>                   → /workspaces/sanchocmo-openclaw (rw)
        │      ${OPENCLAW_HOME:-~/.openclaw} → /root/.openclaw    (rw, compartido con Sancho)
        │      /var/run/docker.sock     → /var/run/docker.sock   (DooD)
        │
        └── network: bridge por defecto (alcanza a sanchocmo por nombre)
```

## Archivos a crear / modificar

### Crear
- `docker/Dockerfile.cervantes` — `debian:bookworm-slim` base. Instala: node 22 (para el CLI), `claude` via `https://claude.ai/install.sh` (mismo instalador que el systemd actual), `tmux`, `ttyd` (bin estático oficial desde GitHub releases), `docker-ce-cli` + `docker-compose-plugin`, `git`, `openssh-client`, `tini`. Build arg `DOCKER_GID` para matchear el GID del socket del host.
- `docker/cervantes.entrypoint.sh` — al arrancar: (a) chequea GID real de `/var/run/docker.sock` y hace `groupmod -g` si cambió, (b) si no existe la tmux session "cervantes" la crea con una ventana en `workspace-cervantes/` que ejecuta `claude --permission-mode acceptEdits` (mismo default que `scripts/start-cervantes.sh:7` y el systemd unit), (c) `exec ttyd -W -p 7681 tmux attach -t cervantes`.
  - Auth: Caddy hace el gate con basic auth antes de llegar a ttyd; el container binda a `127.0.0.1` así que no hay ruta de red alternativa. No duplicar auth en ttyd para no pedir password dos veces. Si en el futuro exponemos ttyd fuera de loopback (no debería), sumar `-c user:pass` con un password separado al de Caddy.
- `docker/nginx/cervantes.conf.template` — server block nuevo para `cervates-staging.sanchocmo.ai` con redirect `:80 → :443`, cert de Let's Encrypt, `auth_basic` apuntando a `/etc/nginx/.htpasswd-cervantes`, y `location /` con `proxy_pass http://127.0.0.1:7681;` + los headers estándar del template existente (Upgrade/Connection/Host/X-Forwarded-*/read_timeout). Se instala como `/etc/nginx/sites-available/cervantes` y se enlaza en `sites-enabled/`. Basado en [docker/nginx.conf.template](docker/nginx.conf.template) — no reinventar headers.
- `docs/runbooks/cervantes-web-chat.md` — setup one-time: OAuth, basic auth, cómo apagar el systemd viejo cuando llegue el momento, parallelism recipes (tmux cheat sheet).

### Modificar
- `docker-compose.yml` — agregar servicio `cervantes` como bloque independiente. NO tocar el servicio `sanchocmo`.
- `.env.example` — documentar `HOST_DOCKER_GID`. El usuario/hash de basic auth NO va en `.env` — vive en `/etc/nginx/.htpasswd-cervantes` generado con `htpasswd` (paquete `apache2-utils`). Una sola fuente de verdad, fuera de git.

### Referencias a reutilizar (no duplicar código)
- `docker/cervantes-claude-code.service:13-14` — comando canónico de arranque del CLI (`/root/.local/bin/claude`) y PATH. El container usa el mismo bin path.
- `docker/cervantes-claude-code.service:21-22` — límites de recursos (`MemoryMax=2G`, `CPUQuota=50%`). Replicar como `mem_limit: 2g` y `cpus: 0.5` en compose.
- `docker/setup-cervantes-cc.sh:43` — flujo `claude setup-token` para OAuth headless. El runbook nuevo apunta al mismo flujo.
- `docker-compose.yml` (servicio `sanchocmo`) — patrón de mounts `${OPENCLAW_HOME:-~/.openclaw}` y `~/.ssh:ro`. Servicio `cervantes` hereda el mismo patrón.
- `docker/nginx.conf.template:20-27` — bloque `proxy_set_header Upgrade/Connection/Host/X-Real-IP/X-Forwarded-*` + `proxy_read_timeout 300s`. Copiar verbatim en el server block de Cervantes — websocket upgrade + headers ya probados en este VPS.
- `docker/setup-vps.sh:47-69` — patrón de emisión de cert con certbot. En vez de `--standalone` (que requiere apagar nginx), usar `--nginx` plugin o `--webroot` porque nginx ya corre con el dominio principal y no queremos tirarlo.

## Pasos de implementación

1. **DNS**. Crear registro A (o CNAME) para `cervates-staging.sanchocmo.ai` apuntando al IP del VPS. `dig +short cervates-staging.sanchocmo.ai` debe resolver antes de pedir el cert TLS.

2. **Preparar host (VPS)**. SSH al VPS una sola vez:
   - `getent group docker | cut -d: -f3` → anotar GID, exportar como `HOST_DOCKER_GID` en `.env`.
   - `apt-get install -y apache2-utils` si `htpasswd` no está → generar `/etc/nginx/.htpasswd-cervantes` con `htpasswd -cB /etc/nginx/.htpasswd-cervantes nahuel` (flag `-B` fuerza bcrypt). `chmod 640`, `chown root:www-data`.
   - Confirmar que nginx corre: `systemctl status nginx`. (Ya debería — es el que sirve el dominio principal.)
   - Confirmar OAuth vigente: `ls ~/.claude/.credentials.json` → debe existir. Si no, `claude setup-token` en el host.

3. **Construir imagen** (`docker/Dockerfile.cervantes`):
   - Base `debian:bookworm-slim`.
   - Node 22 via nodesource (lo necesita el CLI).
   - `claude` CLI via `curl -fsSL https://claude.ai/install.sh | sh -s -- --yes` → linkear `/root/.local/bin/claude` a `/usr/local/bin/claude`.
   - `tmux` y `ttyd` (bin oficial desde `https://github.com/tsl0922/ttyd/releases` — pinear versión 1.7.7).
   - Docker CLI (`docker-ce-cli`, `docker-compose-plugin`) desde el repo oficial.
   - Entrypoint via `tini`.
   - Sin `ANTHROPIC_API_KEY` en el env — crítico, si está, el CLI lo prefiere sobre OAuth y flippea billing de Max a API credit.

4. **Agregar servicio en docker-compose.yml**:
   ```yaml
   cervantes:
     build:
       context: .
       dockerfile: docker/Dockerfile.cervantes
       args:
         DOCKER_GID: ${HOST_DOCKER_GID:-999}
     container_name: cervantes
     restart: unless-stopped
     mem_limit: 2g
     cpus: 0.5
     ports:
       - "127.0.0.1:7681:7681"
     environment:
       - CERVANTES_WORKSPACE=/root/.openclaw/workspace-cervantes
       - SANCHO_WORKSPACE=/root/.openclaw/workspace-sancho
     volumes:
       - ${HOME}/.claude:/root/.claude
       - ${HOME}/.ssh:/root/.ssh:ro
       - ${PWD}:/workspaces/sanchocmo-openclaw
       - ${OPENCLAW_HOME:-~/.openclaw}:/root/.openclaw
       - /var/run/docker.sock:/var/run/docker.sock
   ```
   Binding a `127.0.0.1` — solo nginx (que corre en el host) llega. ttyd no necesita auth propia: nginx gate hace basic auth antes de proxear.

5. **Configurar nginx + cert**. En el VPS, sin tirar abajo nginx:
   - Copiar `docker/nginx/cervantes.conf.template` a `/etc/nginx/sites-available/cervantes` con el hostname sustituido (mismo patrón `sed "s/DOMAIN/$DOMAIN/g"` que `setup-vps.sh:73`).
   - `ln -sf /etc/nginx/sites-available/cervantes /etc/nginx/sites-enabled/cervantes`.
   - **Cert**: usar `certbot --nginx -d cervates-staging.sanchocmo.ai --non-interactive --agree-tos --email admin@sanchocmo.ai` — el plugin `--nginx` (ya instalado por `setup-vps.sh:49`) edita automáticamente el server block para insertar las líneas `ssl_certificate*` y añade el redirect `:80 → :443` sin reiniciar nginx; hace reload al final. No usar `--standalone` (apagaría nginx y tiraría MC).
   - `nginx -t && systemctl reload nginx`.
   - Log de verificación: `journalctl -u nginx -n 20` + `tail -f /var/log/letsencrypt/letsencrypt.log` durante la emisión.
   - Estructura del server block (resumen, el template tendrá el detalle):
     ```nginx
     server {
         listen 443 ssl;
         server_name cervates-staging.sanchocmo.ai;
         ssl_certificate     /etc/letsencrypt/live/cervates-staging.sanchocmo.ai/fullchain.pem;
         ssl_certificate_key /etc/letsencrypt/live/cervates-staging.sanchocmo.ai/privkey.pem;
         include /etc/letsencrypt/options-ssl-nginx.conf;
         ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

         auth_basic "Cervantes";
         auth_basic_user_file /etc/nginx/.htpasswd-cervantes;

         location / {
             proxy_pass http://127.0.0.1:7681;
             proxy_http_version 1.1;
             proxy_set_header Upgrade    $http_upgrade;
             proxy_set_header Connection "upgrade";
             proxy_set_header Host       $host;
             proxy_set_header X-Real-IP  $remote_addr;
             proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
             proxy_set_header X-Forwarded-Proto $scheme;
             proxy_read_timeout 300s;
         }
     }
     ```
   - El cert se renueva solo por el timer de certbot ya habilitado (`setup-vps.sh:84-85`).

6. **Levantar**:
   ```bash
   docker compose up -d --build cervantes
   docker exec cervantes claude --version   # confirma CLI instalado
   docker exec cervantes tmux ls            # confirma session "cervantes" creada por entrypoint
   docker exec cervantes claude -p "ping" --model haiku   # confirma OAuth activo
   ```

7. **Probar desde el browser**. `https://cervates-staging.sanchocmo.ai` → basic auth → terminal ttyd atacheado a tmux → ve el TUI de `claude` ya corriendo en `workspace-cervantes/`. Primer mensaje confirma que responde como Cervantes (con su CLAUDE.md/SOUL.md cargados).

## Verificación end-to-end

- [ ] `curl -sI https://cervates-staging.sanchocmo.ai/` sin auth → `401` + header `WWW-Authenticate: Basic realm="Cervantes"`.
- [ ] `curl -su "$USER:$PASS" https://cervates-staging.sanchocmo.ai/ | grep -i ttyd` → match.
- [ ] `curl -sI https://sanchocmo.ai/mc/api/health-check` sigue devolviendo `200` — nginx del dominio principal no se rompió al agregar el nuevo server block.
- [ ] `docker exec cervantes docker ps --format '{{.Names}}'` incluye `sanchocmo` (prueba DooD).
- [ ] En el browser: abrir tmux window nueva (`Ctrl+b c`), correr `docker compose -f /workspaces/sanchocmo-openclaw/docker-compose.yml logs --tail 5 sanchocmo` → devuelve logs reales.
- [ ] En el browser: `echo test >> /root/.openclaw/workspace-sancho/tmp/cervantes-write-test` → el archivo aparece en el host, prueba mount rw de workspace-sancho.
- [ ] En el TUI: `/model` → abre picker, cambiar a Sonnet, enviar prompt.
- [ ] En el TUI: `Shift+Tab` cicla modos, confirma "plan mode" / "auto-accept" visible.
- [ ] Abrir **segunda pestaña** del browser → engancha a la misma tmux session (o crear una nueva con `tmux new -s scratch && claude` en otra ventana) → correr una tarea larga en paralelo a la primera.
- [ ] `ls ~/.claude/projects/*/sessions/*.jsonl` en el host crece tras cada conversación nueva (persistencia).
- [ ] Cerrar el browser, reabrir, el TUI sigue donde quedó (tmux persiste).
- [ ] `systemctl status cervantes-claude-code` → `active (running)`. No se tocó.

## Riesgos y puntos abiertos

1. **Compartir tmux vs sesiones separadas por pestaña**. Por defecto, ttyd con `tmux attach` hace que todas las pestañas del browser vean la misma sesión (mirroring). Eso es bueno para "volver donde estabas" pero malo para paralelismo real: dos pestañas con la misma tmux = cursor duplicado. Solución: adentro de la sesión cada tarea paralela es una **ventana tmux distinta** (`Ctrl+b c`), y con `Ctrl+b n/p` o `Ctrl+b [0-9]` cambiás. Si preferís pestañas del browser independientes, cambiar el entrypoint de `tmux attach -t cervantes` a `tmux new-session -A -s "session-$(date +%s)"` para crear una sesión por conexión. Definir cuál querés en milestone 7.

2. **Docker GID drift**. Si el docker del host se reinstala, cambia el GID y el container pierde acceso al socket. Entrypoint lo re-checkea en runtime con `groupmod`.

3. **RAM**. 2-3 sesiones concurrentes de Claude Code pasan 600 MB-1 GB. El systemd actual tiene `MemoryMax=2G` — mantenemos el mismo cap en el compose. Upgradear el VPS si empieza a apretar.

4. **ToS Max**. Uso personal detrás de basic auth está dentro del espíritu; compartir la URL con terceros lo rompe. Documentar en el runbook.

5. **Retiro del systemd viejo**. Cuando el chat web sea estable, apagar `cervantes-claude-code.service` — fuera de alcance de este plan, decisión posterior del usuario.

6. **ttyd maintenance**. Último release 1.7.7 de marzo 2024. Sin riesgo material (bin estable y hace una sola cosa), pero si aparece un bug crítico de seguridad el fix puede no llegar rápido. Fallback si surge problema: `wetty` (Node, mantenimiento activo 2025/2026).
