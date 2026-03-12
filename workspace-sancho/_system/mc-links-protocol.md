# Mission Control Links Protocol

> Todos los links a Mission Control DEBEN incluir un token de acceso. URLs sin token devuelven 403.

## URL Base
`https://sancho-cmo.taild48df2.ts.net/mc`

## Tipos de Acceso

### 1. Portal de Cliente (`/portal/{mcToken}/`)
- **Cuándo**: Compartiendo links en el guild de Discord del cliente
- **Scope**: Solo ve SU carpeta brand — no ve otros clientes, ni system, ni memory
- **Token**: Campo `mcToken` del cliente en `clients.json`
- **Lookup**: `group_space` del mensaje → buscar en `clients.json` por `guild` → obtener `mcToken`

**URLs disponibles:**
```
/mc/portal/{mcToken}/                     → Dashboard del cliente
/mc/portal/{mcToken}/docs/{section}/      → Documentos (brand/{slug}/{section})
/mc/portal/{mcToken}/docs/{section}/{file} → Documento específico
/mc/portal/{mcToken}/connect/{apiId}      → Página de conexión de API
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
