import assert from "node:assert/strict";
import test from "node:test";

import {
  PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_DEFAULT,
  PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_MAX,
  PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS,
  PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS_DEFAULT,
  PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS,
  PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS,
  PartnershipsDiscoveryRuntimeContractError,
  resolvePartnershipsDiscoveryRuntimeContract,
} from "../discovery-runtime-contract";

function expectReason(
  env: Parameters<typeof resolvePartnershipsDiscoveryRuntimeContract>[0],
  reason: PartnershipsDiscoveryRuntimeContractError["reason"],
): void {
  assert.throws(
    () => resolvePartnershipsDiscoveryRuntimeContract(env),
    (error: unknown) =>
      error instanceof PartnershipsDiscoveryRuntimeContractError &&
      error.reason === reason &&
      error.code === "partnerships_discovery_runtime_contract_invalid",
  );
}

test("defaults preserve both timeout margins and the sequential effect budget", () => {
  const contract = resolvePartnershipsDiscoveryRuntimeContract({});

  assert.deepEqual(contract, {
    liveDiscoveryTimeoutMs: PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS_DEFAULT,
    prepareEffectTimeoutMs: PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS,
    yalcAssignEffectTimeoutMs: PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS,
    effectTimeoutBudgetMs:
      PARTNERSHIPS_PREPARE_EFFECT_TIMEOUT_MS +
      PARTNERSHIPS_YALC_ASSIGN_EFFECT_TIMEOUT_MS,
    handlerTimeoutMs: PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_DEFAULT,
    minimumMarginMs: PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS,
  });
  assert.equal(
    contract.prepareEffectTimeoutMs - contract.liveDiscoveryTimeoutMs,
    PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS,
  );
  assert.equal(
    contract.handlerTimeoutMs - contract.effectTimeoutBudgetMs,
    PARTNERSHIPS_DISCOVERY_TIMEOUT_MIN_MARGIN_MS,
  );
  assert.equal(Object.isFrozen(contract), true);
});

test("strict overrides may only widen the timeout margins", () => {
  const contract = resolvePartnershipsDiscoveryRuntimeContract({
    PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS: "240000",
    PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS: "420000",
  });

  assert.equal(contract.liveDiscoveryTimeoutMs, 240_000);
  assert.equal(contract.handlerTimeoutMs, 420_000);
});

test("live timeout accepts only an exact integer with the minimum margin", () => {
  for (const value of ["", " 240000", "240000 ", "240000.0", "2.4e5", "999"]) {
    expectReason(
      { PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS: value },
      "live_timeout_invalid",
    );
  }
  expectReason(
    { PARTNERSHIPS_LIVE_DISCOVERY_TIMEOUT_MS: "270001" },
    "live_timeout_margin_too_small",
  );
});

test("handler timeout accepts only an exact bounded integer beyond both effects", () => {
  for (const value of ["", " 360000", "360000 ", "360000.0", "3.6e5", "999"]) {
    expectReason(
      { PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS: value },
      "handler_timeout_invalid",
    );
  }
  expectReason(
    { PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS: "359999" },
    "handler_timeout_margin_too_small",
  );
  expectReason(
    {
      PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS: String(
        PARTNERSHIPS_DISCOVERY_HANDLER_TIMEOUT_MS_MAX + 1,
      ),
    },
    "handler_timeout_invalid",
  );
});
