import assert from "node:assert/strict";
import test from "node:test";
import * as phaseOneModule from "../outreach/phase-one-message";

const phaseOne = (phaseOneModule as unknown as { default?: typeof phaseOneModule }).default ?? phaseOneModule;
const { buildPhaseOneLinkedInMessage } = phaseOne;

test("builds the phase-one message only from name, company, and contact reason", () => {
  assert.equal(
    buildPhaseOneLinkedInMessage(
      { firstName: "Ana", company: "Nébula CRM" },
      "ayudamos a equipos comerciales pequeños a ordenar su outbound",
    ),
    "Hola Ana, te contacto porque ayudamos a equipos comerciales pequeños a ordenar su outbound. Creo que puede ser relevante para Nébula CRM. ¿Te parece si conectamos?",
  );
});

test("normalizes the reason without adding inferred claims", () => {
  const message = buildPhaseOneLinkedInMessage(
    { firstName: "Diego", company: "AtlasOps" },
    "  quiero compartir una forma simple de abrir nuevas conversaciones.  ",
  );

  assert.equal(
    message,
    "Hola Diego, te contacto porque quiero compartir una forma simple de abrir nuevas conversaciones. Creo que puede ser relevante para AtlasOps. ¿Te parece si conectamos?",
  );
  assert.doesNotMatch(message, /contratando|PLG|funding|creciendo/i);
});

test("does not generate a message without a contact reason", () => {
  assert.equal(buildPhaseOneLinkedInMessage({ firstName: "Ana", company: "Nébula CRM" }, "  "), "");
});
