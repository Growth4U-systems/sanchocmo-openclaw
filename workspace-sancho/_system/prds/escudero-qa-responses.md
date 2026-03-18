# Respuestas Q&A — Escudero × SanchoCMO

---

## 🏗️ Q1. Deploy: ¿Railway, Render, o Fly.io?

Pendiente Alfonso. Mi recomendación rápida:

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| **Railway** | Deploy desde GitHub en 2 min, buen DX, $5/mo base | Menos control de infra | ✅ Mejor para MVP |
| Render | Free tier, auto-deploy | Cold starts en free tier | Bueno si hay presupuesto cero |
| Fly.io | Edge deploy, más control | Setup más complejo, CLI-driven | Overkill para esto |

**Lo que necesita el Dockerfile:**
```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y libgl1-mesa-glx  # para Pillow
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Variables de entorno mínimas: `DATABASE_URL` (PostgreSQL de Supabase) + `OPENROUTER_API_KEY`.

---

## 📱 Q2. Social Publishing — ¿Cómo publicamos?

**Recomendación: Opción C para MVP, migrar a A cuando haya volumen.**

| Fase | Método | Por qué |
|---|---|---|
| MVP (ahora) | **C) Manual** — Sancho genera, humano publica | Zero infra, zero riesgo de ban, valida que el contenido funciona |
| V2 (3+ clientes) | **A) APIs directas** | LinkedIn API y Meta Graph API son gratis, Twitter API v2 tiene free tier |
| Nunca | B) Buffer/Hootsuite | Costo innecesario, las APIs son mejores para automatización |

El content-atomizer genera los textos listos para copiar/pegar. No necesitamos más para validar.

---

## 🤖 Q3. Secuencia de engagement — ¿Cuál es la definitiva?

**La de FLUJOS-INTEGRACION.md es la definitiva** (la más detallada):

**Instagram (7 días):**
```
Día 1: View profile + Follow
Día 2: Like 2 posts recientes
Día 4: Like 1 post + View story
Día 7: Comment en post relevante (LLM-generated)
```

**LinkedIn (10 días):**
```
Día 1: View profile
Día 2: Connection request (con nota personalizada)
Día 5: Like 2 posts
Día 8: Comment en post relevante (LLM-generated)
Día 10: Like 1 post más
```

La de SPEC-BOTS era el resumen simplificado. Actualizo la spec para que coincidan si hace falta.

---

## 🤖 Q4. Costo bots ~$149/mes — ¿cliente o Growth4U?

**Recomendación: al cliente, dentro del plan mensual.**

| Componente | Costo real | Markup sugerido |
|---|---|---|
| Apify (IG) | $49 | |
| Proxies | $75 | |
| VPS | $20 | |
| LLM comments | $5 | |
| **Total costo** | **$149** | |
| **Precio al cliente** | | **$249-299/mes** como add-on |

Integrable con Polar.sh credits: 1 mes de bots = X créditos.

---

## 🔗 Q5. Nichos Escudero vs ECPs/Foundation

**Recomendación: Opción C — si hay Foundation, importar; si no, Escudero genera.**

```
¿Cliente tiene Foundation data?
  │
  ├── SÍ → Importar ECPs como Niches de Escudero
  │         niche.name = ECP.name
  │         niche.brief.A = positioning data
  │         niche.brief.C = target audience del ECP
  │         Competidores del ECP → NicheBrands
  │
  └── NO → Escudero auto-onboarding genera nichos via LLM
            POST /quick-start → scrape website → sugiere 2-3 nichos
```

**Implementación**: Un endpoint nuevo `POST /api/v1/projects/{id}/import-foundation` que recibe los ECPs y crea Niches + NicheBrands.

---

## 🔗 Q6. ¿Escudero lee datos de Foundation?

**Sí, debería.** Los datos de Foundation mejoran significativamente la calidad del output:

| Dato Foundation | Dónde lo usa Escudero | Impacto |
|---|---|---|
| `positioning` | `niche.brief.A` (contexto de marca) | Artículos más on-brand |
| `brand_voice` | System prompt del article_generator | Tono consistente |
| `ECPs` | Nichos + keywords | Keywords más relevantes |
| `target_audience` | `niche.brief.C` | Contenido para la audiencia correcta |
| `competitors` | NicheBrands | Gap analysis más preciso |

**Implementación**: El endpoint `/import-foundation` mapea estos campos. O Escudero lee directamente de las tablas de Foundation si comparten DB.

---

## 🔀 Q7. seo-audit de Sancho vs Site Audit de Escudero (RF-07)

**Escudero reemplaza al skill de Sancho.**

| Aspecto | Skill Sancho actual | Escudero RF-07 |
|---|---|---|
| Lighthouse | Probablemente básico | Google PSI API con retry + graceful degradation |
| Health checks | ? | 15 checks (sitemap, robots, canonical, SSL, structured data, meta tags, mobile, alt tags, links) |
| Issues | ? | Auto-generados con severity + fix steps + expected impact % |
| Storage | Ephemeral (Discord) | Persistente en DB (site_audits) |
| Histórico | No | Sí — se puede comparar audits en el tiempo |
| Recomendaciones | No | Sí — alimenta Recommendation Engine |

**Acción**: El skill `seo-audit` de Sancho pasa a ser un wrapper que llama `POST /api/v1/audit/run` de Escudero y formatea el resultado para Discord.

---

## 🔀 Q8. ai-seo de Sancho vs GEO Analysis de Escudero (RF-04)

**Escudero reemplaza, misma lógica.**

| Aspecto | Skill Sancho actual | Escudero RF-04 |
|---|---|---|
| Providers | ? | 4 simultáneos (OpenAI, Anthropic, Gemini, Perplexity) |
| Turns | Probablemente 1 | 3-turn conversation (discovery → why → sources) |
| Parsing | ? | Brand mentions con position + sentiment + context |
| Citations | ? | URLs extraídas de markdown links, bare URLs, native (Perplexity) |
| Storage | Ephemeral | Persistente (geo_runs, geo_responses, brand_mentions, source_citations) |
| Cross-reference | No | Sí — Gap Analysis cruza GEO × SEO |

**Acción**: El skill `ai-seo` de Sancho pasa a ser un wrapper que llama `POST /api/v1/geo/runs` y resume resultados en Discord.

---

## 📦 Q9. Código

**El código ES este repo.** Todo está aquí:

```
/backend/              ← Backend Python completo y funcional
  app/
    config.py          ← Settings (.env)
    database.py        ← SQLAlchemy engine + migrations
    main.py            ← FastAPI app
    models/            ← 15 archivos, 19 tablas
    engines/           ← 46 archivos de lógica
    api/v1/            ← 16 archivos, 65+ endpoints
    tasks/             ← 9 archivos de background tasks
    schemas/           ← Pydantic request/response
  requirements.txt

/frontend/             ← Frontend Next.js completo y funcional
  src/
    app/               ← 30 páginas
    components/        ← AppSidebar, UI
    lib/api.ts         ← API client TypeScript
  package.json
```

Si necesitas un repo GitHub separado o un zip, puedo prepararlo.

---

## 📄 Q10. ¿Más docs?

**Con los 5 docs ya está todo:**

| # | Documento | Qué cubre |
|---|---|---|
| 1 | `PDR-Escudero-SanchoCMO.md` | Lógica completa: tablas, RFs, endpoints, fórmulas (~1200 líneas) |
| 2 | `DECISIONES-ARQUITECTURA.md` | Decisiones: infra, multi-tenant, social, bots |
| 3 | `SPEC-BOTS-IG-LINKEDIN.md` | Spec bots: acciones, rate limits, anti-ban, costos |
| 4 | `FLUJOS-INTEGRACION.md` | 6 flujos, mapa de skills, diagrama ecosistema |
| 5 | `RESPUESTA-REPO.md` | Resumen ejecutivo para el repo |
| 6 | `RESPUESTAS-QA.md` | **Este doc** — respuestas a las 10 preguntas |

Lo único que podría faltar es un **CHANGELOG** si quieren tracking de versiones, pero el `git log` ya tiene eso:
```
b8be6a9 fix: detect B2B context and prompt domain analysis
228725e fix: keyword generation confuses B2B client with its target sector
dc5be7f fix: pencil on NicheCard goes to config form
517fc7b feat: UX overhaul — niche config flow, edit campaign, storytelling copy
d260926 feat: initial commit — Escudero SEO+GEO Intelligence
```
