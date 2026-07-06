# Ejemplos de Archivos Intermedios
<!-- v3.3 -->

## Índice
- [config.json (Phase 2 output)](#configjson-phase-2-output)
- [problems.md (Phase 5 output)](#problemsmd-phase-5-output)
- [Cómo splitear problems.md en chunks](#cómo-splitear-problemsmd-en-chunks)

## config.json (Phase 2 output)

```json
{
  "company": "Example",
  "industry": "fintech",
  "country": "es",
  "context_type": "B2B",
  "market_mode": "forum",
  "life_contexts": [
    "autónomo facturando",
    "startup creciendo",
    "pyme con empleados",
    "ecommerce vendiendo",
    "freelancer internacional",
    "negocio estacional",
    "empresa exportando",
    "comercio local",
    "SaaS cobrando suscripciones",
    "marketplace gestionando pagos"
  ],
  "product_words": [
    "cobro",
    "factura",
    "comisión bancaria",
    "pasarela de pago",
    "TPV",
    "transferencia",
    "conciliación",
    "domiciliación"
  ],
  "sources": {
    "reddit_subreddits": ["r/spain", "r/autonomos", "r/SpainEconomics"],
    "thematic_forums": ["rankia.com", "infoautonomos.com", "finect.com"],
    "general_forums": ["forocoches.com", "burbuja.info"]
  },
  "serp_pages": 3
}
```

## problems.md (Phase 5 output)

```markdown
| Source URL | Problem | Functional Cause | Persona Type | Emotional Load | Alternatives | JTBD Statement |
|-----------|---------|-----------------|-------------|---------------|-------------|----------------|
| https://rankia.com/foros/... | Comisiones de TPV del 2.5% me comen el margen en ventas pequeñas | Las pasarelas cobran porcentaje fijo sin importar el volumen | Dueño de tienda online con ticket medio <20€ | Frustración, sensación de estar perdiendo dinero | Bizum manual, transferencia bancaria, efectivo | Cuando proceso pagos pequeños en mi tienda online, quiero una pasarela con comisiones bajas en tickets pequeños, para que mi margen no desaparezca |
| https://reddit.com/r/autonomos/... | Llevo 3 meses esperando que el banco me active la domiciliación SEPA | Los bancos tienen procesos burocráticos lentos para autónomos | Autónomo con 50 clientes recurrentes | Ansiedad, miedo a perder clientes | Cobrar por transferencia manual, Stripe, recordatorios por email | Cuando necesito cobrar a mis clientes recurrentes, quiero poder domiciliar pagos fácilmente, para que no tenga que perseguir facturas cada mes |
| https://infoautonomos.com/foro/... | No consigo cuadrar los cobros de Stripe con mi contabilidad | Stripe reporta en USD, mi banco en EUR, fechas no coinciden | Freelancer que cobra a clientes internacionales | Agobio, miedo a errores fiscales | Excel manual, contratar gestor extra, ignorar diferencias | Cuando recibo pagos internacionales, quiero que la conciliación sea automática, para que no pierda horas cuadrando divisas |
```

Cada fila es UN problema extraído de UNA conversación real. El campo JTBD Statement sigue el formato: "Cuando [situación], quiero [motivación], para que [resultado]".

## Cómo splitear problems.md en chunks

Para Phase 6a, dividir `problems.md` en ~5 chunks de tamaño similar:

```bash
# Contar líneas (excluyendo header)
total=$(tail -n +3 brand/{slug}/niche-discovery/problems.md | wc -l)
chunk_size=$(( (total + 4) / 5 ))  # redondear hacia arriba

# Extraer header
head -2 brand/{slug}/niche-discovery/problems.md > /tmp/header.md

# Crear chunks
tail -n +3 brand/{slug}/niche-discovery/problems.md | split -l $chunk_size - /tmp/chunk-

# Añadir header a cada chunk
i=1
for f in /tmp/chunk-*; do
  cat /tmp/header.md "$f" > "brand/{slug}/niche-discovery/problems-chunk-${i}.md"
  i=$((i+1))
done
```

Alternativa simple: si `problems.md` tiene ~300 líneas, cada chunk tendrá ~60 líneas. Puedes hacerlo manualmente en el editor.
