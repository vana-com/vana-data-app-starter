import assert from "node:assert/strict";
import { test } from "node:test";
import type { RequestBinding } from "../src/lib/vana/binding";
import { createConsumeOnce } from "../src/lib/vana/consume-once";

const binding = (requestId: string, expiresAt = 10_000): RequestBinding => ({
  version: 1,
  requestId,
  appId: "linkedin-profile-snapshot",
  source: "linkedin",
  scope: "linkedin.profile",
  returnOrigin: "https://snapshot.example",
  runtime: { env: "production", network: "moksha" },
  expiresAt,
});

test("overlapping calls for one bound request share one consume attempt", async () => {
  const consumeOnce = createConsumeOnce({ maxEntries: 4, now: () => 1_000 });
  let consumeCalls = 0;
  let release!: (value: { scope: string; data: unknown }) => void;
  const pending = new Promise<{ scope: string; data: unknown }>((resolve) => {
    release = resolve;
  });
  const consume = () => {
    consumeCalls += 1;
    return pending;
  };

  const first = consumeOnce(binding("dcr_overlap"), consume);
  const second = consumeOnce(binding("dcr_overlap"), consume);
  release({ scope: "linkedin.profile", data: { first_name: "Alex" } });

  assert.deepEqual(await first, await second);
  assert.equal(consumeCalls, 1);
});

test("later calls reuse a successful raw read even if result mapping fails", async () => {
  const consumeOnce = createConsumeOnce({ maxEntries: 4, now: () => 1_000 });
  let consumeCalls = 0;
  const consume = async () => {
    consumeCalls += 1;
    return { scope: "linkedin.profile", data: { first_name: "Alex" } };
  };

  const accepted = await consumeOnce(binding("dcr_repeat"), consume);
  const mapResult = (result: typeof accepted, fail: boolean) => {
    if (fail) throw new Error(`Could not map ${result.scope}`);
    return { name: (result.data as { first_name: string }).first_name };
  };
  assert.throws(() => mapResult(accepted, true), /Could not map/);

  const repeated = await consumeOnce(binding("dcr_repeat"), consume);
  assert.deepEqual(mapResult(repeated, false), { name: "Alex" });
  assert.equal(consumeCalls, 1);
});

test("an expired binding cannot start a consume attempt", async () => {
  const consumeOnce = createConsumeOnce({ maxEntries: 4, now: () => 2_000 });
  let consumeCalls = 0;

  await assert.rejects(
    consumeOnce(binding("dcr_expired", 2_000), async () => {
      consumeCalls += 1;
      return "unreachable";
    }),
    /expired/i,
  );
  assert.equal(consumeCalls, 0);
});

test("a failed consume attempt is removed so the request can retry", async () => {
  const consumeOnce = createConsumeOnce({ maxEntries: 4, now: () => 1_000 });
  let consumeCalls = 0;
  const consume = async () => {
    consumeCalls += 1;
    if (consumeCalls === 1) throw new Error("Personal Server unavailable");
    return { scope: "linkedin.profile", data: { first_name: "Alex" } };
  };

  await assert.rejects(
    consumeOnce(binding("dcr_retry"), consume),
    /Personal Server unavailable/,
  );
  assert.deepEqual(await consumeOnce(binding("dcr_retry"), consume), {
    scope: "linkedin.profile",
    data: { first_name: "Alex" },
  });
  assert.equal(consumeCalls, 2);
});

test("capacity never evicts live work and expired successes release their slot", async () => {
  let now = 1_000;
  const consumeOnce = createConsumeOnce({ maxEntries: 1, now: () => now });
  let firstCalls = 0;
  let secondCalls = 0;
  let releaseFirst!: (value: string) => void;
  const firstPending = new Promise<string>((resolve) => {
    releaseFirst = resolve;
  });

  const first = consumeOnce(binding("dcr_first", 2_000), () => {
    firstCalls += 1;
    return firstPending;
  });
  await assert.rejects(
    consumeOnce(binding("dcr_second", 3_000), async () => {
      secondCalls += 1;
      return "second";
    }),
    /capacity/i,
  );
  assert.equal(secondCalls, 0);

  releaseFirst("first");
  assert.equal(await first, "first");
  await assert.rejects(
    consumeOnce(binding("dcr_second", 3_000), async () => {
      secondCalls += 1;
      return "second";
    }),
    /capacity/i,
  );
  assert.equal(
    await consumeOnce(binding("dcr_first", 2_000), async () => "duplicate"),
    "first",
  );
  assert.equal(firstCalls, 1);

  now = 2_001;
  assert.equal(
    await consumeOnce(binding("dcr_second", 3_000), async () => {
      secondCalls += 1;
      return "second";
    }),
    "second",
  );
  assert.equal(secondCalls, 1);
});
