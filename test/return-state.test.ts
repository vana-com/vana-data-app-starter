import assert from "node:assert/strict";
import { test } from "node:test";
import { returnStateForStatus } from "../src/lib/vana/return-state";

test("maps denied requests to a neutral incomplete state", () => {
  assert.deepEqual(returnStateForStatus("denied"), {
    title: "Request not completed",
    message: "No approved profile was made available. Return to the profile tab and retry after the platform is ready.",
    kind: "error",
  });
});
