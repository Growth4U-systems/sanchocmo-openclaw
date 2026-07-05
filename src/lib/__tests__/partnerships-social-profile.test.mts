import assert from "node:assert/strict";
import { test } from "node:test";

import * as mod from "../partnerships/social-profile";

const { buildSocialProfileUrl } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("buildSocialProfileUrl uses explicit profileUrl when present", () => {
  assert.equal(
    buildSocialProfileUrl({
      handle: "@juanmerodio",
      network: "instagram",
      profileUrl: "instagram.com/juanmerodio/",
    }),
    "https://instagram.com/juanmerodio/",
  );
});

test("buildSocialProfileUrl derives Instagram profile from network and handle", () => {
  assert.equal(
    buildSocialProfileUrl({
      handle: "@juanmerodio",
      network: "instagram",
    }),
    "https://www.instagram.com/juanmerodio/",
  );
});

test("buildSocialProfileUrl derives TikTok and YouTube handles", () => {
  assert.equal(
    buildSocialProfileUrl({ handle: "@creator", network: "tiktok" }),
    "https://www.tiktok.com/@creator",
  );
  assert.equal(
    buildSocialProfileUrl({ handle: "@creator", network: "youtube" }),
    "https://www.youtube.com/@creator",
  );
});
