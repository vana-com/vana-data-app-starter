import type { RequestBinding } from "./binding";

type ConsumeOnceOptions = {
  maxEntries: number;
  now: () => number;
};

type RetainedRead = {
  expiresAt: number;
  read: Promise<unknown>;
  state: "pending" | "succeeded";
};

const MAX_RETAINED_READS = 100;

export function createConsumeOnce(options: ConsumeOnceOptions) {
  const reads = new Map<string, RetainedRead>();

  return function consumeOnce<T>(
    binding: RequestBinding,
    consume: () => Promise<T>,
  ): Promise<T> {
    const now = options.now();
    if (binding.expiresAt <= now) {
      return Promise.reject(new Error("The request binding has expired."));
    }

    for (const [retainedKey, retained] of reads) {
      if (retained.state === "succeeded" && retained.expiresAt <= now) {
        reads.delete(retainedKey);
      }
    }

    const key = bindingKey(binding);
    const existing = reads.get(key);
    if (existing) return existing.read as Promise<T>;
    if (reads.size >= options.maxEntries) {
      return Promise.reject(
        new Error("Approved read coordination is at capacity."),
      );
    }

    const read = Promise.resolve().then(consume);
    const retained: RetainedRead = {
      expiresAt: binding.expiresAt,
      read,
      state: "pending",
    };
    reads.set(key, retained);
    void read.then(
      () => {
        retained.state = "succeeded";
        if (retained.expiresAt <= options.now() && reads.get(key) === retained) {
          reads.delete(key);
        }
      },
      () => {
        if (reads.get(key) === retained) reads.delete(key);
      },
    );
    return read;
  };
}

export const consumeApprovedReadOnce = createConsumeOnce({
  maxEntries: MAX_RETAINED_READS,
  now: Date.now,
});

function bindingKey(binding: RequestBinding): string {
  return JSON.stringify([
    binding.version,
    binding.requestId,
    binding.appId,
    binding.source,
    binding.scope,
    binding.returnOrigin,
    binding.runtime.env,
    binding.runtime.network,
    binding.expiresAt,
  ]);
}
