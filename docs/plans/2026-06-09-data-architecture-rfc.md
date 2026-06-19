---
title: Arquitectura de datos para brand docs, versionado y scraping (RFC)
status: F0 + F1-núcleo implementado · F1-naming + F2–F4 pendientes
owner: Alfonso
date: 2026-06-09
implemented_in: PR alfonso/pillar-manifest-f0
---

# Estado de implementación (handoff para Nahuel & Martín)

Este RFC tiene **5 fases (F0–F4)**. En el PR `alfonso/pillar-manifest-f0` va implementado **F0 + el núcleo de F1**. El resto está documentado abajo para que lo terminéis y cambiéis lo que veáis.

> **Base del branch:** ramificado de `staging` (post-SAN-116). **SAN-102 NO está incluido** — diverge de staging y choca con SAN-116 en el roster de agentes; se reconcilia por separado. El golden test congela el comportamiento de routing **de staging**, no el de SAN-102.

## ✅ Hecho y verificado en este PR (3 commits)

| Commit | Qué |
|---|---|
| `refactor(foundation)` | `config/pillar-manifest.json` = **fuente única** del modelo de pilares. `PILLAR_DOC_PATHS`, `PILLAR_SKILL_ALIAS`, `HOMONYMOUS_SKILL_PILLARS` **derivan** de él (inline en `pillar-doc-paths.ts` + `skill-resolver.ts`). Golden test congelado (`pillar-manifest.test.mts`). `dispatch-map.json` adelgazado. |
| `feat(foundation)` | `scripts/lint-paths.mts` + `npm run lint:paths` — gate anti-drift. |
| `fix(foundation)` | Manifiesto alineado a lo que las skills **escriben** (`context_writes`); 21 `SKILL.md` con paths `brand-book/*` stale reescritos; `lint:paths --strict` **bloqueante** en `pre-push`. |

**Verificación:** `test:lib` 211/211 · `tsc --noEmit` limpio · `test:doc-paths` pasa · `lint:paths` 0 stale.

## ⚠️ Divergencias respecto al plan de abajo (decididas durante la implementación)

1. **`dispatch-map.json` NO se borra** (el plan decía borrarlo). Es el **roster de agentes** (`specialists`) y `openclaw-config.ts` lo lee en runtime para puntuar modelo. Se **adelgazó** (fuera los bloques de Discord/canales muertos que ningún código lee). → `SKILL_OWNER_MAP` no se puede derivar en runtime (lo usa `chat-sidebar`, cliente, sin `fs`); el plan correcto es un **drift-guard test** (pendiente).
2. **No hay loader `pillar-manifest.ts`** (el plan lo insinuaba). Se **colapsó**: el JSON se parsea inline en `pillar-doc-paths.ts` (exporta `MANIFEST_PILLARS`) y `skill-resolver.ts` lo reutiliza. Un archivo menos.
3. **Naming `dot→guion` NO aplicado todavía.** El manifiesto mantiene `{carpeta}.current.md` (SAN-103). El cambio a `{carpeta}-current.md` resultó ser un **barrido profundo** (ver pendiente F1).
4. **El manifiesto se alineó a `context_writes`**, lo que destapó y arregló bugs reales de path (`metrics-plan` vs `metrics/setup`, `existing-customer-data` vs `existing-customers`, `summary`/`ope-canvas` sin mapear, `brand-voice` apuntando a la carpeta equivocada).

## 🔜 Pendiente — lo que queda por implementar/cambiar

**F1 (resto):**
- **Naming `dot→guion` (`{carpeta}-current.md`)** — PROFUNDO: revierte la convención SAN-103 entera. Toca `CANONICAL_DOC_RE` en `src/lib/server/doc-paths.ts`, la **lógica de escritura de cada skill**, `reseed-foundation.sh`, la generación de `foundation-state`, el manifiesto y el golden fixture. **Coordinar con SAN-13** (usa `fastcontext.current.md` + `vN.md`). Sesión dedicada.
- **Drift-guard `SKILL_OWNER_MAP` ⟷ `dispatch-map.json`** (test pequeño; ojo: `SKILL_OWNER_MAP` no está exportado).
- **`reseed-foundation.sh` instancia tareas desde el manifiesto** (hoy hardcodea los proyectos P00).

**F2–F4 (DB-of-record) — requieren cerrar las decisiones abiertas del §8 con Martín/Diego antes de implementar:**
- **F2** — tabla `tasks` como verdad por cliente (`MC_TASKS_BACKEND=db`), `deliverable_file` fijado en la instanciación, `foundation-state.json` → vista derivada, colapsar resolvers.
- **F3** — `brand_documents` + `document_versions` (versionado append-only en Postgres; fuera `vN.md`).
- **F4** — `research_artifacts` + `artifact_citations` (store de scraping con dedup).

Las decisiones abiertas (D0–D9) están en el §8 del RFC.

---

<!-- ===================== RFC ORIGINAL (verbatim) ===================== -->

# Arquitectura de datos para brand docs, versionado y scraping — RFC

> Autor: Alfonso (+ investigación Claude Code) · Fecha: 2026-06-09 · Repo: `sanchocmo-openclaw`

---

## 1. Contexto — por qué tocamos esto ahora

Hoy los documentos de brand de cada cliente viven como ficheros markdown en carpetas (`workspace-sancho/brand/{slug}/...`). Esto genera tres dolores concretos:

1. **Naming desajustado.** Las skills declaran que leen `current.md`, pero el naming ya cambió y no de forma uniforme. Conviven varias generaciones de nombre:
   - `current.md` — legacy (lo que aún declaran muchas skills).
   - `{carpeta}.current.md` — convención nueva de **SAN-103, ya en `staging`** (p.ej. `company-context/company-context.current.md`). Hay un fallback name-agnostic en `src/lib/server/doc-paths.ts` que sirve ambos sentidos, pero es parche, no fuente única.
   - `fastcontext/fastcontext.current.md` — la que añade **SAN-13** para Fast Foundation.
   - Y rutas stale: `brand-check` declara `brand/{slug}/brand-book/brand-voice/brand-voice.current.md`, que no existe. Para "voice profile" llegó a haber 4 grafías distintas declaradas. El agente a veces no encuentra el doc o lee el equivocado.

2. **Versionado roto.** Al reescribir un documento se sobreescribe el `current` y, en el mejor caso, se hace backup ad-hoc `v{N}.md` + `history.json`. Sin audit trail real, metadatos duplicados (en `history.json` **y** en comentarios HTML que se contradicen), disciplina perdida.

3. **Scraping disperso.** Lo que producen las skills de research/scraping (deep-research, market/competitor/self-intelligence vía Apify, Firecrawl, scrapecreators, DataForSEO) se guarda en sitios inconsistentes: `01-business/clients/{client}/research/{topic}-raw/`, más índices paralelos `brand/{slug}/intelligence/research-log.json` y `_system/intelligence-log.json`. Sin dedup, sin provenance fiable, sin retención.

**Resultado buscado:** un sistema de datos para brand docs y research que (a) tenga un naming canónico único que skills y disco respeten siempre, (b) versione de forma inmutable y auditable, y (c) centralice el scraping con dedup y trazabilidad — **sin romper la forma en que los agentes consumen el contexto.**

---

## 2. Hallazgo clave — la pregunta no es "relacional vs no-relacional"

**Ya existe una base de datos relacional en producción.** Postgres serverless (Neon) + Drizzle ORM, migraciones en `src/db/migrations/`, schema en `src/db/schema.ts`. Hoy ya soporta Meeting Intelligence (`mi_*`), POV Bank (`pov_*` con patrón DB-as-source-of-truth + `materializePovBank()`), `tasks`, `shared_doc_comments`, `feedback_insights`, `mcp_audit_events`.

Ya tenemos un sistema **híbrido markdown + Postgres**, con JSONB para lo semi-estructurado. **No necesitamos una base de datos nueva ni una NoSQL aparte.** La decisión real es:

> **¿Qué parte vive en ficheros y qué parte vive en Postgres?** Contenido vivo, historia de versiones, índice queryable, y datos crudos de scraping pueden ir a sitios distintos.

---

## 3. Restricción que manda sobre todo

**Las skills de Sancho son agentes Claude que ingieren el contexto de brand leyendo ficheros markdown** (`Read` sobre el `current`). Las skills server-side leen del filesystem directamente, no vía un resolver de API. Cualquier diseño preserva esto o asume el coste de reescribir el read-path de ~40 skills.

---

## 4. Qué dice la investigación (2024-2026)

Cuatro líneas de investigación, con ~100 fuentes (mayoría 2024-2026). **Cada capa tiene un ganador distinto:**

- **Para que el AGENTE LEA el contenido vivo → ficheros markdown.** Señal 2025-2026 convergente (Anthropic *Effective context engineering*, sep 2025; LangChain nov 2025; LlamaIndex *Files are all you need* ene 2026; Manus jul 2025). Pre-indexar en vector store es contraproducente con read+write (índice stale en cada escritura). Anthropic quitó vector search de Claude Code (may 2025) por grep.
- **Para VERSIONAR → Postgres append-only (NO git, NO `vN.md`).** Patrón "head pointer + filas inmutables" (MediaWiki/Notion/Confluence). Git-as-DB se rechaza (no transaccional con la app; no escala — Homebrew/CocoaPods/Cargo/Go/Gollum migraron fuera, Nesbitt dic 2025). `content_sha256` da dedup+idempotencia.
- **Postgres dueño de TODO el contenido → válido pero no compensa aquí** (pierde git-diff, obliga a render layer; cf. TinaCMS files-as-truth + DB-as-cache).

### Síntesis

| Capa | Ganador |
|---|---|
| Contenido vivo del doc (lo que lee el agente) | **Fichero markdown** |
| Historia de versiones / audit | **Postgres append-only** |
| Índice cross-cliente / queryability | **Postgres** |
| Datos crudos de scraping | **Postgres + blob store** |

---

## 5. Recomendación — una plantilla (blueprint) + una fuente única por cliente

**El modelo:** Sancho es un conjunto de hilos/sesiones, y **cada sesión se ata a cinco cosas — agente, skill, carpeta donde escribe, tarea que le da entidad, y progreso.** Hoy viven desperdigadas. El objetivo es **dos** únicos:

- **(1) El blueprint — plantilla de sistema (en `config/`).** Un manifiesto que define, por pilar/tarea, su contrato `{agente, skill, carpeta de salida, objetivo, done-criteria, dependencias}`. Plantilla, no verdad. Reemplaza lo disperso: tareas hardcodeadas en `reseed-foundation.sh`, `pillar-doc-paths.ts`, `chat-config.pillars`, `pillar-registry.md`, y la copia a mano de skill-ownership. *(Implementado en este PR como `config/pillar-manifest.json`.)*
- **(2) La fuente única por cliente — la verdad del trabajo formal (Postgres, tabla `tasks` existente, reusada).** Al crear cliente, el blueprint se **instancia** en filas de `tasks` con `{agente, skill, deliverable_file, objetivo, status, mc_chat_thread_id}`. La tabla ya tiene los campos; producción corre en modo ficheros (`MC_TASKS_BACKEND="files"`). El movimiento es hacer la DB la verdad. `discordThreadId` se quita del modelo.

**NO toda sesión es una task:** los hilos viven como ficheros `brand/{slug}/chat/{threadId}.json`; enlazan a task solo si son trabajo formal. La atadura `{agente, skill, carpeta}` deja de adivinarse: para trabajo formal vive en `tasks`; para hilos de pilar sale **determinísticamente del blueprint**.

El **contenido** de los brand docs (lo que el agente lee) sigue en ficheros: `{carpeta}-current.md`, con la **historia en Postgres** (append-only, content-hash; fuera `vN.md`). La fila de `tasks` dice **dónde** escribe; el fichero es **qué**. Scraping → Postgres.

**Consecuencias:** `foundation-state.json` → vista derivada del estado de tareas. Los 4 resolvers colapsan en un lookup de la fila. Lo que más fallaba — "dónde escribe la sesión" (`deliverable_file`, el eslabón más débil) — se fija en la instanciación desde el blueprint.

### 5.1 El blueprint único + naming canónico (dolor #1) — IMPLEMENTADO (núcleo)

Manifiesto en `config/pillar-manifest.json` (core de plataforma, por encima de cualquier agente; `config/` está symlinkeado desde `workspace-sancho/_system/`). Des-duplica el modelo de pilar, hoy esparcido en 5 sitios (`pillar-doc-paths.ts`, `pillar-registry.md`, `chat-config.pillars`, `skill-resolver.ts`, `dispatch-map.json`). Gate `lint:paths` enganchado al `pre-push` bloqueante.

**Naming canónico decidido: `{carpeta}-current.md` (guion)** — cambia el `{carpeta}.current.md` de SAN-103. *(Pendiente de aplicar — ver estado arriba.)* Seguridad del corte: **golden test de equivalencia** (el manifiesto reproduce los mapas viejos exactamente) — implementado.

### 5.2 Versionado inmutable en Postgres (dolor #2) — PENDIENTE (F3)

Honra el diseño de `current`: el agente lee SOLO el `{carpeta}-current.md`; las versiones viejas se preservan pero salen del filesystem (a Postgres). Dos tablas:

```
brand_documents        -- registro + puntero "current" (1 fila por documento lógico)
  id, slug, pillar, pillar_path, doc_kind(full|fastcontext|merge_view),
  doc_path, status(draft|pending_review|approved|stale|archived),
  current_version_id → document_versions.id, qa_status, qa_score,
  checksum, author_skill, source_artifact_ids jsonb,
  file_updated_at, indexed_at, created_at, updated_at
  UNIQUE(slug, pillar)

document_versions      -- historia inmutable append-only (reemplaza vN.md + history.json)
  id, document_id→brand_documents(cascade), slug, pillar, version_no int,
  content text, content_hash, author_skill, author_kind(skill|human|migration),
  mode, qa_status, qa_score, notes, parent_version_id → self, source_refs jsonb, created_at
  UNIQUE(document_id, version_no), UNIQUE(document_id, content_hash)
```

Escritura: la skill escribe el fichero `current`; un helper calcula `content_hash`; si difiere → INSERT versión + avanzar puntero en la misma transacción. `current` = puntero (escribir versión nueva no destruye la anterior). Rollback = mover puntero. Diff/audit = SQL.

### 5.3 La verdad operativa por cliente = tabla `tasks` — PENDIENTE (F2)

`tasks` (Postgres) = verdad del trabajo formal (reusa la tabla; sin `discord_thread_id`). `foundation-state.json` = vista derivada (ya hay `rebuild-foundation-state.mjs`). `brand_documents`/`document_versions` = índice + historia, atado a la tarea vía `deliverable_file`.

### 5.4 Store de scraping (dolor #3) — PENDIENTE (F4)

```
research_artifacts
  id, slug, topic, run_id, source(apify|firecrawl|scrapecreators|dataforseo|web_fetch),
  source_url, source_ref jsonb, content_type, content_hash, byte_size,
  storage(blob|inline), blob_uri, raw_text, extract_md, fetched_at, expires_at, status, created_at
  UNIQUE(slug, source, content_hash)

artifact_citations
  id, artifact_id→research_artifacts(cascade), document_id→brand_documents(set null),
  document_version int, citation_anchor, created_at
```

Dedup por `content_hash`; blob vs inline (arrancar local `_system/artifacts/`, abstraer para S3/R2 — ya hay `@aws-sdk/client-s3`); provenance vía `source_ref` + `artifact_citations`; retención `expires_at`.

### 5.5 Sincronización y consumo markdown

Las skills no cambian su forma de leer (`{carpeta}-current.md` del filesystem; la DB no está en el read-path). Write-hook (el helper escribe fichero + INSERT versión/puntero). Reconciler periódico (cron compara checksums vs `brand_documents`). El índice es reconstruible desde los ficheros; la historia de versiones es DB-autoritativa (entra en el backup de Postgres). Degradación: si la DB está caída, el fichero `current` igual se escribe y se reconcilia luego.

---

## 6. Roadmap por fases

No optimizamos para migrar clientes actuales; optimizamos para que el sistema futuro sea correcto. Invariante en todas las fases: el agente siempre lee el `current` del filesystem.

| Fase | Qué | Estado |
|---|---|---|
| **F0 — Blueprint único** | `config/pillar-manifest.json`; `pillar-doc-paths.ts`/`skill-resolver.ts` derivan; `lint:paths` + golden test. | ✅ **Hecho** (este PR) |
| **F1 — Normalizar paths + naming** | Declaraciones a canónico; resolver `doc-paths.ts` (dot→guion); `lint:paths` bloqueante. | 🟡 **Núcleo hecho** (declaraciones + gate). **Naming dot→guion pendiente** |
| **F2 — Tasks = verdad por cliente** | `MC_TASKS_BACKEND=db`; `deliverable_file` desde el blueprint; `foundation-state.json` → vista; colapsar resolvers. | 🔜 Pendiente (decisiones §8) |
| **F3 — Índice + versionado de docs** | `brand_documents` + `document_versions`; helper transaccional; fuera `vN.md`. | 🔜 Pendiente |
| **F4 — Store de scraping** | `research_artifacts` + `artifact_citations`; helper `storeArtifact()`. | 🔜 Pendiente |

---

## 7. Trade-offs — por qué el híbrido refinado

Los ficheros ganan donde el agente lee/escribe contenido vivo (señal 2025-2026 inequívoca); Postgres gana en versionado, audit y query cross-cliente; meter *todo* el contenido en la DB no compensa para nuestro perfil (pierde git-diff, obliga a render layer, blobs en serverless cuestan). El híbrido refinado toma el ganador de cada capa, reusando Neon+Drizzle.

---

## 8. Decisiones abiertas (para Martín & Diego, antes de F2–F4)

- **D0 · ¿Persistimos la atadura de los hilos NO-task?** Recomendado: promover a task al primer entregable; chat puro sin entregable no persiste atadura.
- **D1 · Nombre canónico — DECIDIDO:** `{carpeta}-current.md` (guion). Ajustar `CANONICAL_DOC_RE`. Coordinar con SAN-13.
- **D2 · Relación con SAN-13:** usa `fastcontext.current.md` + `vN.md`. ¿Migrar en F1/F3, o ajustar SAN-13 antes?
- **D3 · ¿Dónde se preservan las versiones viejas?** Recomendado: Postgres (`document_versions.content`), fuera del read-path. ¿DB-only o también redundancia en disco?
- **D4 · `foundation-state.json` write-back:** confirmar FS→DB only (la DB nunca escribe de vuelta).
- **D5 · Blob store:** ¿local `_system/artifacts/` o S3/R2 directo?
- **D6 · Concurrencia:** ¿`pg_advisory_lock` por `slug:pillar`, o hash-no-op + last-writer-wins?
- **D7 · Retrofit de `mi_document_impacts`/`feedback_insights`/`shared_doc_comments`:** ¿FK a `brand_documents.id` o seguir con string de path?
- **D8 · Retención de raw por TOS** (Apify/scrapecreators/DataForSEO difieren).
- **D9 · `pgEnum` vs string-enum:** recomendado mantener text-con-default (convención del repo).

---

## 9. Archivos clave

- `config/pillar-manifest.json` — fuente única (✅ creado).
- `src/lib/pillar-doc-paths.ts` + `src/lib/skill-resolver.ts` — derivan del manifiesto (✅).
- `scripts/lint-paths.mts` + `.husky/pre-push` — gate anti-drift (✅).
- `src/lib/server/doc-paths.ts` — `CANONICAL_DOC_RE` a cambiar `.current.`→`-current.` (🔜 F1 naming).
- `scripts/reseed-foundation.sh` — instanciar tareas del manifiesto (🔜).
- `src/db/schema.ts` — añadir `brand_documents`, `document_versions`, `research_artifacts`, `artifact_citations` (🔜 F3/F4).
- `src/lib/data/tasks.ts` (`MC_TASKS_BACKEND`), `pillar-task-sync.ts`, `rebuild-foundation-state.mjs` — F2.
- `src/lib/data/pov-bank.ts` — precedente `materializePovBank`.
- `workspace-sancho/dispatch-map.json` — roster (adelgazado ✅); `SKILL_OWNER_MAP` drift-guard 🔜.

---

### Fuentes (selección)
Anthropic *Effective context engineering* (sep 2025) · LangChain (nov 2025) · LlamaIndex *Files are all you need* (ene 2026) · Manus (jul 2025) · Nesbitt *git as a database* (dic 2025) · VersionRAG (arXiv 2510.08109) · MediaWiki/Notion/Confluence · TinaCMS · benchmarks Postgres/JSONB 2026.

### Tracking
Epic en Linear (equipo SAN-) con issue por fase F0–F4. F0 (pillar-manifest) primero, prerequisito. Relacionado: SAN-103 (naming, en staging), SAN-13 (fastcontext).
