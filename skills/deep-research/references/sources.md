# Deep Research — Source Discovery & Priorities

Used in Phase 2 (SOURCE DISCOVERY) and Phase 3 (DATA EXTRACTION).

---

## Source Categories (Priority Order)

| Priority | Type | Examples |
|----------|------|----------|
| **1** | **Official** | Bank/company websites, regulator sites (BdE, CNMV, ECB), company docs, press kits |
| **2** | **Comparison** | Rankia, Roams, HelpMyCash, Kelisto, BusconOmico, G2, Capterra |
| **3** | **News** | El Economista, CincoDías, Expansión, Bloomberg, FT, sector-specific |
| **4** | **Legal/Regulatory** | BOE, Tribunal Supremo rulings, EU directives, regulator notes |
| **5** | **Community** | Reddit, Forocoches, Twitter/X, specialized forums |
| **5b** | **Social Pulse** (Phase 2b) | last30days output (Reddit, X, YouTube, TikTok, HN, GitHub, Polymarket — last 30 days) |

---

## Reliability Rating (A/B/C)

Anota cada fuente con su rating en el source inventory (Phase 2 output).

| Rating | Criterio | Ejemplo |
|--------|----------|---------|
| **A** | Primary source, dated, organization-backed | Página oficial de un banco con tarifas; SEC filing |
| **B** | Secondary source, reputable, dated | Artículo de Bloomberg; Statista chart |
| **C** | Tertiary, undated, blog/forum | Reddit thread; blog SEO sin firma |

**Regla:** rating C solo válido como **señal cualitativa** o como cross-check. Nunca como única fuente para una claim numérica.

---

## Source Discovery Strategy

### Mínimo 5 queries diferentes por sección, variando 3 ejes:

**1. Idioma:**
- Español (para mercado Spain)
- Inglés (mercados globales, comparativas)
- Idioma local (DE/FR/IT) si la entity opera ahí

**2. Ángulo:**
- Nombre del producto (ej. "descubierto BBVA")
- Término regulatorio (ej. "comisión descubierto Banco de España")
- Comparativa (ej. "mejor cuenta sin comisiones España")
- Foro consumidor (ej. "experiencia descubierto Reddit")

**3. Tipo de fuente:**
- Sites oficiales (`site:bbva.es`)
- Plataformas comparación
- Reguladores
- Prensa especializada
- Foros / community

### Output Phase 2: Source Inventory

```markdown
## Source Inventory

| # | URL | Tipo | Categoría | Rating | Likely contains |
|---|-----|------|-----------|--------|-----------------|
| 1 | https://bbva.es/... | Oficial | 1 | A | Tarifas descubierto, condiciones |
| 2 | https://rankia.com/... | Comparación | 2 | B | Análisis comparado |
| 3 | https://reddit.com/r/... | Community | 5 | C | Sentiment de usuarios |
| ... |
```

**Mínimo 10 fuentes** antes de pasar a Phase 3. Si <10, ejecutar más queries.

---

## Phase 2b: Social Pulse Activation Matrix

| Activate | Skip |
|----------|------|
| Community perception drives the insight | Pure regulatory / legal landscape |
| Topic trending or emergent | Historical analysis |
| Need market buzz beyond official data | Feature comparison from official docs |
| User sentiment is part of the answer | Topic too niche for social channels |

Si dudas, pregunta al usuario: *"This topic may benefit from a social pulse check (last30days). Should I run it?"*

**Comando:**
```bash
python3 ~/.claude/skills/last30days/scripts/last30days.py "[research topic]"
```
Foreground, 5-min timeout. Output se integra como categoría 5b en el source inventory.

---

## Edge Cases

- **Sector nicho sin fuentes oficiales**: documentar gap, buscar mercados proxy (otro país con sector similar)
- **Idioma mixto**: buscar en ambos idiomas, presentar resultado en idioma del documento (español por defecto en Sancho)
- **Fuentes contradictorias**: presentar rango con ambas referencias `[N1][N2]`, usar estimación conservadora
- **Pre-2023**: solo válido si es dato histórico estructural; para cifras de mercado actuales, descartar
- **Wikipedia**: solo como puente — copiar las primary sources de los `<ref>`, descartar el wiki como fuente primaria
