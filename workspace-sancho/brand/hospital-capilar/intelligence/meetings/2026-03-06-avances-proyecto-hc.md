# Meeting Intelligence — 2026-03-06

**Proyecto:** Avances proyecto - HC  
**Fuente:** Google Drive — 1MhF-opiBmlvBlXZ5r7ixxj8_bTYiA9n1NSZRCxupeRs  
**Fecha:** 2026-03-06

---

## Participantes
- Philippe Sainthubert
- Ramiro Perez

---

## Decisiones Clave

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Usar **webhook** para integrar quiz externo con High Level | Los quizzes nativos de High Level no permiten importaciones |
| 2 | Usar **Cursor con Cloud Code** para el desarrollo del quiz | Facilita conexiones de APIs y dependencias |
| 3 | Usar **WhatsApp + Email** (evitar SMS) | Canal más efectivo y menor coste |
| 4 | Crear **diferentes funnels por SP** para testing | Determinar cuál convierte mejor |
| 5 | Posicionar web para "consultora de growth en España" | Ya genera leads automáticos |

---

## Acciones

### Philippe Sainthubert
- [ ] Consultar método de pago (Stripe o PayPal) con Hospital Capilar
- [ ] Investigar lógica de scoring para el quiz
- [ ] Implementar quiz y asegurar flujo de datos a High Level
- [ ] Investigar API de Salesforce para futura integración
- [ ] Organizar demo con CoBox (integración API)
- [ ] Configurar dominio y DNSs (Netlify + High Level)
- [ ] Crear landings con contacto WhatsApp y formulario embebido
- [ ] Optimizar landing con testimonios e imágenes existentes

### Ramiro Perez
- [ ] Adquirir suscripción Cloud Code (~18 USD/mes)
- [ ] Descargar Cursor e investigar integración webhook
- [ ] Crear 3 landings en High Level (mujer, hombres <28, hombres >28)
- [ ] Definir estrategia de nurturing post-quiz
- [ ] Desarrollar automatizaciones en High Level
- [ ] Configurar calendario y conexión WhatsApp
- [ ] Configurar pasarela de pagos Stripe

---

## Insights

1. **Herramienta de contenido automatizada**: Philippe demostró herramienta que genera contenido para IG/LinkedIn usando API de Meta + Claude. Ya posiciona y genera leads.

2. **Arquitectura del funnel**: 3 tipos de landing → quiz corto / quiz largo / formulario directo → pipeline en High Level.

3. **Scoring**: High Level tiene scoring nativo. Importante definir tags, perfiles (A, B, C) y acciones según puntuación.

4. **Tasa no-shows del 50%**: Implementar recordatorios (2 días antes, día anterior) y confirmación de citas.

5. **Dashboard de métricas necesario**: Leads por canal, conversión a agenda.

---

## Notas Adicionales

- El quiz ya está creado con lógica de preguntas en Notion
- Problemas de rendimiento con Mac actual (recomendación: Mac Pro M5)
- Mucha información acumulada — riesgo de sobrecarga
- Grabaciones guardadas en carpeta Drive > Documentos > Etiquetadas como "reunión"
