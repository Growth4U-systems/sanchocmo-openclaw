# Outreach B2B en Sancho

## Decisión de producto

Sancho es la única interfaz. YALC sigue siendo el motor headless que ejecuta búsqueda, enriquecimiento, guardrails, secuencias y sincronización con proveedores.

Sancho no debe copiar LinkedIn, Instantly ni un CRM completo. Debe llevar al usuario por este loop:

1. Crear una campaña.
2. Encontrar y enriquecer personas.
3. Generar y revisar la personalización.
4. Activar LinkedIn y/o email.
5. Mostrar respuestas que necesitan una decisión humana.

La unidad de trabajo visible es la campaña. Cada campaña muestra una sola siguiente acción. La complejidad técnica de cuentas, provider IDs, jobs y webhooks vive en Ajustes u observabilidad, no en el flujo diario.

## Superficie de Sancho

### Campañas

- Lista de campañas B2B, como en Partnerships.
- Cada campaña muestra target, canales, personas, personalizaciones y respuestas.
- Una sola CTA calculada desde el estado real: `Buscar personas`, `Completar datos`, `Generar personalización`, `Revisar y contactar`, `Ver campaña en marcha` o `Ver respuestas`.
- Crear campaña abre el flujo asistido de Sancho. No se pide al usuario que conozca YALC, Apollo, Unipile o Instantly.

### Personas

- Lista y pipeline de personas de la campaña seleccionada.
- Score, empresa, rol, canales utilizables y estado de contacto.
- Acciones excepcionales: descartar, pausar, reactivar y abrir el perfil.
- No contiene botones que simulen un envío cambiando solo el estado local.

### Mensajes

- Editor de la secuencia por canal.
- Vista de la personalización por persona.
- Para cada canal hay solo tres decisiones: generar/revisar, simular y aprobar/activar.
- La cuenta de envío se resuelve desde la configuración de la campaña. Los IDs técnicos no se escriben en esta pantalla.

### Respuestas

- Bandeja de acción, no espejo completo de LinkedIn o Instantly.
- Solo muestra respuestas nuevas, positivas, excepciones y conversaciones pendientes.
- Una respuesta detiene las secuencias activas de esa persona en todos los canales.
- En v1, la acción principal puede abrir la conversación en la herramienta de origen. Responder desde Sancho requiere soporte fiable para enviar dentro del `chat_id` existente.

## Contrato de ejecución

| Paso | Sancho | Motor de Outreach | Proveedor |
| --- | --- | --- | --- |
| Crear | Envía objetivo, target y canales | Crea campaña y devuelve `campaignId` | Ninguno |
| Buscar | Dispara búsqueda y muestra job | Busca, deduplica y asigna leads | Apollo o fuente configurada |
| Enriquecer | Muestra progreso y fallos por persona | Completa datos y calcula contactabilidad | Apollo/FullEnrich/Crustdata |
| Personalizar | Solicita generación y permite revisión | Persiste variables y mensajes por lead | Modelo configurado |
| LinkedIn | Envía items aprobados por lead | Aplica bloqueos, límites e idempotencia | Unipile |
| Email | Aprueba y publica una secuencia | Crea campaña, variables y leads | Instantly |
| Respuestas | Consulta bandeja y notifica | Normaliza webhook, guarda mensaje y detiene secuencia | Unipile/Instantly |

Los comandos que ya existen y deben ser el contrato estable son:

- `outbound.plan`
- `outbound.source`
- `outbound.enrich`
- `POST /campaigns/:id/leads/personalize` (conviene promoverlo a `outbound.personalize`)
- `outbound.linkedin_autopilot.plan`
- `outbound.linkedin_autopilot.execute`
- `outbound.approve_and_publish`
- `outbound.status`

Sancho debe tratar cada operación larga como job: `queued -> running -> succeeded|failed`, refrescar la campaña al terminar y mostrar el fallo del proveedor sin perder el estado local.

## Estado canónico de campaña

La UI no debe inferir el estado desde textos o botones. El backend debe devolver una fase canónica y su bloqueo:

| Fase | Condición mínima | Siguiente acción |
| --- | --- | --- |
| `draft` | Campaña creada | Buscar personas |
| `sourced` | Hay personas | Enriquecer |
| `enriched` | Hay canal utilizable | Personalizar |
| `personalized` | Mensajes/variables listos | Revisar |
| `approved` | Gate humano aprobado | Simular o activar |
| `running` | Provider run activo | Monitorizar |
| `needs_attention` | Reply, bloqueo o fallo | Resolver |
| `completed` | Secuencia terminada | Revisar resultados |

El estado debe incluir contadores de `total`, `contactable`, `personalized`, `approved`, `sent`, `replied`, `blocked` y `failed`, además de `nextAction` y `lastSyncedAt`.

## Scope v1

Incluye:

- Campañas B2B con LinkedIn, email o ambos.
- Búsqueda, enriquecimiento, scoring y deduplicación.
- Personalización persistida por persona.
- Revisión humana antes del primer envío real.
- Simulación sin escrituras externas.
- Activación en Unipile e Instantly.
- Stop-on-reply global por persona y protección contra doble envío.
- Bandeja de respuestas con enlace al origen.
- Estado de sincronización y errores recuperables.

No incluye:

- Clonar el inbox completo de LinkedIn o Instantly.
- Editor genérico de automatizaciones.
- Configuración manual de provider IDs en el flujo diario.
- Analytics avanzados, A/B testing o atribución de revenue.
- Responder desde Sancho hasta implementar envío por `chat_id` y threading fiable.

## Huecos para cerrar

### P0: loop operativo

1. Programar `campaign:track` como proceso periódico y observable. Hoy existe como comando, no como loop instalado por defecto.
2. Registrar automáticamente los webhooks de Unipile e Instantly y verificar firma, tenant e idempotencia.
3. Consolidar una respuesta en un stop global por persona para LinkedIn y email, incluso si aparece en otra campaña.
4. Exponer un estado canónico de campaña con `nextAction` y `lastSyncedAt`; la UI todavía lo infiere de leads y timestamps.
5. Probar live en staging con cuentas de test: crear campaña, enviar a un contacto controlado, recibir respuesta y detener follow-ups.

### P1: operación humana

1. Implementar `sendMessageInChat(chatId, text)` antes de permitir respuestas LinkedIn desde Sancho.
2. Añadir pausa/reanudación por persona y por campaña.
3. Unificar generación de personalización de email y LinkedIn bajo un comando estable.
4. Guardar el identificador externo de lead/thread de Instantly para reconciliar cambios de email.

### P2: optimización

1. Reporte por campaña y canal.
2. Variantes y aprendizaje de mensajes.
3. Recomendaciones automáticas basadas en respuestas y conversiones.

## Benchmark aplicado

- Apollo separa búsqueda, validación, alta en secuencia y seguimiento; además advierte duplicados y termina la secuencia al responder. Sancho debe conservar esos guardrails sin exponer toda la configuración: <https://knowledge.apollo.io/hc/en-us/articles/4409396985741-Add-Contacts-to-a-Sequence>
- Instantly separa editor de secuencia, variables de personalización y reglas de campaña como stop-on-reply. Sancho debe orquestarlas con defaults, no replicar cada ajuste: <https://help.instantly.ai/en/articles/11967303-getting-started-with-sequences-section> y <https://help.instantly.ai/en/articles/6222396-campaign-options>
- La personalización de Instantly se materializa como variables por lead y se previsualiza antes de lanzar. Ese es el contrato adecuado para email: <https://help.instantly.ai/en/articles/7893409-personalized-lines>
- Unipile distingue iniciar chat de responder en un chat existente y recomienda usar `chat_id` cuando existe. También entrega mensajes por webhook. Por eso la bandeja puede ser propia, pero el compositor de respuestas debe esperar al threading correcto: <https://developer.unipile.com/docs/send-messages> y <https://developer.unipile.com/docs/new-messages-webhook>
- Clay demuestra que el enriquecimiento puede ser condicional y encadenado, pero esa complejidad pertenece al motor. Sancho solo necesita mostrar resultado, coste/fallo y siguiente acción: <https://university.clay.com/docs/enrichments>

## Definición de terminado

Outreach B2B está cerrado cuando un usuario puede, sin conocer los proveedores:

1. Crear una campaña desde Sancho.
2. Obtener personas reales y ver por qué encajan.
3. Generar y editar la personalización.
4. Simular y activar LinkedIn/email con confirmación explícita.
5. Ver el estado real de cada envío.
6. Recibir una respuesta en Sancho y comprobar que se detuvieron los follow-ups.
7. Recuperarse de un fallo del proveedor sin duplicar mensajes.

