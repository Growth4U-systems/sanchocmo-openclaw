# Phase 1b — Detección de Tipo de Mercado
<!-- v3.3 -->

## Índice
- [Tabla de señales](#tabla-de-señales)
- [Lógica de detección](#lógica-de-detección)
- [Comunicar el resultado](#comunicar-el-resultado)

---

## Tabla de señales

Evaluar desde el contexto de empresa y el ICP:

| Señal | B2C / SMB | B2B Enterprise |
|-------|-----------|----------------|
| Deal size medio | < 5K€/año | > 5K€/año |
| Persona compradora | Individuo, manager, dueño de pyme | C-level, VP, Director, Comité |
| Proceso de compra | Self-serve, decisión rápida | Multi-stakeholder, ciclo de 2-6 meses |
| Densidad de discusión pública | Alta (Reddit, foros, comunidades) | Baja (boardrooms, canales privados) |
| Tamaño empresa ICP | 1-50 empleados | 50+ empleados |

## Lógica de detección

- >= 3 señales B2B Enterprise → **Modo Enterprise**
- >= 3 señales B2C/SMB → **Modo Foro**
- Mixto → **Modo Híbrido** (ambos stacks, deduplicar en Phase 6)

## Comunicar el resultado

Siempre declarar el resultado claramente antes de continuar:

> "Mercado detectado: **B2B Enterprise** (deal size 15K+, buyer = CFO/COO, ciclo 3+ meses). Usando stack enterprise."

> "Mercado detectado: **B2C/SMB** (deal size <1K, buyer individual, compra rápida). Usando stack foro/comunidad."

> "Mercado detectado: **Híbrido** (señales mixtas: deal size SMB pero buyer = Director). Ejecutando ambos stacks."
