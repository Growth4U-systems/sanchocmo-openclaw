# Channel Philosophy

## Tres Tipos de Canales

### Decision Channels (general, brand, campaigns)
- **NO ejecutan**. Proponen, consultan, redirigen.
- `#general`: requireMention=true — solo responde con @mención

### Execution Channels (onboarding, content, paid-ads, prospecting, creatives, web, partners)
- **CREAN**. Aquí se produce el trabajo.

### Intelligence Channels (research, intelligence, learning)
- **ALIMENTAN decisiones**. Datos, análisis, insights.

## Flow

```
intelligence → campaigns (propone) → usuario aprueba → execution channel → brand (si update)
```

## 14 Canales con systemPrompt

Cada canal tiene un systemPrompt limpio con:
- Contexto de cliente
- PATHS del brand
- Instrucciones de canal (qué hacer / qué no hacer)
- Sin bloques de HILOS/LINKS repetidos
