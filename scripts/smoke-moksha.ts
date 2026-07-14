import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  parseBuilderPaymentMetadata,
  type BuilderPaymentMetadata,
} from "../src/lib/vana/payment";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const FALLBACK_PROFILE_NAME = "LinkedIn profile";
const SAMPLE_PROFILE_NAME = "Alex Rivera";

const EXTERNAL_STATUSES = [
  "pending",
  "approved",
  "ready_for_read",
  "completed",
  "denied",
  "expired",
] as const;
type ExternalStatus = (typeof EXTERNAL_STATUSES)[number];

type FailureBoundary =
  | "request_creation"
  | "approval_or_readiness"
  | "payload_read"
  | "consumer_acknowledgement";

type SmokeFailureRecord = {
  boundary: FailureBoundary;
  owner: string;
  kind: string;
  httpStatus?: number;
};

type SmokeRecord = {
  version: 1;
  startedAt: string;
  finishedAt?: string;
  starterCommit: string;
  sdkVersion: string;
  sdkCommit: string;
  runtime: { env: "production"; network: "moksha" };
  request?: {
    id: string;
    approvalOrigin: string;
    approvalPath: string;
  };
  statuses: Array<{ status: ExternalStatus; observedAt: string }>;
  read?: {
    scope: string;
    mappedFieldNames: string[];
    payloadSha256: string;
    payment: BuilderPaymentMetadata | null;
  };
  finalStatus?: ExternalStatus;
  outcome?: "completed" | "failed";
  firstFailure?: SmokeFailureRecord;
};

class SmokeFailure extends Error {
  constructor(readonly record: SmokeFailureRecord) {
    super(`${record.boundary} failed (${record.kind})`);
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const sdkVersion = await installedSdkVersion();
  const record: SmokeRecord = {
    version: 1,
    startedAt,
    starterCommit: await gitCommit(),
    sdkVersion,
    sdkCommit: await resolveSdkCommit(sdkVersion),
    runtime: { env: "production", network: "moksha" },
    statuses: [],
  };
  const outputDir = resolve(
    process.env.SMOKE_OUTPUT_DIR?.trim() || ".scratch/bui-702/runs",
  );

  try {
    const baseUrl = smokeBaseUrl();
    const timeoutMs = positiveInteger("SMOKE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
    const pollIntervalMs = positiveInteger(
      "SMOKE_POLL_INTERVAL_MS",
      DEFAULT_POLL_INTERVAL_MS,
    );
    const deadline = Date.now() + timeoutMs;

    const created = await requestJson(
      new URL("/api/vana/request?network=moksha", baseUrl),
      { method: "POST" },
      "request_creation",
      "starter request route or Vana Account",
    );
    const requestId = requiredString(created.body, "requestId", "request_creation");
    const approvalUrl = requiredHttpUrl(created.body, "approvalUrl", "request_creation");
    const cookie = requestCookie(created.response);
    if (!cookie) {
      throw new SmokeFailure({
        boundary: "request_creation",
        owner: "starter request-session binding",
        kind: "missing_request_cookie",
      });
    }
    record.request = {
      id: requestId,
      approvalOrigin: approvalUrl.origin,
      approvalPath: approvalUrl.pathname,
    };

    process.stdout.write(`Approve this Moksha request and keep the Vana tab open:\n${approvalUrl.href}\n`);

    await pollUntil(
      async () => status(baseUrl, requestId, cookie, "approval_or_readiness"),
      (value) => value === "approved" || value === "ready_for_read",
      {
        deadline,
        pollIntervalMs,
        record,
        boundary: "approval_or_readiness",
        owner: "Vana approval, delivery, or Personal Server readiness",
      },
    );

    const read = await requestJson(
      requestUrl(baseUrl, "/api/vana/read", requestId),
      { headers: { Cookie: cookie } },
      "payload_read",
      "Personal Server, SDK fee/read path, or starter mapper",
    );
    const scope = requiredString(read.body, "scope", "payload_read");
    const data = read.body.data;
    assertRealLinkedInProfile(scope, data);
    record.read = {
      scope,
      mappedFieldNames: Object.keys(data as Record<string, unknown>).sort(),
      payloadSha256: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
      payment: readPayment(read.body),
    };

    const finalStatus = await pollUntil(
      async () => status(baseUrl, requestId, cookie, "consumer_acknowledgement"),
      (value) => value === "completed",
      {
        deadline,
        pollIntervalMs,
        record,
        boundary: "consumer_acknowledgement",
        owner: "SDK acknowledgement or Vana completion routing",
      },
    );
    record.finalStatus = finalStatus;
    record.outcome = "completed";
    process.stdout.write("Moksha smoke completed: payload read and consumer acknowledgement confirmed.\n");
  } catch (error) {
    const failure =
      error instanceof SmokeFailure
        ? error
        : new SmokeFailure({
            boundary: "request_creation",
            owner: "smoke command configuration or starter availability",
            kind: "smoke_setup_failed",
          });
    record.outcome = "failed";
    record.firstFailure = failure.record;
    process.stderr.write(`Moksha smoke failed: ${failure.message}\n`);
    process.exitCode = 1;
  } finally {
    record.finishedAt = new Date().toISOString();
    await mkdir(outputDir, { recursive: true });
    const file = resolve(outputDir, `${fileTimestamp(record.startedAt)}.json`);
    await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`Redacted run record: ${file}\n`);
  }
}

async function status(
  baseUrl: URL,
  requestId: string,
  cookie: string,
  boundary: Extract<FailureBoundary, "approval_or_readiness" | "consumer_acknowledgement">,
): Promise<ExternalStatus> {
  const owner =
    boundary === "approval_or_readiness"
      ? "Vana approval, delivery, or Personal Server readiness"
      : "SDK acknowledgement or Vana completion routing";
  const result = await requestJson(
    requestUrl(baseUrl, "/api/vana/status", requestId),
    { headers: { Cookie: cookie } },
    boundary,
    owner,
  );
  return requiredStatus(result.body, boundary);
}

async function pollUntil(
  getStatus: () => Promise<ExternalStatus>,
  accepted: (status: ExternalStatus) => boolean,
  options: {
    deadline: number;
    pollIntervalMs: number;
    record: SmokeRecord;
    boundary: Extract<FailureBoundary, "approval_or_readiness" | "consumer_acknowledgement">;
    owner: string;
  },
): Promise<ExternalStatus> {
  while (Date.now() < options.deadline) {
    const current = await getStatus();
    recordStatus(options.record, current);
    if (accepted(current)) return current;
    if (current === "denied" || current === "expired" || current === "completed") {
      throw new SmokeFailure({
        boundary: options.boundary,
        owner: options.owner,
        kind: `terminal_status_${current}`,
      });
    }
    await delay(options.pollIntervalMs);
  }
  throw new SmokeFailure({
    boundary: options.boundary,
    owner: options.owner,
    kind: "timeout",
  });
}

async function requestJson(
  url: URL,
  init: RequestInit,
  boundary: FailureBoundary,
  owner: string,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", redirect: "manual" });
  } catch {
    throw new SmokeFailure({ boundary, owner, kind: "unreachable" });
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const kind = isRecord(body) && typeof body.kind === "string" ? body.kind : "http_error";
    throw new SmokeFailure({
      boundary,
      owner,
      kind,
      httpStatus: response.status,
    });
  }
  if (!isRecord(body)) {
    throw new SmokeFailure({ boundary, owner, kind: "invalid_json_response" });
  }
  return { response, body };
}

function requestUrl(baseUrl: URL, pathname: string, requestId: string): URL {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set("requestId", requestId);
  return url;
}

function requestCookie(response: Response): string | null {
  const setCookie = response.headers.get("set-cookie");
  const pair = setCookie?.split(";", 1)[0]?.trim();
  return pair && pair.includes("=") ? pair : null;
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
  boundary: FailureBoundary,
): string {
  const value = body[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new SmokeFailure({
    boundary,
    owner: "starter API contract",
    kind: `missing_${field}`,
  });
}

function requiredHttpUrl(
  body: Record<string, unknown>,
  field: string,
  boundary: FailureBoundary,
): URL {
  const value = requiredString(body, field, boundary);
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    // Fall through to the sanitized contract failure below.
  }
  throw new SmokeFailure({
    boundary,
    owner: "starter API contract",
    kind: `invalid_${field}`,
  });
}

function assertRealLinkedInProfile(scope: string, data: unknown): asserts data is Record<string, unknown> {
  if (scope !== "linkedin.profile" || !isRecord(data)) {
    throw new SmokeFailure({
      boundary: "payload_read",
      owner: "starter mapper or public LinkedIn contract",
      kind: "unexpected_scope_or_payload",
    });
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name || name === FALLBACK_PROFILE_NAME || name === SAMPLE_PROFILE_NAME) {
    throw new SmokeFailure({
      boundary: "payload_read",
      owner: "starter mapper or public LinkedIn contract",
      kind: "fixture_or_fallback_profile",
    });
  }
}

function requiredStatus(
  body: Record<string, unknown>,
  boundary: Extract<FailureBoundary, "approval_or_readiness" | "consumer_acknowledgement">,
): ExternalStatus {
  const status = requiredString(body, "status", boundary);
  if ((EXTERNAL_STATUSES as readonly string[]).includes(status)) {
    return status as ExternalStatus;
  }
  throw new SmokeFailure({
    boundary,
    owner: "starter status contract",
    kind: "invalid_status",
  });
}

function readPayment(body: Record<string, unknown>): BuilderPaymentMetadata | null {
  if (!Object.hasOwn(body, "payment")) {
    throw new SmokeFailure({
      boundary: "payload_read",
      owner: "starter payment evidence contract",
      kind: "missing_payment_metadata",
    });
  }
  try {
    return parseBuilderPaymentMetadata(body.payment);
  } catch {
    throw new SmokeFailure({
      boundary: "payload_read",
      owner: "starter payment evidence contract",
      kind: "invalid_payment_metadata",
    });
  }
}

function recordStatus(record: SmokeRecord, status: ExternalStatus): void {
  if (record.statuses.at(-1)?.status === status) return;
  record.statuses.push({ status, observedAt: new Date().toISOString() });
}

function smokeBaseUrl(): URL {
  const raw = process.env.SMOKE_BASE_URL?.trim() || process.env.VANA_APP_URL?.trim();
  if (!raw) {
    throw new SmokeFailure({
      boundary: "request_creation",
      owner: "smoke command configuration",
      kind: "missing_base_url",
    });
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return new URL(parsed.origin);
  } catch {
    throw new SmokeFailure({
      boundary: "request_creation",
      owner: "smoke command configuration",
      kind: "invalid_base_url",
    });
  }
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isSafeInteger(value) && value > 0) return value;
  throw new SmokeFailure({
    boundary: "request_creation",
    owner: "smoke command configuration",
    kind: `invalid_${name.toLowerCase()}`,
  });
}

async function gitCommit(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function installedSdkVersion(): Promise<string> {
  try {
    const file = resolve("node_modules/@opendatalabs/vana-sdk/package.json");
    const parsed = JSON.parse(await readFile(file, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

async function resolveSdkCommit(version: string): Promise<string> {
  const supplied = process.env.SMOKE_SDK_COMMIT?.trim();
  if (supplied && /^[a-f0-9]{40}$/i.test(supplied)) return supplied.toLowerCase();
  if (version === "unknown") return "unknown";

  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      resolve("../vana-sdk"),
      "rev-list",
      "-n",
      "1",
      `v${version}`,
    ]);
    const commit = stdout.trim();
    if (/^[a-f0-9]{40}$/i.test(commit)) return commit.toLowerCase();
  } catch {
    // A standalone starter checkout has no sibling SDK repository.
  }

  try {
    const { stdout } = await execFileAsync("git", [
      "ls-remote",
      "--refs",
      "https://github.com/vana-com/vana-sdk.git",
      `refs/tags/v${version}`,
    ]);
    const commit = stdout.trim().split(/\s+/, 1)[0];
    if (commit && /^[a-f0-9]{40}$/i.test(commit)) return commit.toLowerCase();
  } catch {
    // The smoke can still run; the record makes missing provenance explicit.
  }
  return "unknown";
}

function fileTimestamp(iso: string): string {
  return iso.replaceAll(":", "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

await main();
