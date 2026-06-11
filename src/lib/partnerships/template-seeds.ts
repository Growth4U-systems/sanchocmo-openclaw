/**
 * Plantillas semilla (SAN-80) — las 6 del mockup `plantillas.html`:
 * 3 secuencias (2 partnerships + 1 B2B) + 3 briefs (Monzo reel/post +
 * checklist compliance FCA). Se siembran al primer GET de la biblioteca de
 * un workspace sin plantillas (mismo espíritu que los seeds de SAN-78).
 *
 * CLIENT-SAFE: solo datos.
 */

import type { PartnershipTemplate } from "./templates";

const SEEDED_AT = "2026-06-11T09:00:00.000Z";

export const SEED_TEMPLATES: readonly PartnershipTemplate[] = [
  {
    id: "primer-contacto-creators-fintech",
    name: "Primer contacto creators fintech",
    kind: "sequence",
    type: "partnerships",
    description: "3 pasos: intro + follow-up 3d + break-up 7d",
    updatedAt: SEEDED_AT,
    steps: [
      {
        title: "Intro",
        delayDays: 0,
        subject: "{{handle}} × Monzo — programa creators España",
        body: "Hola {{handle}},\n\nSoy Ana, del equipo de partnerships de Monzo. Llevamos semanas siguiendo tu contenido de finanzas personales y nuestro radar te da un quality score de {{quality_score}}/100 — de los más altos de tu tier.\n\nEstamos abriendo el programa de creators en España (presupuesto 20K€) y creemos que encajas de lleno con nuestra audiencia.\n\n¿Te va una llamada de 15 min esta semana?",
      },
      {
        title: "Follow-up",
        delayDays: 3,
        subject: "Re: {{handle}} × Monzo",
        body: "Hola de nuevo {{handle}} — sé que el inbox aprieta, así que solo reflote rápido.\n\nTenemos hueco para 5 creators este trimestre y tu perfil encaja especialmente bien con la audiencia de Monzo en España. El fee orientativo para tu tier sería {{precio}}.\n\n¿Hablamos?",
      },
      {
        title: "Break-up",
        delayDays: 7,
        subject: "Última de mi parte 🙂",
        body: "Última vez que escribo, prometido 🙂\n\nSi ahora no es el momento, sin problema — cerramos esta ronda el viernes. Si más adelante te apetece colaborar con Monzo, responde a este hilo y te reservo plaza en la siguiente.\n\n¡Mucho éxito con el contenido, {{handle}}!",
      },
    ],
  },
  {
    id: "re-engagement-creators-parados",
    name: "Re-engagement creators parados",
    kind: "sequence",
    type: "partnerships",
    description: "2 pasos para contactos sin respuesta >30 días",
    updatedAt: SEEDED_AT,
    steps: [
      {
        title: "Re-engagement",
        delayDays: 0,
        subject: "{{handle}}, ¿retomamos?",
        body: "Hola {{handle}}, hace un tiempo hablamos del programa de creators de Monzo y se nos quedó la conversación a medias.\n\nDesde entonces el programa ha crecido: nuevas condiciones, brief más flexible y fee actualizado ({{precio}} para tu tier).\n\n¿Le damos otra vuelta?",
      },
      {
        title: "Cierre suave",
        delayDays: 5,
        subject: "Re: ¿retomamos?",
        body: "Sin querer insistir, {{handle}} — si la colaboración con Monzo no te encaja ahora, dime \"más adelante\" y te dejo de escribir hasta el próximo trimestre. Si te encaja, en 15 min te cuento lo nuevo.",
      },
    ],
  },
  {
    id: "outreach-b2b-saas",
    name: "Outreach B2B SaaS",
    kind: "sequence",
    type: "b2b",
    description: "3 pasos orientados a partnerships de producto (no creators)",
    updatedAt: SEEDED_AT,
    steps: [
      {
        title: "Intro B2B",
        delayDays: 0,
        subject: "Monzo × tu producto — integración",
        body: "Hola, soy Ana de Monzo. Estamos buscando partners SaaS para integrar pagos y onboarding embebido. Vi vuestro producto y creo que hay encaje claro.\n\n¿15 min esta semana para explorarlo?",
      },
      {
        title: "Follow-up",
        delayDays: 4,
        subject: "Re: Monzo × tu producto",
        body: "Reflote rápido — tenemos slot de integración este trimestre y un canal de distribución a +400K clientes en España. Si os encaja, lo vemos en una llamada corta.",
      },
      {
        title: "Break-up",
        delayDays: 8,
        subject: "Cierro hilo",
        body: "Cierro este hilo por ahora. Si más adelante queréis explorar la integración con Monzo, respondedme y lo retomamos.",
      },
    ],
  },
  {
    id: "brief-monzo-reel-educativo",
    name: "Brief Monzo · reel educativo",
    kind: "brief",
    type: "partnerships",
    description: "Reel 45-60s: un concepto financiero explicado simple, CTA a la app",
    updatedAt: SEEDED_AT,
    steps: [
      {
        title: "Contenido del brief",
        delayDays: 0,
        subject: null,
        body: "OBJETIVO: reel de 45-60s explicando UN concepto financiero (ahorro automático, redondeo, pots) con tu estilo.\n\nMENSAJE CLAVE: \"Monzo te ayuda a ahorrar sin pensarlo\".\n\nOBLIGATORIO: mención #ad al inicio · mostrar la app real · CTA al link de tu bio ({{handle}} tracking propio).\n\nNO HACER: promesas de rentabilidad, comparativas con bancos concretos, consejos de inversión.\n\nENTREGA: borrador en 7 días para revisión de compliance.",
      },
    ],
  },
  {
    id: "brief-monzo-post-comparativa",
    name: "Brief Monzo · post comparativa",
    kind: "brief",
    type: "partnerships",
    description: "Post estático/carrusel: \"mi cuenta de siempre vs Monzo\" sin citar marcas",
    updatedAt: SEEDED_AT,
    steps: [
      {
        title: "Contenido del brief",
        delayDays: 0,
        subject: null,
        body: "OBJETIVO: carrusel o post estático comparando tu experiencia bancaria anterior vs Monzo (comisiones, alertas, pots).\n\nMENSAJE CLAVE: transparencia y control.\n\nOBLIGATORIO: #ad visible · datos reales de tu uso · sin citar otras marcas por nombre.\n\nTONO: tu voz, no la nuestra — el copy final lo escribes tú ({{handle}}), nosotros solo validamos compliance.\n\nENTREGA: 5 días.",
      },
    ],
  },
  {
    id: "brief-compliance-fca-checklist",
    name: "Brief compliance FCA (checklist)",
    kind: "brief",
    type: "partnerships",
    description: "Checklist obligatorio que acompaña a todo brief de campaña financiera",
    updatedAt: SEEDED_AT,
    steps: [
      {
        title: "Contenido del brief",
        delayDays: 0,
        subject: null,
        body: "☐ #ad o \"publicidad\" visible en los 3 primeros segundos / primera línea.\n☐ Sin promesas de rentabilidad ni \"dinero fácil\".\n☐ Sin consejo de inversión personalizado.\n☐ Disclaimer: \"Monzo está regulado por la FCA\".\n☐ Capturas de la app sin datos personales reales.\n☐ El creator ({{handle}}) envía la pieza para revisión ANTES de publicar.\n☐ Aprobación escrita de compliance archivada en el deal.",
      },
    ],
  },
];
