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
- `formidable`, `@types/formidable` — Multipart parsing
