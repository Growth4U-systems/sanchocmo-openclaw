import { test } from "node:test";
import assert from "node:assert/strict";
// validate.ts is consumed as CommonJS (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in other tests.
import * as mod from "../validate";
const { validateIntakeSubmission, IntakeValidationError } = (
  mod as unknown as { default: typeof mod }
).default ?? mod;

function validBody(over: Record<string, unknown> = {}) {
  return {
    contact_name: "Ana", contact_email: "ana@acme.com", company_name: "Acme",
    elevator_pitch: "Vendemos widgets", business_lines: "Widgets", markets: "España",
    problem: "Los widgets son caros", differentiation: "Más baratos", brand_values: "Honestos",
    ideal_customer: "PYMEs", acquisition: "Boca a boca", competitors: "WidgetCo", goals: "Crecer 2x",
    ...over,
  };
}

test("a complete body validates and splits respondent from answers", () => {
  const out = validateIntakeSubmission(validBody());
  assert.equal(out.respondentName, "Ana");
  assert.equal(out.respondentEmail, "ana@acme.com");
  assert.equal(out.answers.company_name, "Acme");
  assert.equal(out.answers.contact_name, undefined); // meta NOT in answers
});
test("a missing required field throws", () => {
  assert.throws(() => validateIntakeSubmission(validBody({ company_name: "" })), IntakeValidationError);
});
test("a bad email throws", () => {
  assert.throws(() => validateIntakeSubmission(validBody({ contact_email: "nope" })), IntakeValidationError);
});
test("optional fields may be omitted", () => {
  const body = validBody() as Record<string, unknown>;
  delete body.objections;
  const out = validateIntakeSubmission(body);
  assert.equal(out.answers.objections, undefined);
});
test("an over-long field throws", () => {
  assert.throws(() => validateIntakeSubmission(validBody({ problem: "x".repeat(10001) })), IntakeValidationError);
});
test("a non-object body throws", () => {
  assert.throws(() => validateIntakeSubmission(null), IntakeValidationError);
});
