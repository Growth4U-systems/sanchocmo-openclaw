import { test } from "node:test";
import assert from "node:assert/strict";
// request.ts is consumed as CommonJS (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in other tests.
import * as reqMod from "../request.ts";
const { resolveIntakeRequest } = (
  reqMod as unknown as { default: typeof reqMod }
).default ?? reqMod;

import * as tokensMod from "../../intake-tokens.ts";
const { signIntakeToken } = (
  tokensMod as unknown as { default: typeof tokensMod }
).default ?? tokensMod;

test("missing token → 400", () => {
  assert.equal(resolveIntakeRequest(undefined, {}).error?.status, 400);
});

test("invalid token → 403", () => {
  assert.equal(resolveIntakeRequest("garbage.token", {}).error?.status, 403);
});

test("valid token + invalid body → 400", () => {
  const token = signIntakeToken("acme");
  assert.equal(resolveIntakeRequest(token, { contact_name: "" }).error?.status, 400);
});

test("valid token + valid body → resolved input, no error", () => {
  const token = signIntakeToken("acme");
  const r = resolveIntakeRequest(token, {
    contact_name: "Ana", contact_email: "ana@acme.com", company_name: "Acme",
    elevator_pitch: "Widgets", business_lines: "Widgets", markets: "ES",
    problem: "caro", differentiation: "barato", brand_values: "honesto",
    ideal_customer: "pyme", acquisition: "boca", competitors: "X", goals: "2x",
  });
  assert.equal(r.error, undefined);
  assert.equal(r.slug, "acme");
  assert.equal(r.input?.respondentName, "Ana");
});
