# Mapa de Foros Temáticos
<!-- v3.3 -->

## Índice
- [España (default)](#españa-default)
- [Indicadores de búsqueda](#indicadores-de-búsqueda)
- [Descubrimiento de foros para otros países](#descubrimiento-de-foros-para-otros-países)

## España (default)

### Finanzas e Inversión
- rankia.com — inversión, ahorro, fondos, bolsa
- finect.com — inversiones, fondos, asesoría financiera

### Inmobiliario
- idealista.com/foro — vivienda, alquiler, hipoteca
- fotocasa.es — compra, venta, alquiler

### Bodas
- bodas.net — boda, casamiento, organización
- zankyou.es — boda, lista de bodas

### Crianza
- bebesymas.com — bebé, embarazo, crianza
- serpadres.es — hijos, familia, educación

### Viajes
- tripadvisor.es — vacaciones, viaje, turismo
- losviajeros.com — viaje, destinos

### Freelancers y Negocios
- infoautonomos.com — autónomo, factura, IVA, IRPF
- domestika.org — freelancer, diseño, creativos

### Comunidad General
- forocoches.com — alto volumen, todos los temas
- mediavida.com — tech-leaning
- burbuja.info — economía, política

### Reddit (español)
- r/spain, r/SpainEconomics, r/autonomos, r/mexico, r/argentina, r/colombia

## Indicadores de búsqueda

### Frustración (español)
"me frustra", "estoy harto", "no aguanto más", "es una pesadilla", "me tiene loco"

### Búsqueda de ayuda (español)
"¿alguien sabe", "necesito ayuda", "¿qué hago?", "consejos para", "¿cómo puedo"

### Quejas (español)
"problema con", "no puedo", "me cuesta", "dificultad para", "es horrible"

### Necesidad (español)
"busco alternativa", "¿hay algo mejor?", "ojalá existiera", "necesito encontrar"

### Frustración (inglés — para mercados anglosajones)
"I'm frustrated", "sick of", "can't stand", "nightmare", "driving me crazy"

### Búsqueda de ayuda (inglés)
"anyone know", "need help", "what should I do", "advice for", "how can I"

### Necesidad (inglés)
"looking for alternative", "is there anything better", "I wish there was", "need to find"

## Descubrimiento de foros para otros países

Si el país del cliente NO es España, ejecutar este procedimiento ANTES de Phase 2:

### Paso 1: Detectar gap
Comprobar si el país target está cubierto arriba. Si no:

> "El mercado target es **[país]** y no tengo foros mapeados para ese mercado. ¿Quieres que busque foros y comunidades relevantes para [país] en la industria de [industria]? Esto mejorará significativamente la calidad del scraping."

### Paso 2: Descubrir foros (si usuario acepta)
Usar `web_search` con estas queries:
1. `"[industria] forum [país]"` / `"foro [industria] [país]"`
2. `"[industria] community [país]"` / `"comunidad [industria] [país]"`
3. `"reddit [industria] [país]"` — buscar subreddits locales
4. `"[producto/sector] complaints [país]"` / `"quejas [sector] [país]"`
5. `"[industria] [país] quora OR reddit OR forum"` — catch-all

### Paso 3: Validar y guardar
- Verificar con `web_fetch` que los foros encontrados tienen actividad reciente (< 6 meses)
- Guardar en `brand/{slug}/niche-discovery/forums-{country-code}.md`
- Formato: igual que la sección España (categoría → dominio — descripción)
- Usar estos foros en Phase 2 (Strategy) y Phase 3 (SERP Search)

### Paso 4: Adaptar indicadores
- Si el idioma no es español ni inglés, generar indicadores de frustración/ayuda/queja/necesidad en el idioma local
- Añadirlos al `config.json` de la run
