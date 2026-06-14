---
description: Vigila el PR de la rama actual, mantiene CI verde, atiende review comments y hace loop hasta que está listo para merge (NO mergea).
allowed-tools: Bash, Read, Edit, Write
---

Estás haciendo de niñera del pull request de la rama git actual en sanchocmo-openclaw
hasta que esté verde y la review esté atendida. Disciplina de loop, una sola pasada por tick.

## Contexto del repo (NO re-derivar)
- Remote: `Growth4U-systems/sanchocmo-openclaw`. Rama destino de PRs de feature = `staging` (squash merge).
- Todo PR/rama DEBE llevar un Linear ID (SAN-###) en el nombre de rama, título o body
  — el job de CI `linear-issue-id` falla si no.
- Gate de CI autoritativo (`.github/workflows/ci.yml`):
  - job `verify`: `npm ci` → `npm run typecheck` (tsc --noEmit) → `npm run build` (next build)
  - job `verify-scripts`: `python3 -m unittest discover -s scripts -p 'test_*.py'`
- Hook local pre-push (`.husky/pre-push`) bloquea el push si fallan `npm run typecheck` o `npm run lint`.

## El loop (un tick)
1. Localiza el PR de la rama actual:
   `gh pr view --json number,state,statusCheckRollup,reviewDecision,url`
   Si no existe PR y la rama tiene commits por delante de origin/staging → PARA y avísame
   (no abras PR sin que te lo pida).
2. Lee el estado de CI en `statusCheckRollup`. Si algún check está FAILED:
   - Baja el log del job que falla: `gh run view <run-id> --log-failed`.
   - Reproduce en local y arregla LO MÍNIMO que lo ponga verde:
     - typecheck → `npm run typecheck`, corrige tipos.
     - build → `npm run build`, corrige.
     - python → `python3 -m unittest discover -s scripts -p 'test_*.py' -v`, corrige.
3. Trae los review comments sin resolver:
   `gh pr view --json reviews,comments` + `gh api repos/Growth4U-systems/sanchocmo-openclaw/pulls/<n>/comments`.
   Triaje: aplica fixes de código en los accionables; para preguntas, redacta la respuesta
   como DRAFT y muéstramela antes (regla draft-before-send — nunca auto-postear con gh pr comment).
4. Antes de pushear, corre el gate local para que el hook husky no te rebote:
   `npm run typecheck && npm run lint && npm run build && npm run test:lib && npm run test:calc`
   Solo si TODO pasa: `git add -A && git commit -m "fix: <qué> (SAN-###)" && git push`.
5. Re-lee el estado del PR. Si checks verdes Y reviewDecision = APPROVED (o sin cambios pedidos)
   → PARA y reporta "PR #<n> verde, listo para merge" con la URL. NO mergees.

## Guardarraíles (innegociables)
- NUNCA `git push --no-verify`. NUNCA force-push. NUNCA mergear. NUNCA postear comentarios sin mostrarme el draft.
- Verificador independiente: tras dejarlo verde, lanza `/qa-bot` (o el agente Sansón) sobre el diff
  como check final — el que genera no se juzga a sí mismo.
- Si el mismo check falla 3 ticks seguidos sin progreso → PARA y enséñame el bloqueo (no quemes tokens).
- Mantén cada fix dentro del alcance del Linear issue del PR; no refactorices código no relacionado.
