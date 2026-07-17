import assert from "node:assert/strict";
import test from "node:test";
import { durableEffectPolicyFingerprint } from "@/lib/durable-execution/effect-contract";
import { DurableExecutionRegistry } from "@/lib/durable-execution/registry";
import {
  createPartnershipsPrepareAssignmentEffectV2,
  createPartnershipsPrepareAssignmentEffectV2LegacyV3,
  createPartnershipsYalcAssignEffectV2,
  createPartnershipsYalcAssignEffectV2LegacyV3,
} from "../discovery-effects-v2";
import {
  createPartnershipsDiscoveryHandlerV2,
  createPartnershipsDiscoveryHandlerV2LegacyV3,
  partnershipsDiscoveryEffectPolicyV2,
  partnershipsDiscoveryEffectPolicyV2LegacyV3,
} from "../discovery-handler-v2";

const LEGACY_EXECUTION_FINGERPRINT =
  "18ada802be26ed7a3c2d86c341ecc041985501c2f107e84965905432eb3875e2";
const LEGACY_PREPARE_FINGERPRINT =
  "6d319fa9e23627fd4395aebe45de1cb31ef238848195c22a0493997355b7b9aa";
const LEGACY_ASSIGN_FINGERPRINT =
  "cf2b3318ee342a12b9e2a8dd9551ff0fcc6078002829dacd9e63e80752487125";

test("legacy v3 fingerprints remain frozen for recovery and cancellation", () => {
  const registry = new DurableExecutionRegistry().register(
    createPartnershipsDiscoveryHandlerV2LegacyV3(),
  );

  assert.equal(
    registry.executionPolicyFingerprint("partnerships.discovery", 3),
    LEGACY_EXECUTION_FINGERPRINT,
  );
  assert.equal(
    durableEffectPolicyFingerprint(
      partnershipsDiscoveryEffectPolicyV2LegacyV3[
        "provider.prepare_assignment"
      ],
    ),
    LEGACY_PREPARE_FINGERPRINT,
  );
  assert.equal(
    durableEffectPolicyFingerprint(
      partnershipsDiscoveryEffectPolicyV2LegacyV3["yalc.assign_leads"],
    ),
    LEGACY_ASSIGN_FINGERPRINT,
  );
});

test("current v4 permits one durable invocation and matches runtime bindings", () => {
  const currentPrepare = createPartnershipsPrepareAssignmentEffectV2();
  const currentAssign = createPartnershipsYalcAssignEffectV2();
  const legacyPrepare = createPartnershipsPrepareAssignmentEffectV2LegacyV3();
  const legacyAssign = createPartnershipsYalcAssignEffectV2LegacyV3();

  assert.equal(createPartnershipsDiscoveryHandlerV2().version, 4);
  assert.equal(createPartnershipsDiscoveryHandlerV2LegacyV3().version, 3);
  assert.equal(currentPrepare.retry.maxAttempts, 1);
  assert.equal(currentAssign.retry.maxAttempts, 1);
  assert.equal(legacyPrepare.retry.maxAttempts, 3);
  assert.equal(legacyAssign.retry.maxAttempts, 3);

  assert.equal(
    durableEffectPolicyFingerprint(currentPrepare),
    durableEffectPolicyFingerprint(
      partnershipsDiscoveryEffectPolicyV2["provider.prepare_assignment"],
    ),
  );
  assert.equal(
    durableEffectPolicyFingerprint(currentAssign),
    durableEffectPolicyFingerprint(
      partnershipsDiscoveryEffectPolicyV2["yalc.assign_leads"],
    ),
  );
  assert.equal(
    durableEffectPolicyFingerprint(legacyPrepare),
    LEGACY_PREPARE_FINGERPRINT,
  );
  assert.equal(
    durableEffectPolicyFingerprint(legacyAssign),
    LEGACY_ASSIGN_FINGERPRINT,
  );
});
