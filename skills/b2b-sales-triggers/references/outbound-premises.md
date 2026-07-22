# Outbound puro — 6 premisas (sin señal previa)

Cuando **no hay trigger**: el prospect no te conoce y no hizo nada detectable.
Aquí la premisa no es una señal externa sino una **estrategia de entrada** a la
cuenta. Todas exigen personalización 1:1 real (ver `b2b-personalization-depth`,
tier profundo) — sin señal que haga el trabajo, la investigación la sustituye.

## 1. CXO Passdown (empezar arriba y bajar)

**Estrategia**: escribir al C-level no para venderle, sino para que te derive a la
persona correcta. Una derivación del jefe llega con autoridad implícita.

**Ejecución**: mensaje ultracorto al ejecutivo — quién eres en una línea, a qué
perfil de empresa ayudas con qué problema, y la pregunta: *"¿quién lleva [tema]
en [empresa]?"*. Cuando te derive, abre el mensaje al destinatario citando la
derivación ("[nombre del C-level] me sugirió hablar contigo").

**Cuándo**: deals ATL, cuentas medianas/grandes donde no identificas al decisor.

## 2. Groundswell para información

**Estrategia**: construir champions en la base antes de tocar al decisor.
Contactar a usuarios finales e ICs para entender el contexto interno (qué usan,
qué duele, quién decide) aportándoles valor, sin pitch.

**Cuándo**: cuentas Tier 1 donde entrar a ciegas quemaría al decisor.

## 3. Groundswell para colocación de producto

**Estrategia**: poner el producto en manos de los usuarios finales primero
(trials, tier gratuito) y dejar que el uso genere la demanda interna — motion
bottom-up clásico.

**Cuándo**: producto con onboarding self-service y valor rápido para el IC.

## 4. DM apoyado en adopción interna

**Estrategia**: cuando el groundswell funcionó, escribir al decisor con la
adopción como prueba: *"N personas de tu equipo ya usan [producto] desde hace
[tiempo] — ¿tiene sentido hablar de escalarlo?"*. Datos reales de uso, jamás
inflados.

**Cuándo**: la continuación natural de la premisa 3; el único cold email que
llega con proof interno.

## 5. Multi-persona (comité de compra)

**Estrategia**: orquestar el contacto a varios stakeholders de la cuenta a la
vez, con mensaje distinto por rol: comprador económico (presupuesto/ROI),
comprador técnico (integración/seguridad), usuario final (workflow diario),
champion (carrera/visibilidad). Coordinar el timing para que los mensajes se
refuercen sin parecer un bombardeo.

**Cuándo**: venta enterprise compleja. Mapea el comité primero
(ver `b2b-targeting-playbook`, buying committee).

## 6. Cold outbound clásico

**Estrategia**: la premisa de último recurso — el prospect encaja en el ICP y
nada más. Exige: investigación profunda de persona y empresa, apertura
pattern-interrupt (romper el molde del cold email esperable) y relevancia
estática impecable ("trabajamos con [perfil exacto como el suyo]").

**Cuándo**: solo para cuentas de alto valor que justifiquen la inversión 1:1, o
como capa de volumen con expectativas realistas (~6-8% reply vs 18-22% con señal).

## Factores de éxito comunes

1. Investigación real (persona + empresa) — no rellenar plantillas.
2. Pattern interrupt — si parece un cold email más, muere sin abrirse.
3. Relevancia clara — por qué tú, por qué él, por qué ahora.
4. Multicanal — email solo no basta: LinkedIn + email coordinados.
5. Persistencia con valor — cada follow-up aporta algo nuevo (ver cadencias en `b2b-personalization-depth`).

## En nuestro stack

Estas premisas se ejecutan con Yalc (`outbound.workflow.start`) sobre listas
sourced vía Apollo. La premisa elegida define el `contactReason` y el ángulo de
las variantes de copy. Para groundswell/multi-persona, mapea el comité con
`leads.search` (títulos/seniority por cuenta) antes de lanzar.
