# Hospital Capilar — Learnings

> Última actualización: 2026-04-20
> Síntesis semanal: 2026-04-14 → 2026-04-20

---

## Patrones Confirmados (Abril 2026)

### 1. Silencio prolongado del servidor (SEMANA 2)
- **Señal**: 0 actividad humana en Discord durante la semana del 14-20 abril. Ningún canal activo. Semana consecutivas de silencio.
- **Canales archivados/inactivos**: #paid-ads (Unknown Channel), #research (último msg 2026-03-01)
- **Canales sin actividad en 6+ semanas**: #brand, #content
- **Canales con actividad solo de bots**: #intelligence, #soporte, #onboarding, #campaigns
- **Implicación**: El servidor no se sostiene solo. Alfonso y Philippe requieren impulsores externos para activar.

### 2. Supabase — incidente HTTP 401 (resuelto)
- **Señal**: HTTP 401 el 2026-04-09 00:53 UTC — detectado por Health Check
- **Estado**: Sin confirmación explícita de resolución en mensajes posteriores
- **xAI incident separado**: HTTP 429 rate limit el 2026-04-15 — resuelto posteriormente
- **Implicación**: Incidentes recurrentes de infraestructura requieren monitoreo automatizado

### 3. Gap de visibilidad en treatment keywords — SIN AVANCE
- **Señal**: Trust Engine v5 — #1 cirugía (1900/mes), INVISIBLE en tratamiento (0/12 keywords)
- **Volumen perdido**: >4.000 búsquedas/mes sin captar
- **Competidores dominando**: IMD, Insparya, Grupo Pedro Jaén
- **Avance semana**: Positioning draft existe (mention 2026-04-16) pero **no se avanzó a Foundation-state.json**
- **Implicación**: La oportunidad de >4.000 búsquedas/mes sigue sin explotar. Sin contenido nuevo, no hay cambios en visibilidad.

### 4. Foundation-State vacía — sin progreso
- **Estado**: `completion_pct` = 0, fase no iniciada
- **Positioning draft**: Referenciado el 2026-04-16 pero no formalizado en estado
- **Pricing**: No iniciado
- **Implicación**: El cliente no retomó el ritmo de Foundation. Dependencia de Alfonso/Philippe para avanzar.

### 5. Sin nuevas reuniones desde marzo — 5 semanas
- **Última reunión**: 2026-03-18 — Lead-Nurturing Madrid (Philippe + Ramiro)
- **Total procesadas**: 13 reuniones
- **Implicación**: Decisiones estratégicas pausadas. 5 semanas sin sincronización.

### 6. Philippe — patrones históricos (abiertos)
- **Web completa** (2026-03-27): Preguntó qué elementos esenciales faltan (FAQ, políticas, páginas tratamientos)
- **Links MC** (2026-03-17): Links mal construidos en campañas — formato correcto: `/docs/brand/{slug}/campaigns/`
- **Flujo de atención** (2026-03-06): No respondía cuando enviaba fotos — gap en atención al paciente
- **Estado**: Sin avance conocido esta semana

---

## Acciones Abiertas
- [ ] Confirmar estado Supabase post-HTTP 401
- [ ] Formalizar Positioning draft en Foundation-state.json
- [ ] Iniciar contenido: páginas esenciales clínica capilar (FAQ, políticas, tratamientos)
- [ ] Revisar flujo de atención: gap de respuesta a fotos de pacientes
- [ ] Reactivar comunicación con Alfonso — retomar Foundation

---

*Este archivo se actualiza cada semana con patrones confirmados de los Daily Pulses.*
