# Hydration Map — market-intelligence

> Leer upstream para enfocar la investigación, no para pre-rellenar respuestas.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | industry_vertical | industry, vertical | exacto | Define el mercado a investigar |
| company-context | markets_served | geography | exacto | Foco geográfico |
| company-context | b2b_b2c | (filtro) | exacto | B2B vs B2C cambia fuentes y segmentación |
| company-context | product_type | (filtro) | exacto | SaaS/Service/Physical cambia el análisis |
| company-context | elevator_pitch | (contexto) | exacto | Para entender qué mercado analizar |
| company-context | key_features | (contexto) | exacto | Para identificar sub-segmentos relevantes |
| company-context | current_channels | (contexto) | exacto | Para saber qué canales investigar |
| competitors (si existe) | leaders | leaders (seed) | exacto | No re-descubrir competitors ya conocidos |
| competitors | market_concentration | market_concentration | exacto | Si competitor-intel ya lo determinó |

## Campos genuinamente nuevos (siempre investigar)

| Campo | Por qué no existe upstream | Método |
|-------|--------------------------|--------|
| tam (valor, crecimiento) | Ningún pilar anterior calcula TAM | Deep research + DataForSEO |
| tam_segments | Segmentación de mercado no existe | Research + análisis |
| maturity + evidence | Clasificación del mercado | Research |
| growth_historical / projection | Datos de crecimiento | Research |
| regulatory | Marco regulatorio | Research |
| customer_segments | Segmentos de clientes del mercado | Research |
| trends | Tendencias de mercado | Research |
| opportunities | Oportunidades detectadas | Análisis |
| social_benchmarking | Benchmarks de redes del sector | DataForSEO/Apify |

## Ejemplo de presentación hidratada

```
"De tu Company Context sé que:
  • Industria: Salud capilar ✅
  • Mercado: España (principal), LATAM (secundario) ✅
  • Modelo: B2C, servicios médicos ✅
  • Producto: Trasplante capilar + tratamientos ✅

Con esto voy a investigar:
  1. TAM del mercado de salud capilar en España y LATAM
  2. Segmentación del mercado
  3. Tendencias y crecimiento
  4. Landscape competitivo (complementando lo que ya tenemos)
  5. Regulación relevante

¿Hay algún mercado geográfico o segmento que quieras que incluya/excluya?"
```

## Nota

Market-intelligence es un skill de INVESTIGACIÓN. La hydration aquí evita preguntar "¿en qué industria estáis?" o "¿qué mercados servís?" — eso ya se sabe. El skill arranca directamente a investigar.
