# Estrategia Meta Ads — Dealcar

> Generado: 2026-03-22 | Fuente: Best practices B2B SaaS + automotive + análisis competitivo
> <!-- Self-QA: PASS | 2026-03-22 -->

---

## Resumen Ejecutivo

Dealcar es un SaaS B2B que vende a dueños/gerentes de concesionarios de VO. Meta Ads no es el canal más natural para B2B SaaS, pero tiene sentido aquí porque el ICP (dueños de compraventas) **no está en LinkedIn** masivamente — son perfiles más operativos, móviles, activos en Facebook/Instagram. La clave: **targeting preciso + creatividades que hablen de dolor real del dealer + funnel Lead Ads → demo**.

---

## Estructura de Campañas (Funnel)

### ❄️ COLD — Awareness/Educación (70% presupuesto inicial)

**Objetivo:** Darse a conocer entre dealers que no saben que Dealcar existe.

**Audiencias:**
1. **Intereses + Comportamiento:**
   - Intereses: "Compraventa de coches", "Concesionario", "Vehículos de ocasión", "Coches.net", "AutoScout24", "Wallapop motor"
   - Job titles (si disponible): "Gerente", "Propietario negocio", combinado con interés en automoción
   - Comportamiento: "Propietario de negocio", "Páginas de empresa"
   
2. **Lookalike 1% de clientes actuales:**
   - Subir base de +500 dealers como Custom Audience → crear Lookalike 1% España
   - Si hay datos de mejores clientes (plan Profesional, más antiguos), usar esos como seed

3. **Geotargeting:**
   - España completa, con posibilidad de excluir zonas saturadas o priorizar zonas con más concesionarios (Madrid, Barcelona, Valencia, Sevilla, Málaga, Bilbao)

**Formatos:**
- 📹 **Video testimonial** (Everest Ocasión, M10 Selection) — 15-30 seg, subtitulado
- 🎠 **Carousel** mostrando los módulos clave: CRM → Multipublicación → Facturación → App móvil
- 📱 **Reels/Stories** con before/after: "Así gestionabas antes vs. con Dealcar"

**Ángulos creativos (mensajes):**
1. 🕐 "¿Pierdes 30h/mes en tareas manuales? Tu competencia ya no."
2. 📱 "Publica en Coches.net, Wallapop y AutoScout desde una sola app"
3. 💰 "Desde 54€/mes. Sin permanencia. Prueba gratis."
4. 📋 "Verifactu llega en 2027. ¿Tu facturación está lista?"
5. 🏆 "+500 compraventas ya usan Dealcar. ¿Tú sigues con Excel?"

---

### 🔥 WARM — Consideration/Lead Gen (20% presupuesto)

**Objetivo:** Captar leads (demo/registro) de gente que ya conoce Dealcar.

**Audiencias:**
1. **Retargeting web:** Visitantes de dealcar.io últimos 30 días (requiere Meta Pixel instalado)
2. **Retargeting engagement:** Interacción con posts/anuncios de Dealcar en últimos 90 días
3. **Retargeting video:** Vieron >50% de un video testimonial
4. **Custom Audience:** Registros incompletos (si tienen el dato)

**Formatos:**
- 📝 **Lead Ads** con formulario nativo: nombre, email, nombre concesionario, nº coches en stock
- Demo CTA directa: "Prueba Dealcar gratis — tu concesionario funcionando en 24h"
- Case study card: resultado concreto de un dealer real

**Ángulos:**
1. "Everest Ocasión simplificó su gestión en 1 semana. ¿Quieres ver cómo?"
2. "Demo personalizada en 15 min — te mostramos tu concesionario en Dealcar"
3. Comparación directa: "Dealcar vs Excel: la diferencia es [dato concreto]"

---

### 🎯 HOT — Conversion/Retargeting (10% presupuesto)

**Objetivo:** Cerrar leads que visitaron pricing, demo, o interactuaron con Lead Ad.

**Audiencias:**
1. Visitantes de /precio o /demo últimos 14 días
2. Leads que abrieron formulario pero no completaron
3. Usuarios de trial inactivos (si aplica)

**Formatos:**
- Urgencia suave: "Sin permanencia. Empieza hoy, cancela cuando quieras."
- Social proof: "+500 dealers confían en Dealcar"
- Oferta directa: "Puesta en marcha sin coste + soporte incluido"

---

## Presupuesto Sugerido (Escenarios)

| Escenario | Presupuesto/mes | CPL estimado | Leads/mes estimados |
|-----------|-----------------|--------------|---------------------|
| Conservador | 1.000-2.000€ | 15-25€ | 40-130 leads |
| Moderado | 3.000-5.000€ | 10-20€ | 150-500 leads |
| Agresivo | 5.000-10.000€ | 8-15€ | 330-1.250 leads |

*CPL estimado basado en benchmarks B2B SaaS España. El nicho automotriz puede tener CPL más bajo por menor competencia en Meta.*

**⚠️ Sin datos reales de campañas previas, estos son estimados. Los primeros 30 días son de aprendizaje.**

---

## Requisitos Técnicos Previos

### Obligatorio antes de lanzar:
- [ ] **Meta Pixel** instalado en dealcar.io con eventos: PageView, Lead, CompleteRegistration
- [ ] **Conversions API (CAPI)** configurada (server-side tracking, mejora ~20% el match rate)
- [ ] **Custom Audience** de base de clientes subida (+500 dealers)
- [ ] **Business Manager** verificado
- [ ] **Landing page de demo** optimizada para móvil
- [ ] **Creatividades:** mínimo 3 videos testimoniales + 2 carousels + 2 estáticas

### Recomendado:
- [ ] UTM parameters definidos para tracking GA4
- [ ] CRM conectado para medir Lead → Demo → Cliente
- [ ] Frecuencia de reporting definida (semanal recomendado)

---

## KPIs a Trackear

| Métrica | Objetivo inicial | Revisión |
|---------|-----------------|----------|
| CPL (Coste por Lead) | <20€ | Semanal |
| CTR (Click-Through Rate) | >1% | Semanal |
| Conversion Rate (Lead→Demo) | >15% | Mensual |
| Conversion Rate (Demo→Cliente) | >10% | Mensual |
| ROAS | >3x (LTV vs CAC) | Trimestral |
| Frecuencia | <3 (evitar ad fatigue) | Semanal |

---

## ❓ Datos Pendientes de Dealcar

Para afinar esta estrategia necesitamos confirmar:
1. **¿Tienen Meta Pixel instalado?** Si no, es lo primero
2. **¿Acceso a Business Manager?** ¿Quién lo gestiona?
3. **¿Han hecho campañas antes?** Si sí, datos históricos (CPL, CTR, budget)
4. **¿Presupuesto mensual para ads?**
5. **¿Tienen creatividades de video?** (testimoniales, producto)
6. **¿Cuál es el flujo post-lead?** (¿demo con comercial, trial self-service, llamada?)

---

## Próximos Pasos
1. ✅ Validar esta estrategia con el equipo
2. Verificar setup técnico (Pixel, CAPI, Business Manager)
3. Preparar creatividades (briefing de video + estáticas)
4. Lanzar campaña Cold con 2-3 variantes de creatividad
5. Medir primeros 14 días → optimizar
