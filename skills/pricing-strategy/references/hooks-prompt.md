# Pricing Hooks — Prompts

## Prompt 1: Auditoría de Precios Actual

```
Analiza el pricing actual del cliente basándote en:
- business-model/business-model-current.md (modelo de negocio, revenue streams)
- budget/budget-current.md (márgenes, costes)
- company-context/company-context-current.md (contexto general)

Documenta:
1. Modelo de pricing actual (por sesión, paquete, suscripción, etc.)
2. Rango de precios (mínimo-máximo)
3. Márgenes estimados (si hay datos)
4. Percepción del cliente sobre su propio pricing
5. Problemas o fricciones actuales con el pricing

Si no hay datos → marcar como 🔴 DUDA y preguntar al usuario.
```

## Prompt 2: Análisis Competitivo de Precios

```
Usando competitors/competitors-current.md como base, investiga los precios REALES de cada competidor.

Para CADA competidor:
1. Buscar pricing page o precios publicados (web_search + web_fetch)
2. Si no hay precios públicos → buscar reviews, comparativas, foros
3. Documentar: servicio | precio | modelo | qué incluye | fuente

Tabla resumen:
| Competidor | Servicio principal | Precio | Modelo | Fuente |
|---|---|---|---|---|

Análisis:
- Rango de mercado (min-max)
- Precio medio del sector
- ¿Quién es el más caro y por qué?
- ¿Quién es el más barato y por qué?
- ¿Hay correlación precio-calidad percibida?

IMPORTANTE: Cada precio DEBE tener URL de fuente. NO inventar precios.
```

## Prompt 3: Mapeo de Valor

```
Cruza positioning/positioning-current.md + swot-analysis/swot-analysis-current.md con el pricing:

1. ¿Qué valor único entrega el cliente que justifica un precio premium?
2. ¿Qué diferenciadores tienen precio asociado?
3. Value Metric: ¿cuál es la unidad natural de cobro?
   - ¿Por resultado? (transplante exitoso, lead generado)
   - ¿Por tiempo? (sesión, mes, año)
   - ¿Por paquete? (tratamiento completo)
   - ¿Por volumen? (número de injertos, horas)

4. Mapear:
   | Diferenciador | Valor percibido | Justifica premium? | Cuánto? |
   |---|---|---|---|

5. ¿El pricing actual captura el valor entregado? ¿Hay gap?
```

## Prompt 4: Estructura de Tiers

```
Basándote en el análisis anterior, propón estructura de precios:

Para cada tier/paquete:
- Nombre (descriptivo, no genérico)
- Servicios incluidos
- Precio recomendado (rango: mínimo-óptimo-máximo)
- Target (qué ECP/niche)
- Justificación (por qué este precio)

Considerar:
- ¿Tiene sentido tiers o precio único?
- ¿Pricing público o privado? (sector médico suele ser privado)
- ¿Financiación/pagos fraccionados?
- ¿Paquetes vs. à la carte?

El objetivo: maximizar conversión Y ticket medio.
```

## Prompt 5: Hooks Psicológicos

```
Aplica mínimo 5 de estos hooks al caso del cliente:

1. ANCLAJE: ¿Qué precio alto podemos mostrar como referencia?
2. DECOY: ¿Qué opción intermedia empuja al tier deseado?
3. CHARM PRICING: ¿Dónde aplicar precios psicológicos?
4. BUNDLING: ¿Qué paquetes aumentan ticket medio?
5. URGENCIA: ¿Qué promociones temporales tienen sentido?
6. GARANTÍA: ¿Qué garantía reduce riesgo? (satisfacción, resultados)
7. FRACCIONAMIENTO: ¿Cómo presentar el precio en unidades pequeñas?
8. SOCIAL PROOF: ¿Cómo usar "el más elegido" o "recomendado"?
9. VALUE FRAMING: ¿Cómo comparar coste vs beneficio?
10. LOSS AVERSION: ¿Qué pierde si no compra?

Para CADA hook seleccionado:
- Ejemplo concreto aplicado al negocio del cliente
- Dónde aplicarlo (web, ads, consulta, propuesta)
- Impacto esperado
```

## Prompt 6: Plan de Implementación

```
Cronograma práctico:

QUICK WINS (1-2 semanas):
- Cambios inmediatos en comunicación de precio
- Hooks que se pueden aplicar ya

MEDIO PLAZO (1-3 meses):
- Reestructuración de tiers si aplica
- A/B tests de pricing page
- Nuevos paquetes/bundles

MÉTRICAS:
- Conversión de consulta a venta
- Ticket medio
- Margen por servicio
- Ratio de upsell/cross-sell

TESTS RECOMENDADOS:
- Qué testear, cómo, y qué resultado esperamos
```
