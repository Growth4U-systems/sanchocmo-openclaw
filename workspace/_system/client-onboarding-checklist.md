# Client Onboarding Checklist — Infraestructura

> Lo que hay que configurar ANTES de empezar Foundation. Es infra, no estrategia.

## Paso 1: Datos básicos
- [ ] Nombre del cliente
- [ ] Slug (identificador: `hospital-capilar`, `acme-corp`)
- [ ] URL principal
- [ ] Sector/industria
- [ ] Contacto principal (nombre, email, timezone)

## Paso 2: Discord
- [ ] Crear canales del cliente (o usar los existentes del guild)
- [ ] Verificar bindings agente↔canal
- [ ] Allowlist del contacto principal

## Paso 3: Google Workspace
- [ ] Cuenta Gmail conectada (gog auth si es nueva)
- [ ] Identificar carpeta de Google Drive para meetings → `folder_id`
- [ ] Identificar si usan Google Calendar → eventos relevantes

## Paso 4: Notion (si aplica)
- [ ] Identificar workspace
- [ ] DB de meeting notes → `database_id`
- [ ] DB de tareas/proyectos (si existe)
- [ ] Verificar que el API key tiene acceso

## Paso 5: Meeting tools
- [ ] ¿Qué usan? (Fathom / Granola / Otter / solo Google Meet / Zoom)
- [ ] Configurar integración:
  - Fathom → email-forward con Gmail label
  - Granola → notion-sync (apunta al source Notion)
  - Otter → Google Drive export o API
  - Solo Meet → transcripts en Google Drive

## Paso 6: Comunicación interna
- [ ] ¿Slack? → channels + token
- [ ] ¿Teams? → no soportado aún
- [ ] ¿Solo email? → Gmail labels

## Paso 7: Competidores (para Thief Marketer)
- [ ] Listar 3-5 competidores principales
- [ ] Por cada uno: website, blog, LinkedIn, Instagram, YouTube, newsletter
- [ ] ¿Tienen Google Ads activos?

## Paso 8: Generar `brand/sources.json`
- [ ] Rellenar todos los IDs recopilados
- [ ] Habilitar/deshabilitar sources según lo que tenga el cliente
- [ ] Verificar que los crons pueden acceder a cada source

## Paso 9: Verificación
- [ ] Ejecutar Daily Pulse manual → ¿extrae datos?
- [ ] Ejecutar Meeting Intelligence manual → ¿encuentra notas?
- [ ] Dashboard regenerado con datos del cliente

## Output
Cliente listo para empezar Foundation con toda la infra configurada.
