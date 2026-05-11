# Sancho Observations — 2026-04-25

## Resumen sesiones (últimas 24h)

| Sesión | Canal | Output | Estado |
|--------|-------|--------|--------|
| Morning Metrics Growth4U | Discord (#intelligence Growth4U) | Reporte métricas + hilo | ✅ OK |
| Morning Metrics Hulahoop | — | "Sin APIs configuradas" | ✅ OK (correcto) |
| Daily Pulse Growth4U | Discord (#intelligence Growth4U) | Reporte + micro-briefs | ✅ OK |
| Daily Pulse Hospital Capilar | Discord | Reporte (canales todos silenciosos) | ✅ OK |
| Lead Sync Growth4U | — | 11 leads procesados, archivos actualizados | ⚠️ Parcial |
| Weekly Strategy Report Criptan | — | **ABORTADO** — archivo NO guardado | ❌ FAIL |
| Call Prep Weekly Growth4U | Discord (#intelligence Growth4U) | 0 llamadas cliente semana 27abr-1may | ✅ OK |
| Meeting Intelligence | Discord | Sin reuniones nuevas | ✅ OK |
| Social & Content Review Criptan | — | Informe guardado, mensaje a #intelligence | ✅ OK |
| Cost Tracker Daily | — | Sin anomalías | ✅ OK |

---

## Errores y skills fallidos

### 🔴 Crítico — Weekly Strategy Report Criptan (ABORTADO)
- **Sesión**: `agent:sancho:cron:41d660cb-c18f-4268-aa95-6275f2435f90`
- **Problema**: Sesión murió en write (~seq 20) — output truncado, archivo NO guardado
- **Mismo patrón que la semana pasada** (Cervantes alertó el 23 abr)
- **Impacto**: Review del 30 abr en 6 días — Criptan no tiene Strategy Report
- **Causa probable**: Generación de contenido extenso + thinking largo → timeout/abort

### 🟡 Lead Sync Growth4U — Discord posting fallido
- **Sesión**: `agent:sancho:cron:a68143d8-1309-46eb-a5dc-4c3fb35ee3d2`
- **Problema**: Bot no tiene acceso al canal `1477741644789842031` (Growth4U #intelligence)
- **Error**: `unknown channel` — 4 intentos de message() fallaron
- **Impacto**: Reporte no llegó a Discord, sync de archivos sí se completó
- **Nota**: Morning Metrics y Daily Pulse SÍ publicaron correctamente en ese canal — inconsistencia

### 🟡 Instantly campaigns error
- **Error**: `(campaigns || []) is not iterable` en metrics-collector
- **Sesión**: Morning Metrics Growth4U (secundario, no bloquó el reporte)
- **Impacto**: Campañas de Instantly no incluidas en reporte

---

## Preguntas sin responder / conocimientos no disponibles
- N/A — todas las sesiones fueron crons automatizados, no hubo interacción humana

---

## Reglas de canal — cumplimiento
- ✅ Growth4U — Morning Metrics正确的 publicó en #intelligence (channel ID correcto)
- ✅ Hulahoop — Respondió "Sin APIs configuradas" sin publicar en Discord
- ✅ Context isolation — sin leaks entre clientes
- ⚠️ Inconsistencia Discord: Lead Sync no pudo publicar donde Morning Metrics sí pudo

---

## Patrones de mejora

### 1. Criptan crons abortando consistentemente
**Desde**: Hace ~2 semanas (Cervantes detectó el patrón el 23 abr)
**Patrón**: Sesiones que generan contenido largo (Weekly Strategy Report, B2B Pipeline Review) mueren antes del write
**Hipótesis**: Modelo (MiniMax-M2.7) genera thinking extenso → consume contexto → aborta por timeout
**Evidence**: 2 aborts consecutivos en Weekly Strategy Report, 1 abort en B2B Pipeline Review
**Acción requerida**: Regenerar Weekly Strategy Report manualmente; revisar skill para partir generación o reducir thinking

### 2. Discord channel access inconsistency
**Patrón**: Morning Metrics y Daily Pulse publican correctamente en `#1477741644789842031`; Lead Sync falla con "unknown channel"
**Hipótesis**: El accountId "discord" vs "sancho" causa routing diferente, o hay race condition en guild resolution
**Acción requerida**: Investigar por qué some crons ven el canal y others no

### 3. Growth4U — CPC subiendo, leads bajando
**Métricas ayer** (24 abr): 1 lead (vs media 7d: 3.0/día), CPC €4.22 (vs media €4.01)
**Spend**: €160 (vs media €142) — gastando más, generando menos
**Tendencia**:ligera degradación vs días anteriores (5 leads el 23 abr)
**Acción requerida**: Monitorizar — si mañana mismo patrón, ajustar bidding

### 4. Funnel lead→cita sigue roto (DÍA 22+)
**Estado**: 22 leads con tag `llamada-agendada` vs casi 0 calls en calendario
**Observado ya**: Cervantes alertó el 22 abr, Alfonso sabe
**Nuevo**: 0 citas en appointments GHL (últimas 24h)
**Acción requerida**: Sin cambio — es problema del equipo de Alfonso, no de Sancho

---

## Acciones recomendadas

| Prioridad | Acción | Owner |
|----------|--------|-------|
| P0 | Regenerar Weekly Strategy Report Criptan manualmente (review 30 abr) | Cervantes |
| P1 | Investigar Discord channel access inconsistency (Lead Sync vs Morning Metrics) | Cervantes |
| P2 | Revisar skill Lead Sync para partir generación o reducir longitud output | Cervantes |
| P3 | Monitorizar CPC Growth4U mañana (si sigue >€4.50, ajustar bidding) | Sancho (next heartbeat) |

---

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-04-25 08:00 UTC_

---

# Sancho Observations — 2026-04-26

## Resumen sesiones (últimas 24h)

| Sesión | Canal | Output | Estado |
|--------|-------|--------|--------|
| Morning Metrics Growth4U | Discord (#intelligence Growth4U, hilo) | Reporte + alertas | ✅ OK |
| Morning Metrics Hulahoop | — | "Sin APIs configuradas" | ✅ OK (correcto) |
| Cost Tracker Daily | — | Sin anomalías, sin posts | ✅ OK |
| update-skills | — | Corey Haines + Anthropic actualizados | ✅ OK |
| Lead Sync Growth4U | Discord (#intelligence) | 11 leads procesados (ninguno nuevo) | ✅ OK |
| Heartbeat (3:20 AM) | — | Sin eventos | ✅ OK |

**Nota**: No hubo Daily Pulse hoy — posible que no esté configurado para domingos o aún no ha ejecutando (son 10 AM).

---

## Errores y skills fallidos

### 🟡 Growth4U — 0 leads Meta Ads (SEGUNDO DÍA CONSECUTIVO)
- **Sesión**: Morning Metrics Growth4U
- **Datos ayer (25 abr)**:
  - Spend: €106.30 (el más bajo de la semana, -24% vs media €139.26)
  - Leads: **0** (segundo día sin leads — 24 abr ya tuvo 1)
  - CPC: €4.62 (↑ vs €4.22 del 24 abr)
  - CTR: 0.79% (bajo)
- **Contexto**: Ayer Alfonso tenía el día libre (sábado) — possível que no supervisara campañas
- **Alerta**: Ya no es anomalía de un día — es tendencia de 2 días. Si mañana (domingo) sigue sin leads, hay que actuar.
- **Progreso**: Cervantes ya alertó ayer. Alfonso no ha respondido aún.

### 🟡 update-skills — canal Discord no registrado
- **Canal**: `1481220331845976125` (intentado por update-skills)
- **Problema**: Canal no existe en openclaw.json — mismo error que ayer
- **Impacto**: No crítico (el cron delivery usa su propia ruta), pero el message tool explícito falla
- **Acción requerida**: Cervantes — registrar el canal o investigar por qué el cron intenta usar message tool directamente

### 🟡 Instantly campaigns error
- **Error**: `(campaigns || []) is not iterable` en metrics-collector
- **Sesión**: Morning Metrics Growth4U (secundario, no bloquó el reporte)
- **Impacto**: Campañas de Instantly no incluidas en reporte
- **Acción requerida**: Cervantes — fix en metrics-collector ( Skill Quality)

---

## Preguntas sin responder / conocimientos no disponibles
- N/A — todas las sesiones fueron crons automatizados, no hubo interacción humana

---

## Reglas de canal — cumplimiento
- ✅ Growth4U — Morning Metrics publicó correctamente en hilo de Discord
- ✅ Hulahoop — Respondió "Sin APIs configuradas" sin publicar en Discord
- ✅ Context isolation — sin leaks entre clientes
- ✅ Lead Sync usó raw HTTP curl para publicar cuando message tool falló — workaround efectivo
- ⚠️ Canal 1481220331845976125 sigue sin existir en openclaw.json

---

## Patrones de mejora

### 1. Growth4U — Degradación продолжается (День 2)
**Métricas**:
- 24 abr: 1 lead, €160 spend, CPC €4.22
- 25 abr: 0 leads, €106.30 spend, CPC €4.62
- Tendencia: spend ↓ pero leads ↓↓ (más ineficiente)
- **Hipótesis**: Creative burnout o audiencia desalineada
- **Umbral de actuación**: Si mañana (domingo) 0 leads → proponer test A/B o revisión de creativo

### 2. Criptan Weekly Strategy Report — NO se ejecutó hoy (era ayer)
- **Patrón detectado ayer**: crons de Criptan abortan consistentemente
- **Sesión Weekly Strategy**: No aparece en la lista de últimas 24h → o no se ejecutó o se abortó silenciosamente
- **Review**: 30 abr (en ~4 días) — Criptan necesita el reporte
- **Acción requerida**: Cervantes — regenerar manualmente si no existe archivo

### 3. Discord channel access — inconsistency sigue
- Morning Metrics: publicó correctamente (message tool)
- Lead Sync: falló message tool → usó curl HTTP workaround
- **Hipótesis**: accountId routing diferente o timing de guild resolution
- **Acción requerida**: Cervantes — documentar el workaround en skills que lo necesiten

---

## Acciones recomendadas

| Prioridad | Acción | Owner |
|----------|--------|-------|
| P0 | Si mañana 0 leads Growth4U → proposer test A/B creativo | Sancho (cron) |
| P1 | Registrar canal 1481220331845976125 en openclaw.json | Cervantes |
| P1 | Regenerar Weekly Strategy Report Criptan (review 30 abr) | Cervantes |
| P2 | Fix Instantly `(campaigns \|\| []) is not iterable` en metrics-collector | Cervantes |
| P2 | Documentar workaround HTTP curl en Lead Sync skill | Cervantes |
| P3 | Verificar que Daily Pulse existe y está configurado para domingos | Cervantes |

---

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-04-26 08:00 UTC_

---

# Sancho Observations — 2026-04-30

## Resumen sesiones (últimas 24h)

| Sesión | Canal | Output | Estado |
|--------|-------|--------|--------|
| MiCA Playbook Content Generation | MC-Chat (Growth4U content) | Blog SEO ~2.5K + LinkedIn post | ✅ OK |
| Editorial Dispatch (P-Content-Semana-18-T02) | MC-Chat (group) | 5 ideas seleccionadas, bloqueado por Slack | 🟡 Parcial |
| Heartbeat | — | Sin eventos | ✅ OK |

---

## Errores y skills fallidos

### 🟡 Editorial Dispatch — Slack missing_scope
- **Sesión**: `aa5f1561` | **Model**: Opus 4.6
- **Problema**: `missing_scope` — Slack Bot Token no tiene `chat:write` para publicar en `#linkedin-content-generation`
- **Impacto**: 5 piezas de contenido listas pero NO publicadas en Slack
- **Acción requerida**: Añadir scope `chat:write` + `chat:write.public` al Slack App de Growth4U
- **Nota**: Contenido está generado correctamente, solo bloqueado por config. P-Content-Semana-18-T02 creada y esperando.

### 🟡 Heartbeat — `gog` command no existe (recurrente)
- **Sesión**: `7c666419` | **Model**: MiniMax-M2.7 (heartbeat, no T3)
- **Problema**: HEARTBEAT.md referencia `gog gmail inbox` pero el comando no existe en OpenClaw CLI actual
- **Patrón**: Ya detectado el 27 abr. Sancho intentó troubleshooting pero no pudo resolverlo
- **Impacto**: Bajo — heartbeat completó con HEARTBEAT_OK sin email check
- **Acción**: Cervantes necesita decidir si instalar skill `gog` o quitar la referencia de HEARTBEAT.md

---

## Preguntas sin responder
- N/A — todas las sesiones fueron crons automatizados o MC-Chat tasks, sin interacción humana directa

---

## Reglas de canal — cumplimiento
- ✅ Growth4U MiCA content — output guardado en archivos correctos (`brand/growth4u/campaigns/content/`)
- ✅ Editorial Dispatch — intentó publicar en Slack canal correcto, falló por scope (no por regla de canal)
- ✅ Context isolation — sin leaks entre clientes
- ✅ Heartbeat — NO_REPLY correcto para async notifications

---

## Patrones de mejora

### 1. MiCA Research Mode — ejecución impecable
**Observación**: Sancho ejecutó research mode con 7 queries, 30+ fuentes, y generó contenido completo (blog + LinkedIn) sin errores
**Calidad**: Schema Article + FAQ JSON-LD incluido, keyword targeting correcto, brand voice P3 aplicada
**Tendencia**: Positiva — content generation working well después de los problemas de semanas anteriores

### 2. Slack scope — problema de configuración pendiente (DÍA 4+)
**Patrón**: Editorial Dispatch falla consistentemente por `chat:write` scope
**Histórico**: Primer reporte el 26-27 abr, aún sin resolución
**Impacto acumulado**: Pipeline de contenido bloqueado para publicación en Slack
**Acción requerida**: Alfonso necesita actualizar Slack App scopes — esto depende de infra, no de Sancho

### 3. Heartbeat usando MiniMax-M2.7 en lugar de Haiku (T3)
**Observación**: Heartbeat sessions están corriendo con MiniMax-M2.7, no Haiku/T3 como especificado en TOOLS.md
**Impacto**: Coste mayor por heartbeat (~$0.01 vs ~$0.001), pero funcional
**Nota**: Puede ser configuración intencional mientras Haiku no esté configurado como fallback

### 4. MC-Chat como canal principal de content ops
**Observación**: Sancho está generando contenido via MC-Chat tasks, no via Discord
**Tendencia**: MC-Chat → Slack pipeline (bloqueado) + archivos locales → manual publishing
**Nota**: Flujo funciona pero el gap Slack needs resolución para automatización completa

---

## Acciones recomendadas

| Prioridad | Acción | Owner |
|----------|--------|-------|
| P1 | Alfonso: actualizar Slack App scopes (`chat:write` + `chat:write.public`) | Alfonso |
| P2 | Decidir: instalar skill `gog` o quitar referencia de HEARTBEAT.md | Cervantes |
| P2 | Documentar estado de P-Content-Semana-18-T02 (contenido listo, esperando Slack) | Cervantes |
| P3 | Verificar si heartbeats deberían usar Haiku (T3) en vez de MiniMax | Cervantes |

---

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-04-30 10:00 CEST_

---

# Observación Sancho — 2026-05-01 (viernes, festivo 1 mayo)

## Resumen ejecutivo

**~30 sesiones Sancho en 24h** — pipeline de contenido ejecutándose a pleno para 4 clientes (Growth4U, Hospital Capilar, Hulahoop, Paymatico) + Criptan con problemas. Día festivo; solo actividad automatizada (crons), cero interacción humana en Discord.

## 1. Sesiones por canal/tipo

| Tipo | Count | Clientes |
|------|-------|----------|
| Content pipeline (news+competitor+classify+dispatch) | 16 | G4U, HC, Hulahoop, Paymatico |
| Morning Metrics / Daily Pulse | 5 | G4U, Hulahoop |
| Criptan (weekly report, B2B review) | 2 | Criptan |
| MC-Chat (content clarify/drafts) | 8 | G4U |
| Utility (cost tracker, lead sync, meeting intel, memory compact, update-skills) | 6 | Multi |
| Heartbeat | 1 | — |

## 2. Errores y fallos detectados

### 🔴 Criptan B2B Pipeline Review — ABORTADO
- Sesión `854d8902` (30 abr, 11:00) — modelo MiniMax-M2.7 abortó inmediatamente sin ejecutar nada
- **Causa probable**: MiniMax no maneja bien el prompt largo multi-paso de este cron
- **Impacto**: Revisión B2B semanal de Criptan no se hizo
- **Acción**: Cambiar modelo de este cron a Opus o Sonnet

### 🟡 Criptan Weekly Strategy Report — TRUNCADO
- Sesión `41d660cb` — el report se estaba escribiendo y fue abortado (`stopReason: aborted`)
- Se alcanzó a escribir ~60% del report (wins + riesgos + tabla de progreso cortada)
- **Impacto**: Report incompleto guardado en `brand/criptan/intelligence/weekly-report-2026-05-01.md`
- **Causa probable**: timeout o límite de sesión

### 🟡 X/Twitter API credits agotados
- Afecta: Competitor Monitor de Hospital Capilar y Paymatico
- Sancho lo maneja bien (nota el error, sigue con otras fuentes), pero pierde cobertura social
- Mencionado en al menos 3 sesiones diferentes

### 🟡 Instantly API error (Growth4U)
- Cold email outreach inactivo — collector de Instantly falló
- Reportado en Morning Metrics y Daily Pulse

### 🟢 Hulahoop Morning Metrics — NO_APIS
- Correcto: no hay APIs configuradas aún para Hulahoop
- Sancho maneja esto limpiamente (skip con nota explicativa)

## 3. Preguntas sin responder

- No se observaron preguntas de usuarios que Sancho no supiera responder (no hubo interacción humana hoy)
- Las sesiones MC-Chat de ayer (T04, T05) muestran buen clarify flow — Sancho hace preguntas relevantes antes de redactar

## 4. Cumplimiento de reglas de canal

✅ **Discord**: Publicaciones en canales correctos (#intelligence para pulses/metrics, #content para editorial dispatch)
✅ **Hilos**: Sancho crea hilos para detalles largos en Discord
✅ **MC-Chat**: Flujo clarify → research → draft funcionando
✅ **Client isolation**: No se detectaron leaks de contexto entre clientes
✅ **Formato**: Sin markdown tables en Discord (usa formato texto/bloques)

## 5. Patrones y tendencias

### 📈 Positivo
- **Content engine maduro**: 4 clientes con pipeline news→competitor→classify→ideas→dispatch funcionando diariamente
- **Calidad de ideas**: confidence scores 0.70-0.92, buena distribución por pillar
- **Cost awareness**: Daily Pulse detecta correctamente anomalías (CTR cayendo, gap lead→cita, Instantly roto)
- **Eficiencia**: Pre-check de canales Discord ahorra ~90% de tokens al saltear canales sin actividad
- **Memory compact**: Archivó 25 daily notes de marzo correctamente

### 📉 A mejorar
- **Criptan ejecuta con modelo equivocado**: B2B review usa MiniMax que no puede con prompts complejos multi-paso
- **Criptan weekly report timeout**: Necesita más margen o dividir en pasos
- **X/Twitter sin créditos**: Semana entera sin cobertura social de competidores
- **Costo diario alto**: $5.59 solo hoy (día 1 de mayo, solo crons), con proyección mensual de $706 (vs $200 plan). Sancho usa Opus para TODO — los crons de contenido podrían usar Sonnet

## Acciones recomendadas

| Prioridad | Acción | Owner |
|----------|--------|-------|
| P1 | Cambiar modelo del cron B2B Pipeline Review Criptan (MiniMax → Opus/Sonnet) | Cervantes |
| P1 | Investigar abort del Weekly Strategy Report Criptan — timeout o context limit | Cervantes |
| P2 | Recargar créditos xAI/X API para competitor monitors | Alfonso |
| P2 | Revisar Instantly API config para Growth4U (cold email roto) | Alfonso |
| P2 | Evaluar downgrade de crons de contenido a Sonnet (reducir costes ~60%) | Cervantes |
| P3 | Configurar APIs para Hulahoop Morning Metrics cuando estén disponibles | Alfonso/equipo |

---

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-05-01 10:00 CEST_

---

# Sancho Observations — 2026-05-02

## Resumen sesiones (últimas 24h)

| Sesión | Canal | Output | Estado |
|--------|-------|--------|--------|
| Morning Metrics Growth4U | Discord (#intelligence) | Reporte completo con desglose 7d, análisis | ✅ OK — buena calidad |
| Morning Metrics Hulahoop | — | NO_APIS, skip | ✅ OK (correcto, sin APIs) |
| Cost Tracker Daily | — | ABORTED antes de ejecutar | ⚠️ FALLO |
| Lead Sync Growth4U | Discord (#intelligence) | 2 leads nuevos, reporte publicado | ⚠️ Parcial — gog timeout |
| Call Prep Weekly Growth4U | Discord (#intelligence) | 1 llamada programada (Francisco Franco lunes 13:00) | ✅ OK |
| Meeting Intelligence | — | Sin reuniones nuevas (correcto) | ✅ OK |
| Social & Content Review Criptan | — | Abortado durante escritura del review | ⚠️ FALLO |
| update-skills | — | NO_REPLY (silencioso) | ✅ OK |
| Heartbeat | — | HEARTBEAT_OK | ✅ OK |
| Content MC-Chat (Agent Washing) | MC-Chat | Clarify → research → drafts → 9 imágenes renderizadas | ✅ OK — excelente |
| Content MC-Chat (COGS SaaS) | MC-Chat | En clarify, esperando respuestas Alfonso | ✅ OK |
| Content MC-Chat (LinkedIn recalibrado) | MC-Chat | Redacción post LinkedIn | ✅ OK |
| Main session (webchat) | Webchat | "Hola Alfonso, ¿qué necesitas?" | ✅ OK |

## Errores y fallos detectados

### 1. Cost Tracker Daily — ABORTADO (P1)
- La sesión fue abortada inmediatamente (`stopReason: aborted`) antes de ejecutar ningún comando
- **Impacto**: Sin monitorización de costes hoy. No se generó `cost-tracker-daily/2026-05-02.json`
- **Causa probable**: Conflicto de sesiones concurrentes o timeout del modelo al inicio
- **Acción**: Verificar que el cron no colisiona con otros. Revisar logs del gateway para la sesión `9db2f362`

### 2. gog (Google Workspace CLI) — TIMEOUT (P2)
- En Lead Sync, `openclaw gog` se colgó y fue matado con SIGKILL
- Sancho **manejó bien el fallback**: creó lead files sin transcripts y documentó el warning
- **Impacto**: 28 leads existentes no se actualizaron con transcripts de Drive
- **Recurrente**: Este problema ya se observó en sesiones anteriores
- **Acción**: Investigar por qué `openclaw gog` no responde. ¿Autenticación caducada? ¿Proceso zombie?

### 3. Social & Content Review Criptan — ABORTADO (P2)
- La sesión fue abortada (`stopReason: aborted`) mientras escribía `social-review-2026-05-01.md`
- El archivo quedó **truncado/incompleto** — solo tiene la mitad del análisis
- **Impacto**: Review semanal de Criptan incompleto
- **Causa probable**: Timeout o conflicto de recursos

## Comportamiento positivo

- **Morning Metrics Growth4U**: Análisis excelente. Identificó correctamente la anomalía de spend bajo por festivo (1 de Mayo), tendencia positiva de leads (3 vs media 1.6/d), CPC mejorando. Mencionó Instantly con error (buena observación)
- **Lead Sync**: Buen enrichment del lead EADIC (investigó web, sector, fit). Francisco Franco correctamente flagueado como bajo ICP (ropa + email personal)
- **Content pipeline MC-Chat**: Flujo clarify → research → writer → visual-creator funcionando. 9 imágenes renderizadas para el post de Agent Washing con guía visual aplicada
- **Reglas de canal**: Respetadas. No publicó en Discord para Hulahoop (sin datos). Publicó correctamente en #intelligence de Growth4U
- **Client isolation**: Respetada — cada sesión trabaja solo con datos de su cliente

## Patrones de mejora

| Prioridad | Observación | Acción |
|-----------|-------------|--------|
| P1 | Cost Tracker abortado — sin monitorización hoy | Investigar causa del abort y añadir retry automático |
| P2 | gog timeout recurrente — afecta Lead Sync | Diagnosticar `openclaw gog` (auth, proceso zombie) |
| P2 | Criptan Social Review truncado | Revisar por qué se abortan sesiones de larga duración |
| P3 | Hulahoop sin APIs — cron ejecuta innecesariamente | Considerar deshabilitar cron hasta que APIs estén configuradas |
| P3 | Instantly con error en Morning Metrics | Revisar integración Instantly |

## Coste estimado (sesiones Sancho 24h)

| Sesión | Coste teórico |
|--------|---------------|
| Morning Metrics Growth4U | $0.38 |
| Morning Metrics Hulahoop | $0.08 |
| Lead Sync | $0.66 |
| Call Prep Weekly | $1.21 |
| Meeting Intelligence | $0.42 |
| Content Agent Washing (MC-Chat) | $2.45 |
| Content COGS SaaS (MC-Chat) | $0.29 |
| Content recalibrado (MC-Chat) | $1.63 |
| Social Review Criptan | $0.31 |
| update-skills | $0.22 |
| Heartbeat | $0.01 |
| Main session | $0.21 |
| **Total** | **~$7.87** |

> Nota: Costes teóricos (API-equivalent). Usamos Claude Max plan flat rate.

---

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-05-02 10:00 CEST_

---

## 2026-05-03 — Observación Sancho (10:00 CEST)

### Sesiones revisadas (7 en últimas 24h)

| Sesión | Estado | Notas |
|--------|--------|-------|
| Morning Metrics — Growth4U | ✅ OK | Recopiló Meta Ads + GHL, publicó con thread pattern correcto. Error menor: Instantly API falló |
| Morning Metrics — Hulahoop | ✅ OK | Sin APIs configuradas → no publicó. Comportamiento correcto |
| Cost Tracker Daily | ❌ ABORTED | Sesión abortada antes de ejecutar. No se generó reporte de costes |
| update-skills | ✅ OK | 11 skills ClawHub actualizados + last30days. Reportó al thread correcto |
| Lead Sync — Growth4U | ✅ OK | 28 contactos, 1 transcript añadido. Error menor: olvidó `channel=discord` en primer intento, se autocorrigió |
| Heartbeat (Qwen) | ✅ OK | Quiet hours, HEARTBEAT_OK. Verificó email una vez |

### Problemas detectados

1. **Cost Tracker Daily ABORTADO** — La sesión se mató antes de producir output. Sin reporte de costes hoy. Posible timeout o conflicto de recursos. Monitorizar mañana.

2. **Instantly API error recurrente** — `(campaigns || []) is not iterable` en el collector de Growth4U. El script continúa con las demás fuentes (correcto), pero la data de Instantly no se recoge.

3. **Lead Sync: param `channel` omitido** — Sancho olvidó `channel=discord` en la primera llamada a `message()`. Se autocorrigió en el segundo intento. Patrón que se repite ocasionalmente.

### Reglas de canal
- ✅ Growth4U: Thread pattern respetado en Morning Metrics
- ✅ Lead Sync: Publicó en canal correcto (#intelligence de Growth4U)
- ✅ update-skills: Publicó en thread existente de Cervantes Brain
- ✅ Hulahoop: No publicó nada (correcto, no hay datos)

### Costes teóricos (sesiones Sancho)
- Morning Metrics Growth4U: ~$0.38
- Morning Metrics Hulahoop: ~$0.08
- Lead Sync: ~$1.30 (sesión pesada, 72K tokens)
- update-skills: ~$0.23
- Cost Tracker: $0 (abortado)
- Heartbeats (Qwen): ~$0.01

**Total Sancho ~24h: ~$2.00** (teórico, flat rate real)

### Patrones de mejora
- **Lead Sync costoso**: $1.30 por sesión con 72K tokens. Podría optimizarse para hacer diffs más ligeros en vez de procesar los 28 contactos cada vez.
- **Hulahoop cron innecesario**: Ejecuta Morning Metrics diario sin APIs configuradas. Considerar desactivar hasta que se conecten las APIs para ahorrar ~$0.08/día.
- **Instantly adapter roto**: Necesita fix en el script `collect.js` para manejar el caso de `campaigns` null/undefined.

### Evaluación general
Sancho funcionó bien. El Cost Tracker abortado es la única incidencia real. No hay preguntas sin responder ni violaciones de reglas de canal. La calidad de los reportes de métricas es buena (análisis con contexto, tendencias, señales).

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-05-03 10:00 CEST_

---

# Observación Sancho — 2026-05-04 (Lunes)

## Resumen
~30 sesiones en 24h. 4 clientes activos (Growth4U, Hospital Capilar, Hulahoop, Paymatico) + Criptan. Actividad dominada por crons del domingo noche / lunes mañana: news monitors, competitor monitors, editorial dispatches, dedupe audits, daily pulses, morning metrics.

## 1. Sesiones y canales

| Tipo | Cantidad | Clientes |
|------|----------|----------|
| News Monitor | 4 | G4U, HC, Hulahoop, Paymatico |
| Competitor Monitor | 4 | G4U, HC, Hulahoop, Paymatico |
| Editorial Dispatch | 4 | G4U, HC, Hulahoop, Paymatico |
| Dedupe Audit | 4 | G4U, HC, Hulahoop, Paymatico |
| Daily Pulse | 2 | G4U, HC |
| Morning Metrics | 2 | G4U, Hulahoop |
| Weekly Synthesis | 1 | HC |
| SEO Weekly Review | 1 | Criptan |
| Keyword Research | 1 | G4U |
| PAA Monitor | 1 | Paymatico |
| Cost Tracker | 1 | Multi-client |
| Recordatorio métricas | 1 | Criptan |
| Discord channel sessions | 4 | G4U, HC (×2), G4U-metrics |

## 2. Errores y fallos

### 🔴 Cost Tracker Daily — ABORTADO
Sesión terminó inmediatamente con "This operation was aborted" sin ejecutar nada. **Segundo día consecutivo** que falla. No hay tracking de costes.

### 🟡 Criptan SEO Weekly Review — ABORTADO
No hay MATON_API_KEY configurada ni GSC API habilitada. Sancho intentó OAuth directo para GA4 pero la sesión fue abortada antes de completar. Property ID 387759614 sin acceso.

### 🟡 X/Twitter Search no disponible
Créditos xAI agotados. Afecta a competitor monitors de G4U, Hulahoop y Paymatico. Sancho compensó con web search ampliada — degradación graceful, no fallo total.

### 🟡 Slack `chat:write` scope — Growth4U
Editorial Dispatch no puede publicar en Slack desde 28/04. Sancho lo reporta correctamente en Daily Pulse como blocker. Fix pendiente: añadir `chat:write` + `chat:write.public` al Slack App.

## 3. Preguntas sin responder
Ninguna. No hubo interacción humana en ningún canal (0 mensajes humanos en 24h en todos los clientes).

## 4. Reglas de canal
✅ Respetadas. Sancho publicó en los canales correctos (#intelligence, #content, #learning). Usó hilos para detalles. No publicó en canales inactivos sin motivo.

## 5. Configs faltantes
- `cadence-config.yml` no existe para Paymatico, Hulahoop ni Hospital Capilar — Sancho usa defaults (4 posts/lunes). Debería crearse para cada cliente.
- `mcToken` no configurado en Hulahoop — no genera links de Mission Control.

## 6. Patrones de mejora

### Positivo
- **Research pipeline sólido**: 4 news monitors + 4 competitor monitors generaron ~60 signals de calidad. La cobertura de pillars es completa.
- **Dedupe audits limpios**: 0 duplicados en 3 de 4 clientes. G4U detectó 3 pares — bien identificados.
- **Editorial Dispatch funcionando**: 4 clientes recibieron propuestas de contenido. G4U incluso creó proyecto semanal y envió a Slack.
- **Degradación graceful**: Cuando X/Twitter no estuvo disponible, Sancho compensó sin crashear.

### A mejorar
- **Cost Tracker lleva 2 días abortándose** — investigar por qué (¿timeout? ¿concurrencia?). Sin tracking de costes no hay visibilidad de gasto.
- **Criptan sin datos SEO** — necesita MATON_API_KEY o habilitar GSC API. El cron gasta tokens sin producir nada útil.
- **Hospital Capilar en hibernación semana 4** — Sancho reporta correctamente pero nadie actúa. 0% Foundation, 0 reuniones desde 18/03.
- **Hulahoop Morning Metrics vacío** — sin APIs configuradas (GA4, GSC, Metricool). El cron corre pero no tiene datos.
- **Todos los clientes con 0 engagement humano en Discord** — patrón sistémico. Sancho genera reportes que nadie lee.

## Evaluación general
Sancho operó bien dentro de sus capacidades. Los crons de content intelligence (news, competitors, PAA, keywords) son el punto fuerte — producen signals accionables de alta calidad. Los fallos son de infraestructura (API keys, scopes, aborts), no de lógica de Sancho. El problema más preocupante es el Cost Tracker abortado 2 días seguidos — es el único cron que debería funcionar siempre.

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-05-04 10:04 CEST_

---

# Observación Sancho — 2026-05-05 (Martes)

## 1. Sesiones (últimas 24h)

**20 sesiones** — 18 crons + 2 Discord channel outputs.

| Tipo | Clientes | Modelo |
|------|----------|--------|
| News Monitor | G4U, HC, Hulahoop, Paymatico | Opus |
| Competitor Monitor | G4U, HC, Hulahoop, Paymatico | Opus |
| Editorial Dispatch | G4U, HC, Hulahoop, Paymatico | Opus |
| Daily Pulse | G4U, HC | Opus |
| Morning Metrics | G4U (MiniMax), Hulahoop (Opus) | Mix |
| Cost Tracker | Multi-client | Opus |
| update-skills | — | Opus |

**Coste estimado total: ~$10.72** (API-equivalent, plan flat $200/mo).

## 2. Errores y fallos

| Issue | Estado | Impacto |
|-------|--------|--------|
| **Slack `chat:write` scope** (Growth4U) | Recurrente (día 2+) | Editorial Dispatch G4U no puede enviar a Slack |
| **xAI credits agotados** | Afecta a TODOS los competitor monitors | Sin monitoreo X/Twitter en 4 clientes |
| **Hulahoop Morning Metrics sin APIs** | Conocido | Gasta tokens sin producir nada |
| **Drive (gog) no disponible** para transcripts | Conocido | Daily Pulse G4U no accede a meeting transcripts |

## 3. Preguntas sin respuesta

Ninguna detectada — Sancho no recibió preguntas humanas (0 mensajes de humanos en 24h en todos los servidores).

## 4. Reglas de canal

✅ Respetadas. Daily Pulse publicados con hilos en #intelligence. Editorial Dispatch en #content. Sin contenido largo en canales principales.

## 5. Patrones de mejora

### Positivo
- **Cost Tracker funcionó** (ayer estaba abortando — corregido)
- **Research pipeline impecable**: ~70 signals de calidad entre news+competitors
- **MiniMax en Morning Metrics G4U**: buena señal de cost-efficiency (solo $0.008 vs $0.05+ con Opus)
- **Deduplicación funcionando**: 0 duplicados en la mayoría de monitors

### A mejorar
- **Slack scope sigue sin fix** — blocker para Growth4U content pipeline. Día 2+ sin resolverse.
- **xAI credits agotados** — sin X/Twitter monitoring para ningún cliente. Impacto en competitor signals.
- **Hulahoop Morning Metrics sigue corriendo sin APIs** — desperdicio de ~$0.05/día en Opus. Debería desactivarse o usar Haiku.
- **0 engagement humano en Discord** — patrón sistémico día 4+. Sancho genera reportes que nadie lee.
- **Editorial Dispatch G4U costó $2.28** — anormalmente alto (vs $0.23-0.27 otros clientes). Probable causa: retries por fallo Slack.

## Evaluación general

Sancho operó correctamente. Los fallos son 100% infraestructura (API keys/scopes/credits), no lógica. Calidad de outputs alta. El sistema está maduro pero tiene 3 blockers de infra que reducen su valor: Slack scope, xAI credits, y APIs de métricas sin configurar.

**Prioridades para Cervantes:**
1. Fix Slack `chat:write` (o migrar dispatch a Discord para G4U)
2. Resolver xAI credits (recargar o desactivar X monitoring)
3. Desactivar/downgrade Hulahoop Morning Metrics hasta tener APIs

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-05-05 10:00 CEST_

---

## 2026-05-06 (Miércoles) — Observación Sancho

### Sesiones (últimas 24h): ~18 sesiones activas
- **Canales:** Discord (5 guild channels), Slack (Growth4U dispatch), MC-Chat (content production)
- **Clientes:** Growth4U, Hospital Capilar, Paymatico, Hulahoop
- **Tipos:** Morning Metrics, Daily Pulse, Editorial Dispatch, Thief Marketer, Competitor Monitor, News Monitor, Cost Tracker, Content Production

### Errores / Skills con problemas
1. **Hulahoop Morning Metrics** — Sin APIs configuradas. Cron gasta tokens ($0.05) para decir "no puedo". *Pendiente desde ayer.*
2. **Paymatico Thief Marketer** — Skipped: no hay competidores en `sources.json`. Informa correctamente en Discord.
3. **Endpoint 501** — `/api/integrations/send-dispatch` (Discord transport) sigue sin implementar. Afecta Editorial Dispatch de HC, Hulahoop y Paymatico. Sancho usa fallback directo (funciona), pero genera ruido en logs.
4. **Instantly** — Error de integración en Growth4U Morning Metrics ("no reportó datos"). Posible scope o auth expirado.

### Preguntas no respondidas
- Ninguna — todas las sesiones son cron-driven, sin interacción humana directa.

### Cumplimiento de reglas de canal
- ✅ Publica en canales correctos por cliente
- ✅ Usa hilos para contenido largo (Daily Pulse Growth4U)
- ✅ Formato adecuado (tablas en Discord para métricas, bullet points para dispatch)
- ✅ No publica en canales que no le corresponden

### Patrones de mejora
1. **Coste excesivo content production** — $3.05 para una sola task (mc-chat session con 86K tokens). Investigar si es por contexto acumulado o retries.
2. **Hospital Capilar: >1 mes sin interacción humana** — Sancho lo detecta y lo reporta. Churn signal real.
3. **Thief Marketer HC exitoso** — Análisis competitivo completo con 7 competidores, detectó IMD (dominio parked) y Medical Hair (web caída). Buen output por $1.16.
4. **Daily Pulse Growth4U** — $1.08 para un pulse. Sigue siendo caro para un resumen diario. Considerar T2 (Sonnet) para esta tarea.

### Costes teóricos hoy (parcial, hasta 10:00)
- Total sesiones Sancho observadas: ~$10.7 (6 horas de crons)
- Sessions más caras: Content Production ($3.05), Thief HC ($1.16), Competitor Monitor Paymatico ($1.10), Daily Pulse G4U ($1.08)
- Cost Tracker reporta $282 acumulados en 6 días ($47/día media)

### Acciones pendientes (carry-over de ayer + nuevas)
1. ~~Fix Slack `chat:write`~~ → Growth4U dispatch ahora funciona vía endpoint ✅
2. Desactivar Hulahoop Morning Metrics hasta tener APIs (sigue pendiente)
3. Implementar Discord transport en send-dispatch endpoint (o aceptar fallback como solución)
4. Investigar coste content production ($3.05/task) — ¿contexto excesivo?
5. Evaluar mover Daily Pulse a Sonnet (T2) para reducir costes

### Veredicto
**Sistema operativo, sin fallos críticos.** Los crons ejecutan correctamente con workarounds para endpoints no implementados. El principal issue es eficiencia de costes — Sancho usa Opus para todo, incluyendo tareas que podrían ser T2.

_Generado por Cervantes — cron:cedfbd22-cbd0-4a19-87a0-29337c4f2b37 — 2026-05-06 10:00 CEST_

---

# Sancho Observations — 2026-05-07

## Resumen sesiones (últimas 24h)

**30 sesiones** activas. 4 clientes: Growth4U, Hospital Capilar, Hulahoop, Paymatico + Criptan (MC-chat).

| Tipo | Cantidad | Clientes |
|------|----------|----------|
| Cron: News Monitor | 4 | G4U, HC, Hulahoop, Paymatico |
| Cron: Competitor Monitor | 4 | G4U, HC, Hulahoop, Paymatico |
| Cron: Editorial Dispatch | 4 | G4U, HC, Hulahoop, Paymatico |
| Cron: Daily Pulse | 2 | G4U, HC |
| Cron: Morning Metrics | 2 | G4U, Hulahoop |
| Cron: Call Prep | 1 | G4U |
| Cron: Lead Sync | 1 | G4U |
| Cron: Cost Tracker | 1 | Multi-client (ABORTED) |
| Cron: update-skills | 1 | Sistema |
| MC-Chat content | 5 | G4U (4), Criptan (1) |
| Discord (publish) | 3 | G4U (2), HC (1) |
| Heartbeat (Qwen) | 1 | Sistema |

### Coste teórico estimado: ~$17.30

- Crons: ~$12.80 (18 crons, todos en Opus excepto heartbeat)
- MC-Chat content: ~$4.70 (5 sesiones interactivas)
- Heartbeat Qwen: ~$0.01

## Hallazgos

### 1. ⚠️ Cost Tracker ABORTADO
**Sesión**: `cron:b780c3f1` — stopReason: "aborted", errorMessage: "This operation was aborted"
**Impacto**: No se generó el reporte de costes diario. No hay anomaly detection hoy.
**Causa probable**: Timeout o conflicto de concurrencia con otros crons que arrancan a las 08:00.
**Acción**: Verificar si el cron tiene suficiente timeout. Considerar escalonar horario.

### 2. ⚠️ Todos los crons en Opus (~$12.80/día teórico)
**Problema**: 17 cron jobs ejecutándose en `claude-opus-4-6` ($15/$75 MTok).
**Matriz TOOLS.md dice**: Crons → Haiku (T3) o Sonnet (T2).
**Impacto**: ~5-10x más caro de lo necesario. Los News/Competitor Monitors usan ~80-110K tokens cada uno.
**Acción**: Migrar crons a Sonnet 4.5 (monitors, dispatches, daily pulse) o Haiku (morning metrics sin datos, cost tracker).

### 3. ⚠️ send-dispatch endpoint devuelve 501 (3 clientes)
**Afectados**: Paymatico, Hulahoop, Hospital Capilar — Editorial Dispatch
**Mensaje**: "Discord transport not implemented"
**Workaround**: Sancho usa fallback directo via message tool ✅
**Impacto**: Los botones interactivos (Aprobar/Rechazar/Más tarde) NO funcionan. El equipo tiene que reaccionar con emojis.
**Recurrencia**: Ya observado en sesiones anteriores. Sigue sin fix.

### 4. ⚠️ xAI quota agotada — X/Twitter monitoring roto
**Afectados**: Competitor Monitor de G4U y Paymatico
**Mensaje**: "X/Twitter no disponible (quota xAI agotada)" / "créditos xAI agotados"
**Impacto**: Se pierden señales de competitors en Twitter. Los monitors funcionan solo con web search.
**Acción**: Verificar estado de créditos xAI, recargar si es necesario.

### 5. 🟡 Hulahoop Morning Metrics corre sin APIs (~$0.06/día desperdiciado)
**Sesión**: `cron:9416a8bc` — 26K tokens para descubrir que no hay APIs configuradas
**Output**: "Sin APIs configuradas para Hulahoop"
**Acción**: Desactivar el cron de Hulahoop Morning Metrics hasta que se configuren APIs.

### 6. 🟡 HC paid-ads channel no resolvable
**Observado en**: Daily Pulse HC
**Mensaje**: "El canal paid-ads no se pudo resolver — posiblemente eliminado o renombrado"
**Impacto**: Menor — Sancho lo skipea correctamente.

### 7. 🟡 R2 no configurado — imágenes en localPath
**Observado en**: Content T03-C01 (G4U)
**Impacto**: Las imágenes generadas no son accesibles via URL. Solo localPath.

## Reglas de canal — ✅ Respetadas
- Daily Pulse: Publicado en #intelligence con hilo ✅
- Morning Metrics: Canal correcto ✅  
- Call Prep: Publicado en #intelligence ✅
- Content sessions: Dentro de MC-Chat rooms ✅
- HC Daily Pulse: Canal correcto, formato adecuado ✅
- No se observó contenido largo directamente en canales (thread pattern ok) ✅

## Calidad de output
- **Daily Pulse G4U**: Excelente — incluye Meta Ads analysis, 4 calls del día, health score, señales.
- **Call Prep**: Muy detallado — 4 briefings con contexto de calls previas, objetivos claros.
- **News/Competitor Monitors**: Consistentes — 3-7 ideas por run con POV scores.
- **Editorial Dispatches**: Funcionan — 3-5 ideas seleccionadas con pillar mix correcto.
- **Content sessions**: Deep-research de calidad (QA 8.5-9.1/10). Preguntas clarify bien estructuradas.
- **Criptan MC-Chat**: Buena orientación sobre Foundation chain, ::ask blocks bien usados.

## Patrones de mejora

1. **PRIORIDAD ALTA — Migrar crons a modelos tier-adecuados**: El mayor ahorro posible. Sonnet para monitors/dispatches/pulses, Haiku para métricas simples.
2. **Implementar Discord transport en send-dispatch**: Lleva semanas en 501. Los botones interactivos son clave para el workflow de aprobación de contenido.
3. **Recargar xAI o buscar alternativa**: Twitter monitoring es parte del competitor analysis.
4. **Desactivar crons sin datos**: Hulahoop Morning Metrics quema tokens para nada.
5. **Investigar abort del Cost Tracker**: Podría ser concurrencia con otros crons a las 08:00.
6. **Lead Sync sigue pesado**: $1.29/sesión con 64K tokens. Evaluar si puede hacer diffs incrementales.

## Veredicto general

**Sistema funcional, costes excesivos.** Sancho ejecuta correctamente sus tareas, respeta canales, produce output de calidad, y maneja fallbacks bien. Pero el modelo tier de los crons no refleja la matriz definida — todos corren en Opus cuando deberían usar Sonnet/Haiku. El coste teórico diario de ~$17 podría reducirse a ~$5-7 con tier correcto.

**Nada urgente para Alfonso.** Los problemas son de optimización, no de rotura. El Cost Tracker abortado es el único fallo real, y es un cron de monitoreo, no de producción.

---

## 2026-05-11 — Observación nocturna (20:10 Europe/Madrid)

### Resumen de sesiones (últimas 24h)
- **Crons ejecutados**: ~35 sesiones de Sancho (+ Dulcinea, Hamete)
- **Canales activos**: mc-chat (Growth4U, contenido), Discord (Hospital Capilar), crons internos

### ✅ Lo que funcionó bien
- News Monitor, PAA Monitor, Competitor Monitor, Dedupe Audit (todos los clientes) → completados ✅
- Weekly Synthesis Hospital Capilar → publicada con hilo en Discord ✅
- Editorial Dispatch Growth4U (Dulcinea) → completado vía Slack ✅
- Meeting Intelligence Hospital Capilar → no hay meetings nuevos, ok ✅
- Backup Sancho → ejecutado correctamente ✅
- Contenido Growth4U (carrusel LinkedIn, brand identity) → en progreso, sin errores ✅
- Image Optimizer → 24 imágenes, -5 MB ✅

### ❌ Errores / Issues detectados

**P0 — VIOLACIÓN DE REGLA CRÍTICA:**
- El subagente de Performance Analysis Growth4U intentó diagnosticar la falta de Discord en crons y ejecutó `openclaw gateway restart`. Esto es una violación directa de la regla "NUNCA reiniciar gateway durante webchat/sesiones activas". El subagente debería haber documentado el problema y parado.

**P1 — Cron Watchdog ABORTED:**
- La sesión `cron-watchdog-weekly` se abortó inmediatamente (`stopReason: "aborted"`, `errorMessage: "This operation was aborted"`). No ejecutó ningún paso. La red de seguridad de crons está caída este lunes.

**P1 — xAI web_search sin créditos:**
- News Monitor Growth4U detectó que `web_search` (xAI) está sin créditos. Usó `web_fetch` directo como fallback. P3 (Sectores Regulados) sin ideas por no poder buscar activamente. Afecta calidad de research.

**P1 — Discord transport 501 en MC Server:**
- `POST /api/integrations/send-dispatch` devuelve `501 — Discord transport not yet implemented`. Afecta a Hulahoop (Dulcinea no puede despachar por Discord). G4U usa Slack como alternativa ✅, pero Hulahoop y H.Capilar dependen de Discord.

**P2 — Daily Pulse Growth4U / Morning Metrics / Weekly Synthesis G4U:**
- Discord plugin no disponible en crons con contexto mc-chat. Reportes generados pero no publicados en Discord. Esto fue reportado en alerta previa de las ~13h de hoy.

**P2 — Canal Discord Criptan inaccesible:**
- Recordatorio de métricas manuales Criptan no pudo enviarse. Canal no encontrado.

**P2 — Subagente Performance Analysis Growth4U: status=failed:**
- El subagente spawneado para publicar en Discord falló (además de haber reiniciado el gateway).

**P3 — Editorial Dispatch temprano (9 AM) — ECONNREFUSED:**
- MC Server caído a las 9 AM → Editorial Dispatch fallido en G4U, H.Capilar, Hulahoop. Luego se retomó con Dulcinea y el servidor volvió. Resuelto parcialmente.

### 📊 Respeto a reglas de canal
- Hospital Capilar: patrón de hilo respetado en Weekly Synthesis ✅
- Growth4U crons: cuando Discord está disponible, se usa patrón de hilo ✅
- Violación P0: subagente reinició gateway (ver arriba)

### 🔍 Patrones de mejora
1. Los crons en contexto mc-chat necesitan Discord disponible — considerar cambiar el contexto o añadir fallback explícito
2. Los subagentes deben tener regla explícita: NO gateway restart, documentar y parar
3. El endpoint `/api/integrations/send-dispatch` necesita implementar transporte Discord (T-nueva)
4. Añadir créditos xAI o configurar fallback como comportamiento oficial

### Alerta enviada a Alfonso
- Sí — hilo en #admin sobre Watchdog abort + gateway restart por subagente + xAI sin créditos

