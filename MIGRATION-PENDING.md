# Mission Control — Pendientes de configuración

Migración de features de producto completada 2026-04-08.
Todo el código ya está en `~/Projects/mission-control/`.

---

## CRÍTICO — Sin esto no arranca

### 1. Variables de entorno

Añadir a `.env.local` (desarrollo) y Vercel (producción):

```
# Neon PostgreSQL
DATABASE_URL=                           # Connection string de Neon

# Polar (pagos)
POLAR_ACCESS_TOKEN=                     # Token de Polar SDK
POLAR_SERVER=sandbox                    # "sandbox" o "production"
POLAR_WEBHOOK_SECRET=                   # Secret para verificar webhooks
NEXT_PUBLIC_STARTER_TIER=               # Product ID del plan Starter

# Cloudflare R2 (upload imágenes)
CLOUDFLARE_ACCOUNT_ID=
R2_UPLOAD_IMAGE_ACCESS_KEY_ID=
R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY=
R2_UPLOAD_IMAGE_BUCKET_NAME=
R2_PUBLIC_URL=                          # URL pública del bucket
```

### 2. Base de datos — Drizzle migrations

```bash
cd ~/Projects/mission-control
npx drizzle-kit generate    # genera SQL en src/db/migrations/
npx drizzle-kit push        # crea tablas en Neon
```

Tablas: `user`, `session`, `account`, `verification`, `subscription`.

### 3. Polar — registrar webhook

En el dashboard de Polar:
- URL: `https://<mc-domain>/api/polar/webhook`
- Eventos: `subscription.created`, `subscription.active`, `subscription.canceled`, `subscription.revoked`, `subscription.uncanceled`, `subscription.updated`
- Secret: el mismo que `POLAR_WEBHOOK_SECRET`

> Nota: la verificación actual es simple (header match). Considerar HMAC en producción.

---

## NECESARIO — Funcionalidad incompleta sin esto

### 4. Cloudflare R2 — crear bucket

- Crear bucket en Cloudflare R2
- Habilitar acceso público (o custom domain)
- Crear API token con permisos de escritura
- `R2_PUBLIC_URL` = dominio público del bucket

### 5. next.config.mjs — dominios de imagen

Para que `<Image>` de Next.js funcione con R2:

```js
images: {
  remotePatterns: [{ protocol: "https", hostname: "**.r2.dev" }],
},
```

### 6. Sidebar — links a nuevas páginas

`src/components/layout/Sidebar.tsx` no tiene links a:
- `/dashboard/upload` — Upload de imágenes
- `/dashboard/payment` — Gestión de suscripción

Decidir en qué sección van (¿Sistema? ¿Nuevo grupo?).

---

## NICE TO HAVE — Puede esperar

### 7. Landing page

`src/pages/index.tsx` hoy es solo un botón de login. Pendiente:
- Diseñar landing real de SanchoCMO
- Incluir links a `/pricing`, `/terms-of-service`, `/privacy-policy`

### 8. Middleware

El middleware (`src/middleware.ts`) solo protege `/dashboard/*`.
Las rutas públicas (`/pricing`, `/success`, `/privacy-policy`, `/terms-of-service`) ya están fuera del matcher.
Si se amplía el matcher en el futuro, recordar que estas deben ser públicas.

### 9. Settings — billing tab

`src/pages/dashboard/admin/settings.tsx` ya existe pero no tiene tab de billing.
Se podría integrar la vista de orders/historial de pagos ahí en vez de en `/dashboard/payment` (o en ambos).

---

## Archivos añadidos en la migración

**DB:**
- `src/db/drizzle.ts` — Conexión Neon PostgreSQL
- `src/db/schema.ts` — Tablas user/session/account/verification/subscription
- `drizzle.config.ts` — Config Drizzle Kit

**Pagos (Polar SDK):**
- `src/lib/polar.ts` — Cliente Polar SDK
- `src/lib/subscription.ts` — Helpers: getSubscriptionDetails, isUserSubscribed, getUserSubscriptionStatus
- `src/pages/api/polar/checkout.ts` — Crear sesión de checkout
- `src/pages/api/polar/portal.ts` — Portal de cliente
- `src/pages/api/polar/webhook.ts` — Webhooks de Polar (upsert subscriptions)
- `src/pages/api/polar/subscription.ts` — GET estado de suscripción

**Upload imágenes (Cloudflare R2):**
- `src/lib/upload-image.ts` — S3 client → Cloudflare R2
- `src/pages/api/upload-image.ts` — API route de upload
- `src/pages/dashboard/upload.tsx` — UI drag & drop

**Páginas producto:**
- `src/pages/pricing.tsx` — Tabla de precios con checkout
- `src/pages/success.tsx` — Confirmación post-pago
- `src/pages/privacy-policy.tsx` — Política de privacidad
- `src/pages/terms-of-service.tsx` — Términos de servicio
- `src/pages/dashboard/payment.tsx` — Gestión de suscripción

**Dependencias añadidas:**
- `drizzle-orm`, `@neondatabase/serverless` — DB
- `drizzle-kit` (dev) — Migrations
- `@polar-sh/sdk` — Pagos
- `@aws-sdk/client-s3` — Upload R2

---

## SAN-183 F5: foundation-state.json retirado — status vive en tasks (2026-06-13)

**Contexto:** Foundation status unificado en tasks. `foundation-state.json` está MUERTO como store: el status de cada pilar vive en su task 1:1 (proyectos P00-Company-Brief / P00-Full-Foundation / P00-Metrics / P00-Strategic-Plan).

- **Vocabulario canónico** (el de task, único válido en prosa nueva): `todo | in-progress | pending-review | completed | blocked | cancelled`. El vocabulario viejo de pilar (not-started/approved/generated/request-changes/request-refresh) está muerto; el endpoint MC todavía normaliza aliases transicionalmente.
- **Escribir status**: `POST {MC_BASE}/api/brand-brain/pillar-status` body `{"slug","section","pillar","status"}` (status canónico).
- **Leer estado completo**: `GET {MC_BASE}/api/brand-brain/state?slug={slug}` (mismo shape: sections→pillars→status, statuses en vocabulario de task).
- **Task genérica**: `POST {MC_BASE}/api/projects/task-status` body `{"slug","taskId","status"}`.
- `file_index` y `brand_summary` muertos: nada los lee; el Brand Snapshot se deriva automáticamente del company-brief.
- Skill `foundation-threads` (hilos Discord por pilar) ELIMINADA — Discord retirado.
- Esto deja **superseded** la sección de abajo (`update-pillar-status.py` helper): el helper escribía al JSON muerto; usar los endpoints.

---

## Sancho-side: migración a `update-pillar-status.py` helper — ⚠️ SUPERSEDED por SAN-183 F5 (era ✅ HECHO 2026-04-14)

**Contexto:** Bug #4 (2026-04-13) — drift entre `foundation-state.json` y `<project>/tasks.json` porque Sancho escribía `status: "done"` direct al JSON pero el endpoint MC rechazaba ese valor.

**Lo aplicado en MC** (ya está en main):
- Helper centralizado `src/lib/data/pillar-task-sync.ts` (`setPillarStatus`, `setTaskStatus`, `reconcilePillarTasks`) con atomic dual-write y status alias normalization.
- `POST /api/foundation/pillar-status` ahora acepta `done` / `completed` / `approved` (todos aliases del mismo canonical).
- `GET /api/foundation/state?slug=X` corre `reconcilePillarTasks(slug)` automáticamente antes de devolver — self-healing on read.
- Rollup automático de section.status (de pillars) y project.status (de tasks).

**Lo aplicado en Sancho-side**:
- Helper Python `~/.openclaw/workspace-sancho/scripts/update-pillar-status.py` que:
  1. Escribe atomically a `foundation-state.json` (.tmp + rename).
  2. Marca `updated_at` y `approved_at` cuando el status es done/completed/approved.
  3. Dispara `GET /api/foundation/state?slug={slug}` en MC para activar reconcile inmediato.
  4. Si MC no está corriendo, el write directo sigue ocurriendo y MC reconciliará en el próximo fetch (no se pierde nada).
- `~/.openclaw/workspace-sancho/skills/foundation-orchestrator/SKILL.md` actualizado para usar el helper en lugar de write directo cuando actualice pillar status.

**Skills aún por migrar (opcional, no urgente)**:
- Cualquier otra skill que escriba `foundation-state.json[sections.*.pillars.*.status]` directamente debería usar el helper. La búsqueda inicial encontró 5 archivos relevantes (foundation-orchestrator, strategic-plan, foundation-threads, sancho-manager, gtm-orchestrator) — solo foundation-orchestrator está migrada hoy.
- **No es bloqueante** porque el reconcile-on-read en MC cubre cualquier escritura directa que Sancho siga haciendo. Migrar el resto es nice-to-have para que el sync sea instantáneo (no ON-load del UI).

**Cómo invocar el helper desde un skill SKILL.md:**
```bash
python3 scripts/update-pillar-status.py \
  --slug {slug} \
  --section {section} \
  --pillar {pillar} \
  --status done \
  [--comment "..."]
```
- `formidable`, `@types/formidable` — Multipart parsing
