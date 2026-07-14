import assert from "node:assert/strict";
import { test } from "node:test";
import { consumerStateCopy } from "../src/components/linkedin-profile-copy";

test("keeps builder diagnostics out of consumer error copy", () => {
  const copy = consumerStateCopy("error", false);

  assert.equal(copy, "Your LinkedIn profile is temporarily unavailable. Try again.");
  assert.doesNotMatch(copy, /escrow|fee asset|fund|app identity|payment/i);
});
