# Brand Directory — Context Lake

> Este directorio se llena automaticamente cuando los agentes ejecutan skills.
> NO crear archivos manualmente — cada skill es owner de su archivo.

## Estructura esperada (se genera con el uso)

```
brand/
  # TIER 1: Constitution (raramente cambia)
  company-context.md      <- /company-context owns
  voice-profile.md        <- /brand-voice owns
  positioning.md          <- /positioning-messaging owns
  icp.md                  <- /niche-discovery-100x owns
  ecps.md                 <- /niche-discovery-100x owns

  # TIER 2: Strategic (updates mensuales/trimestrales)
  competitors.md          <- /competitor-intelligence owns
  market.md               <- /market-intelligence owns
  product-analysis.md     <- /self-intelligence owns
  swot.md                 <- /swot-analysis owns
  pricing.md              <- /pricing-strategy owns
  business-model.md       <- /business-model-audit owns
  budget.md               <- /budget-constraints owns
  keyword-plan.md         <- /keyword-research owns
  channel-plan.md         <- /channel-prioritization owns
  content-calendar.md     <- /content-calendar-planner owns
  stack.md                <- /sancho-start owns

  # TIER 2: Append-only (NUNCA sobreescribir)
  assets.md               <- ALL skills append
  learnings.md            <- ALL skills append

  # TIER 3: Transitory
  transitory/
    meeting-notes/        <- Daily Pulse reads
    daily-pulse/          <- Auto-updated
```

## Reglas

1. **UN owner por archivo** — solo ese skill puede sobreescribir
2. **assets.md y learnings.md** — append-only, NUNCA truncar
3. **Freshness**: < 7 dias = fresh, 7-30 = flag age, 30-90 = summary only, > 90 = stale
4. **Promocion**: Tier 3 (3+ ocurrencias) -> Tier 2 (validado) -> Tier 1

Ver `_system/brand-memory.md` para el protocolo completo.
