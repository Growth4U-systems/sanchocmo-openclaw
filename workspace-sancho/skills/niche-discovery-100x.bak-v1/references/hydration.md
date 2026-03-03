# Hydration Map — niche-discovery-100x

> Niche Discovery lee MUCHOS upstream para configurar su triple filtro.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | elevator_pitch | Filtro Producto | exacto | ¿El producto resuelve este problema? |
| company-context | product_type | Filtro Producto | exacto | Tipo de solución posible |
| company-context | key_features | Filtro Producto | exacto | Features mapeables a problemas |
| company-context | differentiator_10x | Filtro Producto | exacto | Ventaja competitiva en cada nicho |
| company-context | b2b_b2c | Filtro ICP | exacto | Filtra problemas B2B vs B2C |
| company-context | markets_served | Filtro ICP | exacto | Filtra por geografía |
| company-context | industry_vertical | Keywords scraping | exacto | Base para búsqueda de problemas |
| self-intelligence | strengths | Filtro SWOT (S) | exacto | ¿Fortalezas aplican a este nicho? |
| self-intelligence | weaknesses | Filtro SWOT (W) | exacto | ¿Debilidades bloquean este nicho? |
| competitors | battle_cards | Filtro competitivo | exacto | ¿Nicho saturado por competitors? |
| competitors | vulnerabilities | Oportunidad de nicho | exacto | Gaps de competitors = nichos atractivos |
| swot | opportunities | Filtro SWOT (O) | exacto | Oportunidades alineadas |
| swot | threats | Filtro SWOT (T) | exacto | Amenazas que descartan nichos |
| swot | so_strategies | (contexto) | exacto | Estrategias que sugieren nichos |
| customer-data (si existe) | champions_profile | Filtro ICP (gold) | exacto | Best customers = best niches |
| customer-data | churn_patterns | Filtro ICP (avoid) | exacto | Nichos que no retienen |

## Campos genuinamente nuevos (siempre ejecutar)

| Campo | Por qué no existe upstream | Método |
|-------|--------------------------|--------|
| problems_raw (50+) | Scraping propio | Reddit, foros, Quora, reviews, social |
| JTBD structuring | Transformación propia | Convertir problemas a JTBD |
| Triple Filter results | Análisis propio | SWOT × ICP × Product scoring |
| ECP clusters | Análisis propio | Clustering de problemas filtrados |
| ECP scoring | Análisis propio | ICE scoring de cada cluster |

## Ejemplo de presentación hidratada

```
"Tengo todo lo necesario de upstream para configurar el Triple Filtro:

  📦 Filtro Producto: [elevator_pitch + key_features + differentiator]
  👤 Filtro ICP: [B2B/B2C + markets + industry]
  📊 Filtro SWOT: [strengths/weaknesses/opportunities/threats]
  🏆 Filtro Competitivo: [battle_cards + vulnerabilities]

Voy a:
  1. Scrapear 50+ problemas reales de tu mercado
  2. Estructurarlos como JTBD
  3. Pasar el Triple Filtro con los datos de arriba
  4. Clusterizar en ECPs y puntuar

¿Hay algún segmento o nicho que quieras que explore especialmente (o excluya)?"
```

## Nota

Niche Discovery es el skill que MÁS upstream consume — su calidad depende directamente de la calidad de SWOT, competitors y self-intelligence. La hydration aquí configura los filtros automáticamente. La única pregunta al usuario es si tiene preferencias de foco.
