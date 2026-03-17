# Meeting Intelligence — 2026-03-09

**Proyecto:** Avances proyecto HC  
**Fuente:** Google Drive — 1H8wb4w85UGVX-LIlUZyKRY9uxaByllCyUZmLsNwdYaU  
**Fecha:** 2026-03-09

---

## Participantes
- Philippe Sainthubert
- Ramiro Perez

---

## Decisiones Clave

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | **GitHub** como repositorio del proyecto quiz | Facilita conexiones entre sistemas y código actualizado |
| 2 | **Minimizar custom fields y tags** en High Level | Simplifica obtención de métricas |
| 3 | No complicar nurturing **sin validar funnel** con Hospital Capilar | Primero entender su proceso comercial actual |
| 4 | **Evitar SMS**, usar WhatsApp y email | Más efectivo y mejor tasa de apertura |
| 5 | Crear **diferentes funnels por SP** para testing | Medir conversión por Service Provider |

---

## Acciones

### Philippe Sainthubert
- [ ] Subir todo el contenido del proyecto a GitHub y compartir repositorio
- [ ] Consultar con Hospital Capilar el funnel actual post-lead
- [ ] Investigar API de Salesforce (planificar migración)
- [ ] Organizar demostración comercial con CoBox (validar integraciones API)
- [ ] Validar preguntas y estructura del quiz
- [ ] Pedir a Cloud Code que genere funnel inicial por SP (para revisión)
- [ ] Configurar dominio y DNSs (High Level + Netlify)
- [ ] Crear versiones de landings con contacto WhatsApp directo
- [ ] Crear landings con formulario embebido
- [ ] Añadir testimonios e imágenes existentes a landing

### Ramiro Perez
- [ ] Realizar pruebas de las landings enviadas (llegada a High Level)
- [ ] Pasar documento del proyecto externo de LinkedIn a Philippe
- [ ] Diseñar estrategia de nurturing y funnel
- [ ] Consultar con Philippe sobre arquitectura
- [ ] Configurar integración de calendario por contacto
- [ ] Configurar pasarela de pagos Stripe y vincular a High Level

---

## Insights

1. **Cursor + Cloud Code**: La herramienta clave es Cloud (no Cursor solo). Usar `Cmd+Shift+P open cloud new tab`.

2. **Posthog para medición**: Mide actividad del usuario dentro del cuestionario HTML con múltiples frames/pantallas. Colocar pixel en cada uno.

3. **Estructura Contactos vs Opportunities en High Level**:
   - Contactos: toda info del lead (resumen IA, scoring)
   - Opportunities: estado comercial y lo que le importa al hospital

4. **Tasa no-shows 50%**: Proceso de recordatorios imprescindible (2 días antes, día anterior con llamada).

5. **Integración Salesforce**: Puede consumir tokens costosos — requiere planificación.

6. **Mensaje automatizado para comercial**: Cloud Code ya puede generar resumen basado en respuestas del quiz.

---

## Métricas Mentionadas

- Tasa no-shows: 50% (alta)
- Herramienta de contenido ya posiciona y genera leads
- Scoring nativo en High Level: puntos por acciones (clics, aperturas de email)

---

## Notas Adicionales

- Gran cantidad de proyectos abiertos simultáneamente (6 para Philippe)
- Importante trabajar en local para no interferir con infraestructura actual
- Necesidad de medir tráfico por origen (Meta, Google, SEO) con UTMs
- Acceso del equipo comercial a Opportunities: presentar resumen inicial en Excel, luego formación en High Level
