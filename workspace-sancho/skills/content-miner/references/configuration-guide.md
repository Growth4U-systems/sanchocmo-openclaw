# Configuration Guide - content-miner

## How to Configure per Brand

### Pilares (from foundation)

**Source**: positioning-messaging output (positioning angles del cliente)
**Fallback**: brand-voice personality traits

**G4U Example**:
- Sistemas de Growth (Alfonso: why/who, Martín: how/what)
- IA Aplicada
- Build in Public
- Fintech y Mercado
- Ops y Productividad
- Casos y Lecciones

### Pains (client-specific)

**Source**: `Context Lake/pains.json`
**Configured during**: foundation OR sancho-start

**Format**:
```json
{
  "pains": [
    {"id": "P1", "name": "CAC Insostenible", "description": "..."},
    {"id": "P2", "name": "Barrera Confianza", "description": "..."}
  ]
}
```

### Owners (from team)

**Source**: `Context Lake/team.json` (sancho-start Pregunta 3)

**Format**:
```json
{
  "team": [
    {
      "name": "Alfonso",
      "role": "Strategy",
      "pilares_owned": ["Sistemas (why)", "Fintech", "Casos (story)"]
    },
    {
      "name": "Martín",
      "role": "Tactics",
      "pilares_owned": ["Sistemas (how)", "IA", "Ops"]
    }
  ]
}
```

### Types (Universal - NO config needed)

Hardcoded: Value Post, Storytelling, Results, Belief Shifting

### Conversion Levels (default, adjustable)

Default: 50% L0, 30% L1, 15% L2, 5% L3
Per-pilar ratios: Optional (configure if needed)
