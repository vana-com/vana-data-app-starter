import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AccessNotApprovedError,
  PaymentRequiredError,
  PersonalServerReadError,
} from "@opendatalabs/vana-sdk/server";
import { LINKEDIN_PROFILE_FIXTURE } from "../src/data/linkedin-profile.fixture";
import { mapLinkedInProfile } from "../src/lib/linkedin-profile";
import { resolveAppUrl } from "../src/lib/vana/app-url";
import {
  createRequestBinding,
  readRequestBinding,
  requestBindingCookieName,
  setRequestBindingCookie,
} from "../src/lib/vana/binding";
import { assertLinkedInReadReady } from "../src/lib/vana/capability";
import { mapClientError } from "../src/lib/vana/errors";
import { jsonNoStore } from "../src/lib/vana/response";
import { resolveLaunchRuntime } from "../src/lib/vana/runtime";

const SECRET = `0x${"1".repeat(64)}`;
const ORIGIN = "https://snapshot.example";

test("maps the sample linkedin.profile fixture", () => {
  const snapshot = mapLinkedInProfile(LINKEDIN_PROFILE_FIXTURE);
  assert.equal(snapshot.name, "Alex Rivera");
  assert.equal(snapshot.headline, "Product engineer building useful data tools");
  assert.deepEqual(snapshot.work[0], {
    title: "Staff Product Engineer",
    company: "Northwind Labs",
    period: "2022-04 - Present",
  });
  assert.deepEqual(snapshot.education[0], {
    school: "University of Melbourne",
    degree: "Bachelor of Science, Computing",
    period: "2012 - 2015",
  });
  assert.deepEqual(snapshot.skills, [
    "TypeScript",
    "Product engineering",
    "Data systems",
    "Design systems",
  ]);
});

test("maps sparse variants and safely ignores malformed profile fields", () => {
  const snapshot = mapLinkedInProfile({
    result: {
      first_name: "Grace",
      last_name: "Hopper",
      occupation: "Computer scientist",
      positions: [null, { role: "Admiral", organization: { name: "US Navy" }, start: 1943 }],
      educations: ["bad", { institution: "Yale", degree_name: "PhD" }],
      skills: [null, 7, { title: "Compilers" }, " COBOL "],
    },
  });
  assert.equal(snapshot.name, "Grace Hopper");
  assert.deepEqual(snapshot.work, [{ title: "Admiral", company: "US Navy", period: "1943" }]);
  assert.deepEqual(snapshot.education, [{ school: "Yale", degree: "PhD", period: "" }]);
  assert.deepEqual(snapshot.skills, ["Compilers", "COBOL"]);

  for (const value of [null, undefined, 42, "bad", [], {}, { data: { result: null } }]) {
    assert.deepEqual(mapLinkedInProfile(value), {
      name: "LinkedIn profile",
      headline: "",
      work: [],
      education: [],
      skills: [],
    });
  }
});

test("strictly validates and resolves launch runtime", () => {
  assert.deepEqual(resolveLaunchRuntime(new URLSearchParams()), {
    env: "production",
    network: "mainnet",
  });
  assert.deepEqual(resolveLaunchRuntime(new URLSearchParams("network=moksha")), {
    env: "production",
    network: "moksha",
  });
  assert.deepEqual(resolveLaunchRuntime(new URLSearchParams("vana_env=dev")), {
    env: "dev",
    network: "moksha",
  });
  assert.throws(() => resolveLaunchRuntime(new URLSearchParams("vana_env=production")), /Invalid vana_env/);
  assert.throws(() => resolveLaunchRuntime(new URLSearchParams("network=testnet")), /Invalid network/);
  assert.throws(() => resolveLaunchRuntime(new URLSearchParams("vana_env=dev&network=mainnet")), /only supports/);
  assert.throws(() => resolveLaunchRuntime(new URLSearchParams("network=moksha&network=mainnet")), /only be provided once/);
});

test("derives a fixed return URL from VANA_APP_URL origin", () => {
  assert.deepEqual(resolveAppUrl("https://snapshot.example/some/path?caller=ignored"), {
    appUrl: "https://snapshot.example/some/path?caller=ignored",
    returnOrigin: ORIGIN,
    returnUrl: `${ORIGIN}/connect/return`,
  });
  assert.throws(() => resolveAppUrl("javascript:alert(1)"), /HTTP or HTTPS/);
});

test("keeps concurrent request bindings independent and rejects tampering", () => {
  const now = 1_000;
  const runtime = { env: "dev", network: "moksha" } as const;
  const cookies = new Map<string, { value: string; options: Record<string, unknown> }>();
  const writer = {
    set(name: string, value: string, options: Record<string, unknown>) {
      cookies.set(name, { value, options });
    },
  };
  const reader = {
    get(name: string) {
      const cookie = cookies.get(name);
      return cookie ? { value: cookie.value } : undefined;
    },
  };

  for (const requestId of ["dcr_one", "dcr_two"]) {
    const binding = createRequestBinding({ requestId, runtime, returnOrigin: ORIGIN, now }, SECRET);
    setRequestBindingCookie(writer, requestId, binding, true);
  }

  assert.equal(cookies.size, 2);
  assert.deepEqual(cookies.get(requestBindingCookieName("dcr_one"))?.options, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
  assert.equal(readRequestBinding(reader, { requestId: "dcr_one", returnOrigin: ORIGIN, now: now + 1 }, SECRET)?.runtime.env, "dev");
  assert.equal(readRequestBinding(reader, { requestId: "dcr_two", returnOrigin: ORIGIN, now: now + 1 }, SECRET)?.runtime.network, "moksha");
  assert.equal(readRequestBinding(reader, { requestId: "dcr_missing", returnOrigin: ORIGIN, now: now + 1 }, SECRET), null);
  assert.equal(readRequestBinding(reader, { requestId: "dcr_one", returnOrigin: "https://evil.example", now: now + 1 }, SECRET), null);
  assert.equal(readRequestBinding(reader, { requestId: "dcr_one", returnOrigin: ORIGIN, now: now + 1 }, `${SECRET}bad`), null);

  const cookieName = requestBindingCookieName("dcr_one");
  const original = cookies.get(cookieName);
  assert.ok(original);
  cookies.set(cookieName, { ...original, value: `${original.value.slice(0, -1)}x` });
  assert.equal(readRequestBinding(reader, { requestId: "dcr_one", returnOrigin: ORIGIN, now: now + 1 }, SECRET), null);

  cookies.set(cookieName, original);
  assert.equal(readRequestBinding(reader, { requestId: "dcr_one", returnOrigin: ORIGIN, now: now + 11 * 60 * 1000 }, SECRET), null);
});

test("blocks reads until the requested linkedin.profile capability is ready", () => {
  assert.doesNotThrow(() => assertLinkedInReadReady({ status: "ready_for_read", scope: "linkedin.profile" }));
  assert.throws(() => assertLinkedInReadReady({ status: "pending" }), AccessNotApprovedError);
  assert.throws(() => assertLinkedInReadReady({ status: "approved", scope: "linkedin.skills" }), AccessNotApprovedError);
});

test("maps SDK and unknown failures to sanitized client errors", () => {
  assert.deepEqual(mapClientError(new PaymentRequiredError("private payment detail", { secret: true })), {
    kind: "payment_required",
    error: "We couldn't load your profile right now. Please try again shortly.",
    status: 402,
  });
  assert.deepEqual(mapClientError(new AccessNotApprovedError("private status detail")), {
    kind: "not_ready",
    error: "The approved LinkedIn profile is not ready to read.",
    status: 409,
  });
  assert.deepEqual(mapClientError(new PersonalServerReadError("private upstream detail", 502)), {
    kind: "unavailable",
    error: "The Personal Server is temporarily unavailable.",
    status: 503,
  });
  assert.deepEqual(mapClientError(new Error("private internal detail")), {
    kind: "failed",
    error: "The Vana request failed.",
    status: 500,
  });
});

test("marks JSON responses as non-cacheable", async () => {
  const response = jsonNoStore(
    { error: "Sanitized failure" },
    { status: 503, headers: { "Cache-Control": "public, max-age=60" } },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Sanitized failure" });
});
