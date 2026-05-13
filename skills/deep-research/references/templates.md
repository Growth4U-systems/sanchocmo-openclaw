# Deep Research — Templates

Used in Phase 5 (DETAILED ANALYSIS).

---

## Principio Fundamental

**El documento final es para una PERSONA que quiere ENTENDER un tema.** No es un log de investigación, no es una lista de fuentes, no es un resumen de pasos. Es un documento analítico que:

1. Contextualiza el tema (por qué importa, qué está pasando)
2. Presenta hallazgos con análisis (no solo datos, sino qué significan)
3. Identifica patrones, tendencias e implicaciones no obvias
4. Da recomendaciones accionables

**Test del lector:** Si alguien lee el documento sin saber nada del proceso de investigación, ¿entiende el tema? ¿Puede tomar decisiones? Si la respuesta es sí, el documento está bien.

---

## Full Document Structure

```markdown
# [Título descriptivo del research]

**Fecha:** YYYY-MM-DD
**Para:** [Nombre del stakeholder y rol]
**Investigación:** Growth4U
**QA Score:** [se llena tras Phase 6]

---

## Resumen Ejecutivo

[2-4 párrafos que cuentan LA HISTORIA. No bullets de datos sueltos. 
Narrativa: qué investigamos, qué encontramos, qué significa, qué recomendamos.
Debe ser autosuficiente — alguien que solo lea esto entiende lo esencial.]

**Hallazgo clave:** [La cosa más importante/sorprendente que descubrimos]

---

## Contexto y Panorama

[Sección narrativa que sitúa al lector. ¿Cuál es el mercado? ¿Qué tendencias 
lo están moviendo? ¿Por qué importa investigar esto ahora?

Datos de mercado con fuentes inline [1], pero integrados en prosa, no como 
tabla de datos sin contexto. El lector debe entender el "so what" de cada dato.]

---

## [Sección Analítica 1: Nombre descriptivo]

[Prosa analítica. Cada sección aborda un ángulo/dimensión del tema.
Estructura: contexto → hallazgos → análisis → implicaciones.

Las tablas comparativas son bienvenidas DENTRO de la narrativa, pero siempre 
acompañadas de análisis: qué significa la comparación, qué patrones se ven.

Ejemplo bueno:
"El mercado se divide en tres modelos claramente diferenciados. Los bancos 
tradicionales (Santander, CaixaBank) operan bajo un modelo tácito donde el 
descubierto se activa sin intervención del cliente [1][2]. En contraste, 
los neobancos (N26, Revolut) requieren activación explícita [3]. Lo 
interesante es que BBVA ocupa un tercer espacio: activa por defecto pero 
permite desactivar — un modelo opt-out que no encaja en ninguna categoría 
convencional [4]."

Ejemplo malo:
"Fuentes consultadas: BBVA.es, N26.com, CaixaBank.es
Datos extraídos: BBVA tiene descubierto tácito. N26 requiere activación.
Búsquedas realizadas: 'descubierto bancario España', 'overdraft neobank'..."]

---

## [Sección Analítica 2: Nombre descriptivo]

[Misma estructura narrativa. Tantas secciones como el tema requiera.]

---

## [Sección Analítica N]

---

## Análisis Comparativo

[Si hay entidades comparables (empresas, productos, mercados), aquí va la 
tabla comparativa PERO precedida y seguida de análisis narrativo.

La tabla es una herramienta visual, no el contenido principal.
Antes: qué estamos comparando y por qué estas dimensiones importan.
Después: qué patrones revela la tabla, qué insights no obvios emerge.]

| Dimensión | Entidad A | Entidad B | Entidad C |
|-----------|-----------|-----------|-----------|
| ... | ... | ... | ... |

[Análisis de la tabla: patrones, outliers, implicaciones]

---

## Implicaciones y Hallazgos No Obvios

[¿Qué revela el análisis que el lector no esperaba? ¿Qué conexiones 
no evidentes hay entre los datos? ¿Qué tendencias emergentes se detectan?

Esta sección es donde el research aporta su mayor valor — el "so what" 
que justifica haber hecho un deep research en vez de un Google rápido.]

---

## Recomendaciones

[Acciones concretas para el stakeholder, priorizadas.
Cada recomendación: qué hacer + por qué + evidencia que la respalda.
No recomendaciones genéricas ("seguir investigando") — solo accionables.]

1. **[Acción concreta]** — [Justificación basada en hallazgos] [N]
2. **[Acción concreta]** — [Justificación] [N]
3. ...

---

## Referencias

[Todas las fuentes citadas en el documento, numeradas. 
Esta es la ÚNICA sección donde se listan fuentes. En el cuerpo del 
documento, las fuentes se citan inline como [N].]

[1] Título — Organización (YYYY-MM). URL
[2] Título — Organización (YYYY-MM). URL
...
```

---

## Per-Entity Deep Dive (cuando aplica)

Cuando el research compara entidades (empresas, productos, países), cada una puede tener su sección detallada. Pero SIEMPRE como prosa analítica, no como ficha de datos:

```markdown
### [Nombre de la Entidad]

[Párrafo de contexto: quién es, qué hace, por qué es relevante para este research.]

[Párrafo de análisis: cómo se posiciona en el landscape, qué la diferencia, 
qué modelo sigue. Datos integrados en la narrativa con citas [N].]

[Párrafo de implicaciones: qué significa esto para el stakeholder. 
¿Es una amenaza? ¿Una oportunidad? ¿Un modelo a seguir?]

**Datos clave:**
| Dimensión | Valor | Confianza |
|-----------|-------|-----------|
| ... | ... | verified/reported/inferred |

**Fuentes:** [N], [M]
```

**Regla:** Cada entidad recibe el mismo nivel de profundidad (cobertura simétrica). Si una entidad tiene 3 párrafos de análisis, todas deben tener ~3 párrafos.

---

## Lo que NO debe aparecer en el documento final

❌ Lista de búsquedas realizadas ("Busqué X, Y, Z...")
❌ Narración del proceso ("Primero consulté la web de BBVA, luego...")
❌ Inventario de fuentes como sección principal (va solo en Referencias al final)
❌ Extractos literales sin analizar ("La web de X dice textualmente...")
❌ Notas internas del investigador ("TODO: verificar", "Pendiente: cruzar con...")
❌ Metadatos de proceso (número de búsquedas, tiempo invertido, queries usadas)

**Todo eso va en la carpeta `{topic}-raw/`.** El documento final es limpio, analítico, para el lector.

---

## Citation Format

**Inline (within prose):**
```
dato relevante [1]
```
or
```
dato relevante [Fuente: Título](url)
```

**In data tables**: cite via footnote `[N]`.

**Sin fuente verificada:** `⚠️ Estimación sin fuente verificada: dato`

**Fuente única (no cross-validated):** `⚠️ Fuente única [N]: dato`

**Conflicting sources:** `dato (rango: X-Y) [N1][N2]` con nota explicando la discrepancia.
