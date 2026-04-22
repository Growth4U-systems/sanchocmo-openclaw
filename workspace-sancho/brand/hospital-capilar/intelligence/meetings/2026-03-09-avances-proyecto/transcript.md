# Avances Proyecto HC — Transcript de Reunión 09/03/2026

**Fecha:** 2026-03-09T16:00:00.000+01:00  
**Asistentes:** Philippe Sainthubert, Ramiro Perez  
**Fuente:** Google Drive Doc ID 1H8wb4w85UGVX-LIlUZyKRY9uxaByllCyUZmLsNwdYaU

---

## Resumen Ejecutivo

Configuración de las herramientas de desarrollo y la arquitectura del proyecto del cuestionario con especial énfasis en Cloud Code y la gestión de leads en Go High Level, resultando en un plan de acción para optimizar los flujos de trabajo.

---

## Herramientas de desarrollo de IA

Se discutió la configuración de las herramientas, donde **Cursor** actúa como marco de trabajo para **Cloud Code**. Go High Level junto con Posthog resuelve el **80% de las necesidades** de la medición del cuestionario de la actividad del usuario.

---

## Arquitectura y optimización de datos

Se estableció que **GitHub** funcionará como repositorio del proyecto quiz hospital para compartir la información y el código actualizado de Cloud Code. La decisión principal fue **minimizar los custom fields y tags** en Go High Level para simplificar la obtención de métricas.

---

## Estrategia de flujo de trabajo

Es crucial **no complicarse con el diseño de la fase de nurturing sin antes entender el proceso comercial de Hospital Capilar** y validar el embudo de ventas. Para evitar la alta tasa de no shows, se implementarán procesos de recordatorios y confirmación de citas vía WhatsApp y correo electrónico.

---

## Próximos pasos

- **[Philippe Sainthubert]** Subir Proyecto: Subir todo el contenido del proyecto nuevo a GitHub. Compartir el repositorio con Ramiro Perez.
- **[Ramiro Perez]** Pruebas Landings: Realizar pruebas de las landings enviadas para evaluar la llegada del lead a Go High Level.
- **[Ramiro Perez]** Enviar Documento: Pasar el documento del proyecto externo de leads de LinkedIn a Philippe Sainthubert esta semana.
- **[Philippe Sainthubert]** Consultar Funnel: Consultar con Hospital Capilar el funnel actual post-lead. Replicar el proceso comercial que tienen actualmente.
- **[Philippe Sainthubert]** Investigar API: Investigar la API de Sale Force. Planificar la migración de información en tiempo real.
- **[Philippe Sainthubert]** Organizar Demo: Organizar una demostración comercial o reunión con el manejador de CoBox. Validar integraciones API CoBox.
- **[Philippe Sainthubert]** Validar Quiz: Validar las preguntas y estructura del quiz.
- **[Ramiro Perez]** Diseñar Nurturing: Diseñar la estrategia de Nurturing y el funnel. Consultar con Philippe Sainthubert sobre la arquitectura.
- **[Philippe Sainthubert]** Generar Funnel: Pedir a Cloud Code que genere un funnel inicial por SP. Esto es para su revisión posterior.
- **[Ramiro Perez]** Configurar Calendario: Configurar la integración del calendario por contacto.
- **[Ramiro Perez]** Configurar Pagos: Configurar la pasarela de pagos Stripe. Vincular la pasarela a High Level.
- **[Philippe Sainthubert]** Configurar Dominio: Configurar el dominio y los DNSs necesarios. Esto incluye High Level y Netlify.
- **[Philippe Sainthubert]** Crear Landings: Crear versiones de landings que incluyan contacto directo por WhatsApp. También incluir landings con formulario embebido.
- **[Philippe Sainthubert]** Optimizar Landing: Añadir contenido, testimonios e imágenes existentes. Optimizar la landing page de Hospital Capilar.

---

## Detalles Completos

### Configuración inicial de herramientas de desarrollo

Ramiro Perez mencionó que ya instaló Cursor y está en proceso de investigación sobre su funcionamiento. Philippe Sainthubert señaló que la combinación de un cuestionario ya creado con Go High Level y Posthog resuelve el **80% de los problemas**. Go High Level dispone de una API que permite realizar todas las tareas, aunque inicialmente hubo problemas con la correcta recepción de los leads, lo cual ya funciona perfectamente.

### Aclaración sobre el rol de Cloud en Cursor

Philippe Sainthubert explicó que Cursor sirve como el marco de trabajo, pero el trabajo principal lo realiza **Cloud**, por lo que es necesario trabajar con la extensión de Cloud. Ramiro Perez comprendió que la herramienta clave es Cloud, que utiliza el comando `Command Shift P open cloud new tab`.

### Uso de Posthog para la medición del cuestionario

Philippe Sainthubert detalló el proceso de uso de Posthog para medir la actividad del usuario dentro del cuestionario. Posthog se recomienda para medir todo lo que el usuario hace en el cuestionario, el cual está en HTML y tiene múltiples frames o pantallas, colocando un código pequeño (pixel) en cada uno para rastrear si el usuario pasa por allí.

### Oferta de apoyo y preparación de nuevo material

Ramiro Perez comentó que la capacidad de integrar aplicaciones le podría facilitar mucho otro proyecto, a lo que Philippe Sainthubert respondió que contaría con su apoyo. Philippe Sainthubert anunció que le proporcionará a Ramiro Perez todo el contenido del nuevo proyecto, que subirán a GitHub para mostrarle el proceso.

### Estrategia de desarrollo con herramientas de IA

Philippe Sainthubert aclaró que no tiene formación formal en programación, pero que el uso frecuente de Cloud Code le permitió aprender sobre cómo se relacionan las tecnologías, bases de datos y despliegues. La clave es comprender la arquitectura y las relaciones tecnológicas, ya que Cloud ofrece alternativas, aunque no siempre son las mejores, por lo que es fundamental realizar **pruebas constantes (testing)**.

### Uso de GitHub como repositorio del proyecto

Philippe Sainthubert explicó que GitHub funciona como un repositorio, similar a un Google Drive, pero diseñado para facilitar las conexiones entre sistemas y estructurar bien la información. El nuevo proyecto de cuestionario (quiz hospital) se subirá a GitHub para que Ramiro Perez pueda acceder a la información y trabajar con el código más actualizado de Cloud Code.

### Advertencia sobre el uso de Cursor y Cloud Code

Philippe Sainthubert enfatizó la importancia de utilizar Cloud Code dentro de Cursor, ya que Cursor por sí solo puede responder, pero llega a un límite y no tiene el mismo funcionamiento. Ambos acordaron que la pestaña de chat de la izquierda de Cursor no es útil y debería eliminarse.

### Solicitud de ayuda en un proyecto de generación de leads de LinkedIn

Ramiro Perez describió un segundo proyecto que involucra la generación de leads de LinkedIn, que requiere rastrear interacciones, enriquecer datos de los leads (como la empresa y el contacto) y luego montar la información en un CRM para campañas masivas. Ramiro Perez expresó dudas sobre la mejor tecnología a utilizar y la gestión de la información sensible, especialmente en relación con la normativa GDPR.

### Plan de seguimiento para el proyecto de LinkedIn

Philippe Sainthubert preguntó si Ramiro Perez tenía documentación del proyecto de LinkedIn, y este último se comprometió a compartirla después de reunirse con el cliente durante esa semana. Philippe Sainthubert aceptó revisar la documentación del proyecto y ofreció sumarse a la reunión con el cliente si fuese necesario.

### Trabajo en la definición de tags y custom fields en Go High Level

Philippe Sainthubert indicó que ya había creado los contactos, pero el siguiente paso era perfeccionar el uso de los tags. Ramiro Perez aclaró que la base de datos de **Contactos** debe contener toda la información del lead (incluyendo el resumen generado por IA y el scoring), mientras que **Opportunities** debe almacenar el estado comercial y lo que le importa al hospital.

### Recomendación sobre la gestión de tags y custom fields

Ramiro Perez sugirió mantener el **menor número posible de custom fields y tags** para evitar complejidad en la obtención de métricas. Philippe Sainthubert propuso usar Cloud Code para definir un esquema optimizado y simple de custom fields y tags en dos segundos.

### Necesidad de alinear la estrategia de nutrición de leads (Nurturing) con el hospital

Ramiro Perez aconsejó **no complicarse con el diseño de la fase de nurturing sin antes entender cómo trabaja el hospital** y su proceso comercial actual. Ambos acordaron que es esencial consultar con Hospital Capilar para validar el embudo de ventas (funnel) actual y el proceso post-lead.

### Discusión sobre la integración con SalesForce

Se planteó la necesidad de integrar Go High Level con SalesForce para migrar la información, asumiendo que SalesForce tiene una API. Ramiro Perez advirtió que la API de SalesForce puede consumir **tokens costosos**, por lo que la estrategia de integración debe ser bien planificada.

### Automatización del mensaje para agentes comerciales

Philippe Sainthubert mostró que, usando Cloud Code, el sistema ya puede generar un mensaje resumido para el agente de ventas basado en las respuestas del cuestionario. El mensaje automatizado incluye información específica para confirmar una cita de diagnóstico presencial con el paciente.

### Tareas pendientes en la configuración técnica y de datos

Ramiro Perez solicitó configurar la devolución de la información del **UTM** a la API de High Level. Philippe Sainthubert mencionó que necesitan medir el tráfico de origen (Meta, Google, SEO) y que esto debe agregarse también a Posthog, posiblemente usando UTMs.

### Estrategia de flujo de trabajo para las modificaciones

Ramiro Perez propuso trabajar en local con el proyecto para no interferir con la infraestructura actual, solicitando a Philippe Sainthubert que le avisara antes de hacer cualquier cambio importante. Philippe Sainthubert comentó que la infraestructura podría estar lista si trabajaran juntos durante una sesión de ocho horas.

### Revisión del uso de la funcionalidad de Scoring en Go High Level

Ramiro Perez explicó que Go High Level tiene una funcionalidad nativa de **scoring** que asigna puntos por acciones como clics o aperturas de correo. Aunque la parte del cuestionario está hecha con IA, las acciones posteriores como abrir correos aún no están configuradas para el scoring.

### Priorización de la simplificación y el perfeccionamiento

Ramiro Perez enfatizó que el proyecto ya tiene un diseño moderno, y el foco ahora es perfeccionar los tags, las automatizaciones, el branding del correo electrónico y la integración del calendario y SalesForce. Philippe Sainthubert agregó que se debe trabajar en el contenido de la landing con testimonios e imágenes de Hospital Capilar.

### Delegación de la tarea de Nurturing y automatización

Philippe Sainthubert asignó a Ramiro Perez la tarea de sumergirse en la fase de nurturing y de crear las campañas de correo y de contacto para el equipo comercial. Philippe Sainthubert explicó que, una vez que Ramiro Perez vea la información de Contactos y Opportunities, deberá decidir qué hacer con esos datos.

### Estructura de la base de datos de Contactos en High Level

Ramiro Perez instruyó a Philippe Sainthubert sobre cómo editar los campos de información en la sección de Contactos de Go High Level, como las carpetas y los campos visibles (p. ej., quitando `negocio` o `activity` y agregando `lead score`).

### Acceso y formación del equipo comercial

Se debatió la necesidad de dar acceso a la sección de Oportunidades al equipo comercial del hospital. Ramiro Perez sugirió presentarles inicialmente un resumen de leads en un Excel y luego ofrecerles formación en la aplicación High Level para una mayor visión y gestión.

### Estrategia para evitar 'no shows'

Philippe Sainthubert indicó que el hospital tiene una alta tasa de **no shows (50%)**, por lo que se deben implementar procesos claros para recordatorios (dos días antes, el día anterior con llamada) y confirmación de citas para evitar pérdidas financieras.

### Enfoque en los canales de comunicación y testing

Ambos estuvieron de acuerdo en evitar el uso de SMS y enfocarse en **WhatsApp y correo electrónico** para el flujo de comunicación de nurturing. Philippe Sainthubert propuso crear diferentes funnels para cada SP (Service Provider) para realizar testing y determinar cuál convierte mejor.

### Reparto de tareas para la semana

Ramiro Perez propuso centrarse en la investigación de los funnels de nurturing y la configuración de las integraciones de calendario y pagos. Philippe Sainthubert se enfocará en pedirle a Cloud Code que diseñe un funnel por SP, finalizar la configuración de los custom fields y tags, el dominio y los pagos con Stripe.

### Tareas relacionadas con el dominio y las landings

Philippe Sainthubert mencionó que las landings actuales utilizan un subdominio de Netlify (hospitalcapilar.netlify.app), por lo que se necesita configurar el DNS tanto en Netlify como en Go High Level para el dominio de Hospital Capilar. Philippe Sainthubert también creará landings adicionales con contacto directo por WhatsApp y formularios incrustados.
