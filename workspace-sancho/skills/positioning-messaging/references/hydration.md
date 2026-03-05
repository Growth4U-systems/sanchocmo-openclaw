# Hydration Map — positioning-messaging

> Positioning necesita el contexto MÁS rico — lee casi todo upstream.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | company_name | (contexto) | exacto | |
| company-context | elevator_pitch | value_proposition (seed) | exacto | Punto de partida UVP |
| company-context | differentiator_10x | USP candidates | exacto | Diferenciadores ya identificados |
| company-context | product_description | product_for_niche | exacto | Base para value mapping |
| company-context | key_features | asset candidates | exacto | Features → Assets |
| company-context | b2b_b2c | (filtro) | exacto | Cambia estilo de messaging |
| company-context | brand_values | messaging guardrails | exacto | Valores que el messaging respeta |
| competitors | battle_cards | competitive_context | exacto | Para positioning vs competitors |
| competitors | vulnerabilities | opportunity_zones | exacto | Gaps = zonas de posicionamiento |
| competitors | stated_value_prop (per competitor) | competitive_claims | exacto | Qué dicen los demás |
| competitors | pricing_model | pricing_context | exacto | Para value-based positioning |
| icp / ecps | ECP profiles | per-niche context | exacto | A QUIÉN posicionar |
| icp / ecps | pain_points | messaging angles | exacto | Dolor → mensaje |
| icp / ecps | jtbd_statements | messaging hooks | exacto | JTBD → headlines |
| icp / ecps | alternatives | competitor framing | exacto | Cómo framear vs alternativas |
| company-brief | conversion_barriers | {{conversion_barriers}} | exacto | Objeciones/barreras de compra del ECP (precio, miedos, dolor, etc.) |
| company-brief | legal_constraints | {{legal_constraints}} | exacto | Qué NO se puede decir en copy (fármacos, claims médicos, etc.) |

## Campos genuinamente nuevos (siempre generar)

| Campo | Por qué no existe upstream | Método |
|-------|--------------------------|--------|
| Value Criteria (per niche) | Análisis propio | Scoring 0-5 vs competitors |
| Assets Database | Transformación propia | Features → Strategic Assets |
| Benefit-Proof Pairs | Síntesis propia | Asset × Value Criterion → Benefit + Proof |
| UVP (per niche) | Síntesis propia | "Para [ECP], somos [claim] porque [proof]" |
| USPs (per niche) | Síntesis propia | 3-5 per ECP |
| Objection Neutralization | Síntesis propia | Barrera → Reframe → Mensaje → Proof |
| Messaging Playbook | Síntesis propia | Dolor → Diagnóstico → Puente (2 formatos) |

## Ejemplo de presentación hidratada

```
"De upstream tengo todo para arrancar positioning:

  🏢 Empresa: [elevator_pitch + differentiator]
  🎯 ECPs a posicionar: [lista de ECPs del niche-discovery]
  ⚔️ Competitors: [battle cards resumen]
  🔓 Gaps competitivos: [vulnerabilities]

  ⛔ Restricciones legales: [legal_constraints]
  🚧 Barreras de conversión: [conversion_barriers]

Para cada ECP voy a:
  1. Mini deep research del nicho
  2. Analizar competitor claims
  3. Mapear Value Criteria y puntuar
  4. Mapear Assets → Benefits → Proofs
  5. Neutralizar objeciones del brief
  6. Generar UVP + USPs + Messaging (dolor-activado, 2 formatos)

¿Empiezo por el ECP prioritario ([nombre])?"
```
