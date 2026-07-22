# Bridgebound V — Eventos firmográficos (15 triggers)

**Eventos de empresa públicos y verificables**: funding, IPO, M&A, contratación,
lanzamientos. Son los triggers más fáciles de detectar a escala y los más usados —
lo que significa que la ejecución (timing + ángulo específico) marca la diferencia,
porque el prospect recibirá más emails de "enhorabuena por la ronda".

**Regla de oro**: el evento es la excusa, no el mensaje. La segunda línea tiene que
conectar el evento con un problema concreto del rol ("las Series B suelen duplicar
el equipo de ventas en 6 meses — eso rompe X").

## Eventos financieros (3)

| # | Trigger | Señal / detección | Ángulo | Timing |
|---|---|---|---|---|
| 1 | Salió a bolsa (IPO) | Prensa financiera, registros públicos | Post-IPO: presión de reporting, compliance, eficiencia visible para el mercado | 30-60 días post-IPO |
| 2 | Levantó una ronda | Prensa, Crunchbase, anuncio en LinkedIn | Presupuesto nuevo + mandato de crecer: qué se rompe al escalar lo que tú arreglas | 2-4 semanas tras el anuncio |
| 3 | Publicó resultados financieros | Informes públicos (cotizadas) | Cita el dato relevante del informe y su implicación operativa | Días tras la publicación |

## M&A (3)

| # | Trigger | Señal / detección | Ángulo | Timing |
|---|---|---|---|---|
| 4 | Adquirió otra empresa | Prensa, registros | Integrar equipos/sistemas duplicados: consolidación como dolor inmediato | 60-90 días post-cierre |
| 5 | Fue adquirida | Prensa, registros | Nuevos dueños = nuevas prioridades y revisión de vendors: ventana de entrada | 60-90 días post-cierre |
| 6 | Se fusionó | Prensa, registros | Igual que #4/#5 con doble redundancia de sistemas | 60-90 días post-cierre |

## Señales de crecimiento (4)

| # | Trigger | Señal / detección | Ángulo | Timing |
|---|---|---|---|---|
| 7 | Hipercrecimiento sostenido | Headcount histórico (LinkedIn), rankings de crecimiento | Lo que funcionaba con 50 personas se rompe con 200: escala como dolor | Monitorización continua |
| 8 | Empezó a contratar (patrón nuevo) | Portal de empleo, vacantes publicadas | Las vacantes revelan la prioridad interna; ofrece acelerar el ramp de esos roles | ≤2 semanas del patrón |
| 9 | Movió su sede | Prensa, registros, LinkedIn | Momento de renovación de operaciones y proveedores | Al detectar |
| 10 | Abrió nuevas oficinas/mercados | Prensa, web, vacantes por geografía | Expansión geográfica: replicar operaciones en el mercado nuevo | Al detectar |

## Producto y marketing (5)

| # | Trigger | Señal / detección | Ángulo | Timing |
|---|---|---|---|---|
| 11 | Lanzó un producto nuevo | Product Hunt, prensa, changelog | Todo lanzamiento crea trabajo nuevo (soporte, GTM, medición) que tú aceleras | 1-2 semanas tras el lanzamiento |
| 12 | Lanzó una feature relevante | Changelog, anuncios | La feature indica hacia dónde va su roadmap: alinea tu propuesta | 1-2 semanas |
| 13 | Lanzó una integración | Directorio de integraciones | Cambio de stack en marcha: ventana para complementos | 1-2 semanas |
| 14 | Hizo un movimiento de marketing potente | Campañas visibles, rebrand, patrocinios | Momentum de marketing = presupuesto activo y ambición: súbete a esa ola | Mientras dura la campaña |
| 15 | Su competidor hizo un movimiento potente | Prensa/campañas del rival | Presión competitiva: "vuestro rival acaba de hacer X — ¿cómo respondéis?" | Días tras el movimiento |

## En nuestro stack

Funding, hiring y crecimiento son los candidatos naturales para automatizar con el
provider `crustdata` de Yalc cuando esté activo; hoy la detección es manual
(prensa, LinkedIn, Crunchbase). Al montar la campaña Yalc, el evento y su fecha
van en `contactReason` — la personalización batch exige señal verificada, y un
evento firmográfico con fuente y fecha es la señal verificada ideal.
