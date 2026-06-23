import { test } from "node:test";
import assert from "node:assert/strict";

// buildOnboardingCrons es el transform puro que decide qué crons se siembran en el
// client-config.json de un cliente nuevo (SAN-309). Mismo patrón CJS/namespace que
// los otros tests .mts para el interop con la lib .ts.
import * as seedMod from "../client-config-seed";

const { buildOnboardingCrons } =
  (seedMod as unknown as { default: typeof seedMod }).default ?? seedMod;

test("incluye solo los auto_onboarding:true con default_schedule, enabled", () => {
  const crons = buildOnboardingCrons({
    morning_metrics: { auto_onboarding: true, default_schedule: "0 8 * * 1-5", default_tz: "Europe/Madrid" },
    trust_score_refresh: { auto_onboarding: true, default_schedule: "0 9 1,15 * *", default_tz: "Europe/Madrid" },
  });
  assert.deepEqual(Object.keys(crons).sort(), ["morning_metrics", "trust_score_refresh"]);
  assert.deepEqual(crons.trust_score_refresh, {
    enabled: true,
    schedule: "0 9 1,15 * *",
    tz: "Europe/Madrid",
  });
});

test("excluye auto_onboarding:false (crons opt-in / manuales)", () => {
  const crons = buildOnboardingCrons({
    daily_pulse: { auto_onboarding: false, default_schedule: "0 9 * * 1-5" },
    weekly_synthesis: { default_schedule: "0 10 * * 1" },
  });
  assert.deepEqual(crons, {});
});

test("excluye auto_onboarding:true sin default_schedule (no se puede crear el cron)", () => {
  const crons = buildOnboardingCrons({
    sin_schedule: { auto_onboarding: true },
  });
  assert.deepEqual(crons, {});
});

test("ignora claves de documentación ($comment*)", () => {
  const crons = buildOnboardingCrons({
    $comment: "doc" as unknown as { auto_onboarding?: boolean },
    morning_metrics: { auto_onboarding: true, default_schedule: "0 8 * * 1-5" },
  });
  assert.deepEqual(Object.keys(crons), ["morning_metrics"]);
});

test("default_tz: usa Europe/Madrid cuando el template no lo declara", () => {
  const crons = buildOnboardingCrons({
    trust_score_refresh: { auto_onboarding: true, default_schedule: "0 9 1,15 * *" },
  });
  assert.equal(crons.trust_score_refresh.tz, "Europe/Madrid");
});

test("refleja el cron-templates.json real: trust_score_refresh entra como auto", () => {
  // Forma mínima del fichero real (con $comment + un cron opt-in para contraste).
  const templates = {
    $comment: "doc",
    morning_metrics: { auto_onboarding: true, default_schedule: "0 8 * * 1-5", default_tz: "Europe/Madrid" },
    daily_pulse: { auto_onboarding: false, default_schedule: "0 9 * * 1-5" },
    performance_analysis_weekly: { auto_onboarding: true, default_schedule: "0 9 * * 1", default_tz: "Europe/Madrid" },
    trust_score_refresh: { auto_onboarding: true, default_schedule: "0 9 1,15 * *", default_tz: "Europe/Madrid" },
  };
  const crons = buildOnboardingCrons(templates);
  assert.deepEqual(
    Object.keys(crons).sort(),
    ["morning_metrics", "performance_analysis_weekly", "trust_score_refresh"],
  );
  assert.ok(crons.trust_score_refresh.enabled);
});
