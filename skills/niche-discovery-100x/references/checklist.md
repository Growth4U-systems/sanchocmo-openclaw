# Niche Discovery v4.0 — Self-QA Checklist

> Comprobar ANTES de entregar. Marcar cada uno: PASS | WARN (con razón) | RED (investigar).
> Entregar solo cuando 0 RED. Mostrar resultado al usuario.

---

## Step 3: Solution Filter Quality

- [ ] ¿El Solution Filter evalúa capacidad de resolución, no tipo de persona?
- [ ] ¿Los problems filtrados se guardaron en `problems.md`?
- [ ] ¿Cada problem tiene JTBD completo + source + filtros aplicados (PASS/PARTIAL/FAIL)?
- [ ] >= 50 problems filtrados (o razón documentada de por qué menos)
- [ ] >= 3 tipos de fuente diferentes representados
- [ ] Cada problem tiene: statement + why + persona + alternatives + source + jtbd_statement
- [ ] >= 60% de problems tienen cita textual de usuario real

## Step 4: ECP Clustering Quality

### Naming (BLOQUEANTE)
- [ ] ¿CADA ECP está nombrado por NECESIDAD, no por arquetipo de persona?
  - ❌ MAL: "Solo Technical Founder" / "SaaS B2B Post-PMF" / "The Burned"
  - ✅ BIEN: "Necesita growth system repetible" / "Canal principal muerto, necesita diversificar"
- [ ] QA del Core Need: ¿Lo pueden decir 50 personas diferentes sin cambiar una palabra y sigue siendo específico?

### Reachability Discovery (BLOQUEANTE)
- [ ] ¿CADA ECP tiene Trust Map con NOMBRES específicos? (no "influencers de marketing" → "Luis Díaz de Vivar, Product Hackers")
- [ ] ¿CADA ECP tiene Search Map con keywords reales? (awareness + consideración + decisión)
- [ ] ¿CADA ECP tiene Channel Map con al menos 1 canal primario (trust + search convergen)?
- [ ] ¿TODOS los canales primarios tienen ACCIÓN ESPECÍFICA?
  - ❌ MAL: "LinkedIn"
  - ✅ BIEN: "LinkedIn: posts sobre growth system vs growth hacks en respuesta a founders que comparten frustración en Product Hackers Go!"
- [ ] ¿El Channel Map distingue entre primario (trust+search) y secundario (solo uno)?

### Clustering Logic
- [ ] ¿Clusters agrupados por SAME CORE NEED + SAME TRIGGER?
- [ ] ¿Clusters con misma necesidad pero diferentes canales → ECPs distintos?
- [ ] ¿Clusters con necesidades distintas pero mismos canales → considerados para merge?

## JTBD Synthesis Quality (BLOQUEANTE)

- [ ] ¿Cada ECP tiene JTBD Synthesis completa? (unified_problem + why + jtbd_statement + hypothesis + alternatives)
- [ ] ¿El unified_problem es una MEZCLA real de los problems del cluster (no copiar 1 solo problem)?
- [ ] ¿El why explica consecuencias económicas, emocionales Y operativas?
- [ ] ¿El jtbd_statement sigue formato: "Cuando [situación], quiero [motivación], para poder [resultado]"?
- [ ] ¿El hypothesis sigue formato completo con [F1], [F2], [resultado], [negativo competencia]?
- [ ] ¿Las alternatives incluyen "no hacer nada" + soluciones manuales + competidores específicos?

## Step 5: Scoring Quality

- [ ] ¿Scores en escala 2-99 (NO 1-10)?
- [ ] ¿Cada score tiene EXPLICACIÓN de 200-400 chars justificando la nota?
- [ ] ¿Reachability score basado en EVIDENCIA de Step 4?
  - 76-99: 2+ canales primarios con acciones concretas
  - 51-75: 1 primario + 2+ secundarios
  - 21-50: Solo secundarios o genéricos
  - 2-20: Sin canales descubiertos
- [ ] ¿Pain score refleja frecuencia + WTP + intensidad emocional?
- [ ] ¿Founder Moat aplicado como badge (🏆/⭐/—), NO como filtro que descarte?
- [ ] ¿Fórmula: Pain × 0.35 + Reachability × 0.40 + SAM × 0.25?
- [ ] ¿Priorización incluye recomendación de por cuáles empezar?

## Output Quality

- [ ] ¿Se generaron 2 archivos: `problems.md` + `ecps.md`?
- [ ] ¿`ecps.md` tiene toda la info para skills downstream (positioning-messaging, channel-prioritization)?
- [ ] ¿Versionado estándar aplicado?

---

## Red Flags (auto-detectar y reportar)

- > 40% de problems sin cita textual real → "⚠️ BAJA EVIDENCIA"
- > 80% de problems de una sola fuente → "Baja diversidad de fuentes"
- Algún ECP sin NINGÚN canal primario → "⚠️ Reachability no descubierta"
- Algún ECP nombrado por persona en vez de necesidad → "⚠️ ARQUETIPO, no necesidad — REESCRIBIR"
- Canal genérico sin acción concreta → "⚠️ Canal genérico — especificar"
- Todos los Reachability scores iguales → "Sin varianza — revisar evidencia"

---

## Veredicto

- **PASS** (todos chequeados, 0 red flags): Output listo
- **NEEDS WORK** (1+ sin chequear o 1 red flag): Arreglar items flaggeados, re-ejecutar
- **INSUFFICIENT** (3+ sin chequear o 2+ red flags): Volver atrás, expandir

Siempre mostrar resultado:
> "Self-QA: **PASS** — [N] problems de [M] fuentes, [X] ECPs con reachability completa, 0 arquetipos."
