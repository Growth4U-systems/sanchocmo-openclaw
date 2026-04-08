# Avances proyecto - HC
**Fecha:** 2026-03-06 15:59 CET  
**Fuente:** Google Meet Notes by Gemini  
**ID Documento:** 1MhF-opiBmlvBlXZ5r7ixxj8_bTYiA9n1NSZRCxupeRs

---

Avances proyecto - HC
Invitado   
Archivos adjuntos 
Registros de la reunión   


Resumen
El resumen ejecutivo de la reunión se enfocó en la demostración de herramientas de automatización de contenido con Claude y la definición de la arquitectura para la precualificación de leads del Hospital Capilar.Demostración de Automatización de ContenidoPhilippe Sainthubert demostró su herramienta automatizada de generación de contenido para redes sociales que utiliza la API de Meta y Claude. Se destacó que el posicionamiento web inicial para la consultora de growth ya aparece en Google, generando un lead reciente.Arquitectura de Lead Scoring y QuizEl objetivo principal del proyecto Hospital Capilar es precualificar leads usando IA para generar un resumen que ahorre tiempo a los vendedores. Se decidió que Ramiro Perez construirá las 3 landings y automatizaciones en High Level, y Philippe Sainthubert investigará la integración de un quiz externo via webhook.Integración de Tecnología y PlazosPhilippe Sainthubert recomendó la herramienta Cursor con Cloud Code para facilitar la integración del código del quiz en Go High Level, comprometiéndose a tener una prueba de viabilidad para el lunes. Se enfatizó la necesidad de un dashboard de seguimiento de métricas una vez que el sistema esté en funcionamiento.

Califica este resumen: Útil o Poco útil


Próximos pasos
[Philippe Sainthubert] Consultar Pago: Consultar con Hospital Capilar qué método de pago (Stripe o PayPal) utilizan.
[Ramiro Perez] Suscripción Cloud: Adquirir la suscripción de Cloud Code (aproximadamente 18 USD al mes) para facilitar el trabajo de desarrollo con Cursor.
[Ramiro Perez] Implementar Cursor: Descargar e instalar la aplicación Cursor y los documentos compartidos. Investigar la integración del webhook para extraer información (tags, scoring) del quiz hacia Go High Level.
[Ramiro Perez] Crear Landings: Crear las páginas landing necesarias dentro de Go High Level.
[Ramiro Perez] Definir Estrategia: Desarrollar la estrategia de nurturing de leads post-quiz. Especificar tags de leads, perfiles (A, B, C) y los métodos de contacto (llamada, email, agendar) según el scoring.
[Philippe Sainthubert] Lógica Scoring: Investigar y establecer la lógica de scoring para el quiz.
[Ramiro Perez] Desarrollar Automatizaciones: Construir los flujos de automatización (workflows) en Go High Level. Asegurar la actualización de oportunidades en el pipeline en función de los tags.
[Philippe Sainthubert] Implementar Quiz: Implementar la funcionalidad del quiz para asegurar el correcto flujo de datos a Go High Level. Determinar la viabilidad del enfoque propuesto antes del lunes.
[Ramiro Perez] Configurar Automaciones: Configurar automaciones, etapas y conexión preliminar con WhatsApp luego del ingreso del lead. Apuntar a tener el montaje listo para pruebas el miércoles.


Detalles
Saludo e Intercambio Inicial: Philippe Sainthubert y Ramiro Perez se saludan y reconocen el cansancio debido a una semana de mucho trabajo. Ramiro Perez menciona que le está dedicando mucho tiempo al proyecto y levantándose temprano, pero que disfrutan el trabajo (00:00:00).
Desarrollo de un Creador de Contenido Automatizado: Philippe Sainthubert describe una herramienta que creó para generar contenido automáticamente para Instagram y LinkedIn a partir de blogs existentes. Esta herramienta selecciona el blog, crea una publicación con el formato y el texto, y la programa automáticamente (00:00:00).
Automatización Personal de Contenido de Ramiro Perez: Ramiro Perez comparte que ha estado haciendo algo "bastante por debajo" de la herramienta de Philippe, donde toma una noticia, la resume, genera una foto y la publica en LinkedIn, utilizando Make y Google (00:02:11).
Demostración de la Herramienta de Creación de Contenido con Cloud: Philippe Sainthubert muestra cómo funciona su herramienta, explicando que selecciona un blog, genera un avatar para hacerlo más atractivo y que permite ver una vista previa de cómo saldría la publicación. La herramienta usa la API de Meta con Claude para publicar y programar contenido directamente en Instagram (00:03:04).
Posicionamiento Web y Captación de Leads: Philippe Sainthubert comenta que la web que crearon desde cero en noviembre ya está posicionando en Google y aparece en búsquedas como "consultora de growth en España" (00:04:25). Además, informa que la web generó recientemente un lead (00:06:32).
Uso de Claude en el Proyecto: Philippe Sainthubert menciona que la explosión del proyecto se dio cuando pasaron de usar Gemini a usar Claude. Ramiro Perez intenta mostrar algo que hizo con Claude, pero tiene problemas técnicos con la aplicación (00:06:32).
Definición de la Arquitectura del Hospital Capilar: Ramiro Perez explica que el objetivo del hospital es precualificar usuarios y utilizar la IA para generar un resumen del proceso de "quiz" para ahorrar tiempo a los vendedores o médicos. Señala que aún necesitan abordar la implementación del quiz (00:08:01).
Dificultades Técnicas y Recomendaciones de Hardware: Ramiro Perez experimenta problemas de lentitud con su Mac al intentar compartir pantalla, a lo que Philippe Sainthubert recomienda la compra de un Mac Pro M5 (00:09:29).
Estructura del Funnel y Quiz en Go High Level: Ramiro Perez presenta un diagrama de arquitectura en Notion que incluye orígenes de la formación, tres tipos de *landings* (mujer, hombres menores y mayores de 28), y diferentes flujos como *quiz* corto, *quiz* largo y formulario directo. Estos flujos se reflejarían en el *pipeline* de Go High Level (00:11:17).
Configuración de Pagos en Go High Level (High Level): Ramiro Perez aborda la necesidad de configurar los pagos (Stripe o PayPal) de la agencia en la vista de agencia de High Level para cubrir los costos de notificaciones (correo y SMS) durante la fase piloto. Philippe Sainthubert consultará con Hospital Capilar qué método de pago utilizan para integrarlo directamente desde su cuenta (00:14:39) (00:17:31).
Organización del Proyecto en Notion: Ramiro Perez expresa dificultades para mantener la organización en Notion debido a la cantidad de documentos (00:17:31). Philippe Sainthubert le muestra cómo usar la funcionalidad de IA de Notion (Cloud Opus 4.6 integrado) para ayudar a actualizar y organizar el *planning* del proyecto (00:18:40).
Disponibilidad de Preguntas del Quiz: Philippe Sainthubert confirma que las preguntas para el quiz ya están disponibles en un documento de Notion llamado "quiz diagnóstico capilar arquitectura" (00:21:23).
Recomendación de la Herramienta Cursor con Cloud Code: Philippe Sainthubert recomienda a Ramiro Perez descargar la herramienta Cursor, que integra Cloud Code, para facilitar la conexión de dependencias y APIs para la creación del quiz (00:22:48). Ramiro Perez acepta descargarla para probarla (00:24:09).
Elaboración del Quiz con Cursor y Cloud Code: Philippe Sainthubert comparte los archivos del quiz diagnóstico por Google Drive para que Ramiro Perez los cargue en un nuevo proyecto de Cursor. Philippe Sainthubert explica que el código del quiz ya está creado con la lógica de las preguntas y las condiciones, y sugiere usar Cloud Code para intentar pasarlo a Go High Level automáticamente (00:30:24) (00:39:03).
Discusión sobre la Conexión del Quiz Externo (Cloud) a Go High Level: Se debate la viabilidad de importar el quiz, ya que las herramientas nativas de High Level (Surveys, Quizzes) no permiten importaciones (00:41:39). Proponen usar un *webhook* como *trigger* para pasar la información del quiz externo a Go High Level, aunque esta funcionalidad requiere la versión premium de High Level (00:43:23).
Definición de Próximos Pasos y Asignación de Tareas: Ramiro Perez y Philippe Sainthubert definen los entregables y la división del trabajo. Philippe Sainthubert se enfocará en investigar el *webhook* y la lógica del quiz con Cloud, mientras que Ramiro Perez se dedicará a construir las *landings* en High Level y las automatizaciones (*workflows*) que utilizan *tags* y *scoring* para gestionar las oportunidades en el *pipeline* (00:49:06) (00:52:42).
Estrategia de Scoring y Accionables para Leads: Philippe Sainthubert enfatiza la importancia de definir claramente los *tags*, los tipos de perfiles (A, B o C) y qué acciones (llamada, correo, agenda) se tomarán en función del *scoring* del lead (00:51:23).
Implementación de la Notificación al Comercial y Priorización: Se establece que, una vez que el usuario deja sus datos, High Level los recogerá, actualizará el contacto con los *custom fields* del *webhook*, y los contactos "hot" (alta puntuación) dispararán una notificación por WhatsApp o Telegram al comercial, indicando la prioridad de llamada (00:54:00) (00:56:22).
Priorización de Entregables y Futuras Investigaciones: Se acuerda enfocarse primero en la precualificación de leads y el ahorro de tiempo al comercial, dejando la investigación de la API de Coibox y la agenda automática para un segundo paso (00:56:22).
Necesidad de un Dashboard de Seguimiento de Métricas: Philippe Sainthubert sugiere que se necesitará un *dashboard* para monitorear métricas clave como el número de leads, los canales de entrada, y el porcentaje de conversión a agenda. Ramiro Perez acuerda que el análisis de métricas se realizará una vez que el sistema esté en funcionamiento (00:58:47).
Grabación y Organización de Reuniones: Philippe Sainthubert informó que la reunión anterior también fue grabada y que las grabaciones se guardan en el mismo lugar, en la carpeta de Documentos de Hospital Capilar, etiquetadas como "reunión". Ramiro Perez preguntó sobre cómo se podrían categorizar estos documentos, y se aclaró que los archivos tienen etiquetas de reunión y que los documentos marcados en azul son los reportes que ellos han realizado (01:00:04).
Acumulación de Información y Proyectos Abiertos: Ramiro Perez comentó que les resulta difícil ponerse al día debido a la gran cantidad de información que manejan y la velocidad de trabajo, lo cual les ralentiza. Philippe Sainthubert reconoció que actualmente tiene seis proyectos abiertos simultáneamente y a veces se pierde, aunque intentó tranquilizar a Ramiro Perez diciendo que deben concentrarse en la planificación que tienen por delante (01:01:09).
Plan de Integración del Quiz y Automatización: Philippe Sainthubert se enfocará en asegurar que la información del quiz se integre correctamente con Go High Level. El plan es que Ramiro Perez se encargue de todas las automatizaciones una vez que el lead ingrese, incluyendo los stages y la conexión preliminar con WhatsApp. El objetivo es tener esta configuración montada para el miércoles, permitiendo comenzar las pruebas (01:02:12).
Prueba de Funcionalidad y Plazos del Quiz: Philippe Sainthubert se comprometió a intentar determinar si su propuesta de quiz es viable para el lunes; si no lo es, volverán a utilizar los quizzes nativos de Go High Level. Ramiro Perez vio con buenos ojos probar la nueva funcionalidad, ya que podría ahorrarles tiempo. Philippe Sainthubert expresó su deseo de crear la primera versión del quiz y algunos elementos de automatización para que Ramiro Perez pueda seguir con el proyecto (01:02:12).
Cierre de la Reunión y Próximos Pasos: La reunión concluyó debido a que Philippe Sainthubert tenía que marcharse a otra reunión, pero mencionaron que hablarían por Slack para cualquier duda y que posiblemente necesitaría robarles unos minutos más. Acordaron que si la nueva funcionalidad del quiz es posible, seguirán adelante, y si no, tendrán tiempo para hacer el quiz de otra manera (01:02:12).


Revisa las notas de Gemini para asegurarte de que sean precisas. Obtén sugerencias y descubre cómo Gemini toma notas
Cómo es la calidad de estas notas específicas? Responde una breve encuesta para darnos tu opinión; por ejemplo, cuán útiles te resultaron las notas.
