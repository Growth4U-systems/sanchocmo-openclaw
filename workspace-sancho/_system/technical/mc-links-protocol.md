# Mission Control Links Protocol

> Todos los links a Mission Control DEBEN incluir un token de acceso. URLs sin token devuelven 403.

## URL Base
- `{MC_BASE_URL}` se reemplaza al arranque del contenedor (ver `docker/inject-env-vars.sh`) por `${BASE_URL}/mc` — la URL canónica del deployment.
- Si en este documento ves `{MC_BASE_URL}` literal (sin reemplazar), la inyección no corrió: **no generes el link**, avisa al usuario que la instancia no está configurada.
- **NUNCA inventes un hostname distinto** al que aparece en los ejemplos de este doc — el host que ves es el host pre-resuelto para este deployment.

## Tipos de Acceso

### 1. Portal de Cliente (`/portal/{mcToken}/`)
- **Cuándo**: Compartiendo links en el guild de Discord del cliente
- **Scope**: Solo ve SU carpeta brand — no ve otros clientes, ni system, ni memory
- **Token**: Campo `mcToken` del cliente en `clients.json`
- **Lookup**: `group_space` del mensaje → buscar en `clients.json` por `guild` → obtener `mcToken`

**URLs disponibles:**
```
/mc/portal/{mcToken}/                                          → Dashboard del cliente
/mc/portal/{mcToken}/docs/brand/{slug}/                        → Raíz de docs del cliente
/mc/portal/{mcToken}/docs/brand/{slug}/{section}/              → Sección (ej: campaigns/, foundation/)
/mc/portal/{mcToken}/docs/brand/{slug}/{section}/{file}.md     → Documento específico
/mc/portal/{mcToken}/connect/{apiId}                           → Página de conexión de API
```

**⚠️ IMPORTANTE: La ruta SIEMPRE incluye `brand/{slug}/` después de `/docs/`.**

❌ INCORRECTO: `/mc/portal/{token}/docs/campaigns/archivo.md`
✅ CORRECTO:   `/mc/portal/{token}/docs/brand/example/campaigns/archivo.md`

**Ejemplo completo (Example):**
```
{MC_BASE_URL}/portal/730a6de7b765cdaf15131aa46a31a610/docs/brand/example/campaigns/fase-1-guiones-google-ads.md
```

### 2. Admin (`/admin/{adminToken}/`)
- **Cuándo**: Uso interno (Cervantes Brain guild `1478770422093709502`) o comunicación admin
- **Scope**: Acceso completo — todos los clientes, docs, APIs, health checks
- **Token**: Campo `adminToken` (raíz) en `clients.json`

**URLs disponibles:**
```
/mc/admin/{adminToken}/                          → MC Dashboard completo
/mc/admin/{adminToken}/docs/brand/{slug}/{path}  → Docs de cualquier cliente
/mc/admin/{adminToken}/connect/{slug}/{apiId}    → Connect page de cualquier cliente
/mc/admin/{adminToken}/api/*                     → Todas las APIs del sistema
```

### 3. Landing (`/mc/`)
- Sin token → página genérica "Usa tu enlace de acceso"
- No expone nada

## Algoritmo para Generar Links

```
1. Leer group_space del mensaje entrante
2. Si group_space == "1478770422093709502" (Cervantes Brain):
   → Leer adminToken de clients.json
   → Base URL: /mc/admin/{adminToken}/
3. Si no:
   → Buscar cliente donde guild == group_space en clients.json
   → Leer mcToken del cliente encontrado
   → Base URL: /mc/portal/{mcToken}/
4. Construir URL completa con el path necesario
```

## Reglas

1. **NUNCA** generar links tipo `/mc/docs/...` o `/mc/connect/...` sin token
2. **NUNCA** compartir el adminToken en un guild de cliente
3. **NUNCA** compartir el mcToken de un cliente en otro guild de cliente
4. Si no encuentras el guild en clients.json → no generar link, avisar al usuario
5. Los tokens se pueden rotar editando `clients.json` — efecto inmediato sin restart

## Rotación de Tokens

Para regenerar un token:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```
Editar `clients.json` → reemplazar el token → los links viejos dejan de funcionar inmediatamente.
