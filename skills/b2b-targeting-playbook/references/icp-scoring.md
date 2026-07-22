# Matriz de scoring ICP (0-100), tiers y dimensionado

## La matriz de 100 puntos

Puntúa cada cuenta contra los 7 criterios. Los pesos de partida son los del marco
de ColdIQ; re-pondéralos trimestralmente con los datos de closed-won del cliente
(el peso correcto es el que predice ganar, no el que suena bien).

| Criterio | Peso | Cómo puntuar |
|---|---|---|
| Industria | 20 | Vertical exacto = 20 · adyacente = 10 · otro = 0 |
| Tamaño de plantilla | 15 | Rango dulce = 15 · rango adyacente = 8 · fuera = 0 |
| Revenue | 15 | Rango dulce = 15 · adyacente = 8 · desconocido = 0 |
| Geografía | 10 | Mercado primario = 10 · secundario = 5 · otro = 0 |
| Fit tecnológico | 15 | Stack complementario = 15 · neutro = 8 · competidor instalado = 5 |
| Crecimiento | 10 | Alto = 10 · moderado = 5 · estancado = 0 |
| Intención | 15 | Señal fuerte = 15 · alguna señal = 8 · ninguna = 0 |

Nota sobre "competidor instalado = 5": no es 0 porque el competidor instalado
valida el presupuesto y la categoría — es un ángulo de displacement, no un
descarte (ver `b2b-sales-triggers` §bridgebound-in-market).

## Ajuste dinámico por intención

La matriz es una foto; la intención es vídeo. Ajusta el score al alza cuando
aparezca señal viva:

| Capa de intención | Ejemplos | Ajuste |
|---|---|---|
| Primera mano (la más fuerte) | Visitó tu pricing, descargó contenido, asistió a webinar | +10 a +20 |
| Segunda mano | Actividad en sitios de reviews (G2, Capterra) | +5 a +10 |
| Tercera mano | Plataformas de intent (Bombora, 6sense) | +5 |

Una cuenta de 65 (Tier C) con intención de primera mano fuerte se trabaja como
Tier B: la señal de "ahora" compensa el fit imperfecto.

## Tiers y asignación de esfuerzo

| Tier | Score | Cuentas típicas | Tratamiento |
|---|---|---|---|
| A → ABM 1:1 | 90-100 | 10-50 | Personalización profunda por cuenta, multi-threading al comité completo, contenido a medida |
| B → ABM 1:few | 70-89 | 50-200 | Secuencias por segmento (vertical/persona), personalización media |
| C → 1:many | 50-69 | 200-1.000 | Programmatic: mensajes por vertical, automatización, sin research manual |
| D → excluir | <50 | resto | Fuera de outbound; solo inbound si llega |

## Dimensionado: revenue reverse-engineering

Nunca elijas el tamaño de lista por intuición. Parte del objetivo de revenue y
retrocede por el funnel con tasas de conversión reales (o benchmarks
conservadores hasta tenerlas):

```
objetivo ARR
  ÷ ACV medio                  → deals necesarios
  ÷ tasa cierre desde oportunidad → oportunidades
  ÷ tasa reunión→oportunidad     → reuniones
  ÷ tasa cuenta→reunión          → cuentas a trabajar
```

Benchmarks de progresión ABM del material original (ajústalos con datos propios
en cuanto existan): identificada→aware ~55%, aware→interesada ~32%,
interesada→considerando ~18%. Orden de magnitud resultante: un objetivo de ~$1M
ARR con ACV mediano suele exigir **miles** de cuentas identificadas, no cientos.
Si el universo real del ICP no llega, la conversación con el cliente es ampliar
ICP o subir ACV — no estirar la lista con Tier D.

## Ejemplo aplicado

"Vendemos software de RRHH a mid-market en España":

- **Capa 1**: 200-2.000 empleados, €20M-€500M, España/Portugal, en crecimiento.
- **Capa 2**: usan HRIS legacy (sustitución) o carecen de módulo que aportas (complemento).
- **Capa 3**: contratando roles de People, ronda reciente, nuevo director de RRHH ≤90 días.
- **Scoring**: cuenta con vertical exacto (20) + 400 empleados (15) + revenue en rango (15) + España (10) + HRIS legacy (15) + contratando (10) + vacantes de People activas (15) = 100 → Tier A.
