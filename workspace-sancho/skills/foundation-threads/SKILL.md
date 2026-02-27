---
name: foundation-threads
description: Create Discord threads for Foundation onboarding flow.
metadata:
  author: Cervantes
  version: '1.0'
  system: SanchoCMO
---

# Foundation Threads — Onboarding via Discord Threads

> Crea los hilos de Foundation en #onboarding y orquesta el flujo pilar por pilar.

---

## Cuándo usar

Cuando un cliente nuevo empieza onboarding. Se ejecuta UNA vez por cliente.

---

## Hilos a crear (en orden)

Crear todos los hilos en el canal #onboarding del cliente. Cada hilo = un pilar del Foundation.

### Layer 0 — Sin dependencias

| # | Hilo | Skill | Output |
|---|------|-------|--------|
| 1 | `📋 Contexto de empresa` | company-context | brand/{slug}/company-context.md |
| 2 | `💰 Presupuesto y recursos` | budget-constraints | brand/{slug}/budget.md |

### Layer 1 — Depende de Layer 0

| # | Hilo | Skill | Output |
|---|------|-------|--------|
| 3 | `🏢 Modelo de negocio` | business-model-audit | brand/{slug}/business-model.md |
| 4 | `🔍 Autoanálisis (producto/servicio)` | self-intelligence | brand/{slug}/product-analysis.md |

### Layer 2 — Depende de Layer 1

| # | Hilo | Skill | Output |
|---|------|-------|--------|
| 5 | `📊 Inteligencia de mercado` | market-intelligence | brand/{slug}/market.md |
| 6 | `🏆 Análisis de competidores` | competitor-intelligence | brand/{slug}/competitors.md |
| 7 | `🎯 ICP & Buyer Personas` | niche-discovery-100x | brand/{slug}/icp.md |
| 8 | `💎 Positioning & Messaging` | positioning-messaging | brand/{slug}/positioning.md |
| 9 | `🎙️ Voz de marca` | brand-voice | brand/{slug}/voice-profile.md |
| 10 | `🎨 Identidad visual` | visual-identity | brand/{slug}/visual-identity.md |
| 11 | `💲 Estrategia de pricing` | pricing-strategy | brand/{slug}/pricing.md |
| 12 | `⚖️ Análisis SWOT` | swot-analysis | brand/{slug}/swot.md |

### Opcionales

| # | Hilo | Skill | Output |
|---|------|-------|--------|
| 13 | `✅ Validación ECP` | ecp-validation | brand/{slug}/ecps.md |
| 14 | `📈 Datos de clientes existentes` | existing-customer-data | brand/{slug}/customer-data.md |

---

## Flujo de ejecución

### Paso 1: Crear hilos

Al recibir "iniciar onboarding" o "empezar foundation":

1. Crear los hilos 1 y 2 (Layer 0) en #onboarding usando `message` tool con `action: thread-create`
2. NO crear todos los hilos de golpe — solo los de la layer actual
3. En el primer hilo (`📋 Contexto de empresa`), enviar mensaje de bienvenida:

```
¡Bienvenido al onboarding de SanchoCMO! 🎉

Vamos a construir tu Foundation paso a paso. Cada hilo es un pilar de tu estrategia.

Empezamos por lo básico: cuéntame sobre tu empresa.

🔗 Al terminar cada pilar, podrás ver el documento generado en:
https://sancho-cmo.taild48df2.ts.net/mc/brand/{slug}/

Empecemos: ¿Cómo se llama tu empresa y a qué se dedica?
```

### Paso 2: Trabajar en cada hilo

- Dentro de cada hilo, sigue el skill correspondiente (iterativo: pregunta → respuesta → siguiente pregunta)
- Cuando el usuario aprueba el pilar → guardar output en `brand/{slug}/`
- Actualizar `memory/foundation-state.json` con el estado del pilar

### Paso 3: Avanzar a siguiente layer

Cuando TODOS los pilares de la layer actual estén `approved` o `skipped`:

1. Crear los hilos de la siguiente layer
2. En el primer hilo nuevo, enviar: "Layer [N-1] completada ✅ Avanzamos a [descripción de la layer]"
3. Incluir un resumen de lo aprendido en la layer anterior como contexto

### Paso 4: Contexto entre hilos

Al empezar un nuevo hilo, Sancho DEBE:

1. Leer los outputs de los pilares anteriores (los archivos .md en brand/{slug}/)
2. Incluir un mini-resumen de contexto relevante al inicio: "Basándome en lo que hemos definido: [empresa] es [X], su ICP es [Y], su presupuesto es [Z]..."
3. Esto evita que el usuario tenga que repetir información

---

## Estado

Usar `memory/foundation-state.json` (mismo formato que foundation-orchestrator):

```json
{
  "client": "hospital-capilar",
  "startedAt": "2026-02-26T...",
  "threads": {
    "company-context": { "threadId": "123456", "status": "approved" },
    "budget-constraints": { "threadId": "789012", "status": "in-progress" }
  },
  "currentLayer": 0,
  "currentPillar": "budget-constraints"
}
```

---

## Reglas

1. **No crear hilos de layers futuras** — solo la layer actual + anterior (visibilidad)
2. **Respetar el DAG** — nunca avanzar sin aprobar dependencias
3. **Siempre incluir contexto** — cada hilo nuevo lleva resumen de lo anterior
4. **Links a docs** — al terminar cada pilar, mostrar link al documento generado
5. **Un pilar = un hilo** — no mezclar temas
