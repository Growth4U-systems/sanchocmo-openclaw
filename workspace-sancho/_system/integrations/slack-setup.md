# Conectar Slack a SanchoCMO

> Esta guía es **universal** — sirve para cualquier cliente. Cada cliente
> conecta su propio workspace de Slack creando un Slack App propio en su
> cuenta. SanchoCMO solo guarda los tokens de cada cliente y los usa para
> enviar el Editorial Dispatch al canal que elijas.

## Qué obtienes al conectar

- 📬 **Editorial Dispatch en Slack**: cada mañana el cron envía 3-5 candidatas
  de contenido al canal que configures
- ✅ **Aprobación con botones** (próximamente): elegir qué publicar sin escribir,
  solo con `Aprobar` / `Más tarde` / `Rechazar`
- 💬 **Notificaciones generales**: alertas de health-check, recordatorios, etc.

## Pasos (15 min)

### 1. Crea un Slack App nuevo

1. Ve a [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Nombre: `SanchoCMO {tu-empresa}` (ej: `SanchoCMO Growth4U`)
4. Workspace: elige el workspace donde lo quieres instalar
5. Click **Create App**

### 2. Configura OAuth scopes

En el menú izquierdo, ve a **OAuth & Permissions**. En la sección
**Scopes → Bot Token Scopes** añade:

| Scope | Para qué |
|-------|----------|
| `chat:write` | Enviar mensajes al canal |
| `chat:write.public` | Enviar a canales donde el bot no es miembro (opcional) |
| `channels:read` | Listar canales públicos |
| `groups:read` | Listar canales privados |
| `channels:history` | Leer mensajes (para detectar respuestas a dispatches) |
| `groups:history` | Leer mensajes en canales privados |
| `commands` | Habilitar slash commands (futuro) |

### 3. (Opcional, para botones interactivos) Habilita interactividad

> Esto solo es necesario cuando quieras los botones Aprobar/Más tarde/Rechazar
> en los mensajes de dispatch. Hoy no es obligatorio — sin esto el dispatch
> sigue funcionando, simplemente respondes con texto en el thread.

1. En **Interactivity & Shortcuts**, activa **Interactivity**
2. **Request URL**: `https://{tu-mc-domain}/api/integrations/slack/interactivity`
   - En dev: `https://localhost:3000/api/integrations/slack/interactivity`
   - En producción: la URL pública de tu Mission Control
3. Save

### 4. Instala el app en tu workspace

1. En **OAuth & Permissions**, click **Install to Workspace** (arriba)
2. Slack te pedirá confirmar los permisos. Click **Allow**
3. Te devuelve un **Bot User OAuth Token** que empieza por `xoxb-...`
4. **Copia ese token** — lo necesitas en el siguiente paso

### 5. Coge el Signing Secret

1. En **Basic Information** (menú izquierdo)
2. Sección **App Credentials**
3. Copia el **Signing Secret**

### 6. Coge el Channel ID donde quieres recibir los dispatches

1. En Slack, ve al canal donde quieres recibir el Editorial Dispatch
2. Click en el nombre del canal (arriba) → **About** → **Channel ID** (abajo)
3. O alternativamente: click derecho en el canal en la sidebar → **Copy link**
   → del enlace `https://workspace.slack.com/archives/C0123ABCDEF` coge `C0123ABCDEF`
4. Empieza con `C` si es público, `G` si es privado

### 7. Invita al bot al canal

En el canal de Slack, escribe:
```
/invite @SanchoCMO {tu-empresa}
```
(o el nombre que le hayas puesto al app)

### 8. Conecta en Mission Control

1. Ve a **MC UI → Settings → 🔌 APIs**
2. Busca **Slack** en la categoría Infraestructura
3. Click **Conectar**
4. Pega:
   - **Bot User OAuth Token**: `xoxb-...`
   - **Signing Secret**: el que copiaste en paso 5
   - **Workspace**: nombre del workspace (ej: `growth4u`)
   - **Channel ID para Editorial Dispatch**: `C0123ABCDEF`
   - (Opcional) **Channel ID para aprobaciones**: si distinto al anterior
5. Click **Test connection** — debería responder con un mensaje en el canal

✅ Listo. El próximo dispatch (cron de las 8:30am o cuando lo lances manualmente
desde Ideas tab) llegará al canal de Slack que configuraste.

## Troubleshooting

### El test connection falla con "channel_not_found"
El bot no es miembro del canal. Vuelve al canal y escribe `/invite @SanchoCMO ...`.

### Error "missing_scope"
El bot no tiene los scopes necesarios. Vuelve a OAuth & Permissions, añade el scope que te diga el error, y **reinstala el app** (importante).

### El bot no puede enviar en un canal privado
Necesita `groups:read` + `groups:history` + ser invitado al canal con `/invite`.

### Los botones interactivos no funcionan
Verifica:
- Has activado Interactivity en el paso 3
- El Request URL es accesible públicamente (no localhost si Mission Control está en otra red)
- Has guardado el Signing Secret en MC UI

## Roadmap

- [x] Editorial Dispatch envía mensajes a Slack
- [ ] Botones interactivos (Aprobar / Más tarde / Rechazar) — pendiente endpoint `/api/integrations/slack/interactivity`
- [ ] Slash commands (`/sancho dispatch`, `/sancho status`)
- [ ] Modal de "Ver doc" desde Slack

## Coste

Slack APIs son gratis para uso normal. Solo pagas si superas los rate limits del tier free, lo cual no pasará con el volumen de SanchoCMO (~5-10 mensajes/día por cliente).
