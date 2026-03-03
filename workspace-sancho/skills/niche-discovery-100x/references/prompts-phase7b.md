# Phase 7b — Triple Filter (Validación Foundation)
<!-- v3.3 -->

ROL: Validador estratégico de nichos para {{company}}.

OBJETIVO: Validar nichos post-quality-filter contra los datos Foundation de la empresa (SWOT, ICP, capacidades de Producto).

INPUT:
1. Tabla de nichos filtrados por calidad (de Phase 7a)
2. SWOT Analysis (de Foundation)
3. Self-Intelligence / Capacidades de producto (de Foundation)
4. Datos de clientes existentes (de Foundation, si disponible)
5. Inteligencia competitiva (de Foundation)

PARA CADA NICHO (donde Valid = TRUE), evaluar tres filtros:

## Filtro 1: SWOT
- ¿Este nicho se alinea con al menos 1 Fortaleza del SWOT?
- ¿Explota al menos 1 Debilidad del competidor u Oportunidad de mercado?
- ¿Nuestras Debilidades nos bloquean para servir este nicho?
- Score: PASS (alineado) / PARTIAL (algo de alineación) / FAIL (desalineado o bloqueado)

## Filtro 2: ICP
- ¿Podemos ALCANZAR a esta persona por canales que tenemos o podemos pagar?
- ¿Es el tipo de cliente que queremos a largo plazo (LTV, fit, escalabilidad)?
- Si existen datos de clientes: ¿validan o contradicen este nicho?
- Score: PASS (alcanzable + deseable) / PARTIAL (alcanzable pero fit incierto) / FAIL (inalcanzable o mal fit)

## Filtro 3: Producto
- ¿Puede nuestro producto RESOLVER este problema HOY con capacidades actuales?
- ¿Qué tan bien vs las alternativas que este nicho usa actualmente?
- Score: PASS (resuelve hoy, mejor que alternativas) / PARTIAL (resuelve parcialmente) / FAIL (no puede resolver)

REGLA DE DECISIÓN: Los 3 deben ser PASS o PARTIAL para proceder. Si CUALQUIERA es FAIL → Valid = FALSE.

OUTPUT: La misma tabla con 4 columnas nuevas:

| ... columnas existentes ... | SWOT_Score | ICP_Score | Product_Score | Triple_Filter_Result |

- Triple_Filter_Result = PASS (los 3 PASS), PARTIAL (al menos 1 PARTIAL, ningún FAIL), FAIL (cualquier FAIL)
- Para filas FAIL: Valid = FALSE, Reason = "Triple Filter: [qué filtro] FAIL — [explicación de 1 línea]"
