# Self Intelligence — Hospital Capilar

<!-- Self-QA: PASS | 2026-03-10 -->
<!-- Fuente: Sesión análisis mercado+competidores HC 10/03/2026 -->

## 1. Fortalezas Confirmadas

### Reputación
- **Mejor reputación del sector**
- 95% satisfacción en trasplantes
- +4,000 pacientes atendidos
- Reviews valoran: profesionalismo médico, comunicación cercana, naturalidad de resultados, soporte completo

### Enfoque Médico
- Todo tratamiento realizado por médico
- Evaluación y seguimiento médico real
- **Diferenciación genuina vs esteticistas**

### Product-Market Fit
- **88% crecimiento en tratamientos sin invertir en marketing**
- Margen de tratamientos excelente
- Crossell con cirugías funciona

### Canales Actuales Rentables
- **SEO**: muy buen ROI
- **Google Ads**: rentable
- **Meta Ads**: el que mejor funciona

### Infraestructura
- Instalaciones modernas de alta calidad (diferenciador vs competencia)

### Protocolos Propios
- Nomenclaturas propias: **CRT/HRT** (en lugar de PRP — cumplimiento Ley SARA)

## 2. Gaps y Áreas de Mejora

### Web y Comunicación
- Web **100% enfocada en cirugías**
- 80% tráfico web de cirugías, 20% tratamientos (cross-sell)
- Sin funnel específico de tratamientos
- Faltan landing pages para tratamientos

### Redes Sociales
- Espacio blanco en influencers
- **No están en TikTok**
- Todo contenido es de cirugías

### Sistema Operativo
- Prácticamente **cero reviews de tratamientos**
- No hay sistema de reviews instalado
- Sin programa de referidos activo

### Contenido
- Falta contenido educativo específico en tratamientos

### No-Shows
- **47% Madrid, 40% Murcia, 25% Pontevedra**
- Necesidad de flujos de confirmación más activos (emails y llamadas pre-consulta)

### Testimonios
- Necesidad urgente de casos de éxito de tratamientos (antes/después con consentimiento)

## 3. Pricing y Modelo de Consulta (En Testing)

**Propuesta base:** consulta completa **€195** (tricoscopia + analítica hormonal + consulta médica; descontable del bono si contrata)

### Contexto
- 50% no-shows en consultas gratuitas actuales
- Coste médico + enfermero + analítica es significativo
- Riesgo: competencia ofrece diagnóstico gratuito

### Opciones a testear
- Múltiples precios: €25, €50, €100, €195
- Filtro previo con asesor antes de pago
- Quiz largo para calificar antes de consulta paga
- Casos claros → asesor comercial gratis

### Casos donde el bono es claro (Philippe, 09/03)
- **Mujeres** — necesitan analítica casi obligatoriamente
- **Alopecias raras** (areata, frontal fibrosante)
- **Efluvios telógenos** — analítica + consulta importante

**Decisión:** testear en paralelo múltiples caminos, priorizar que la gente venga, ajustar según resultados reales.

## 4. Decisiones Técnicas Confirmadas
- **Stripe** confirmado como pasarela de pago
- Crear producto en tienda online para analítica hormonal
- Sistema debe agendar automáticamente en **Codebox**
- Integración Codebox + DNS + Salesforce necesaria
