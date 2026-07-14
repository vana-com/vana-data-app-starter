import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("package exposes the Moksha smoke command and ignores run evidence", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.["smoke:moksha"],
    "tsx --env-file-if-exists=.env.local scripts/smoke-moksha.ts",
  );
  assert.match(await readFile(".gitignore", "utf8"), /^\.scratch\/$/m);
});

test("smoke:moksha proves the external loop and writes only redacted evidence", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "vana-smoke-moksha-"));
  const cookie = "vana_request_test=private-binding";
  let readCalled = false;
  let statusCalls = 0;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://starter.test");
    response.setHeader("Content-Type", "application/json");

    if (request.method === "POST" && url.pathname === "/api/vana/request") {
      assert.equal(url.searchParams.get("network"), "moksha");
      response.setHeader("Set-Cookie", `${cookie}; Path=/; HttpOnly; SameSite=Lax`);
      response.end(
        JSON.stringify({
          requestId: "dcr_smoke",
          approvalUrl: "https://app.vana.org/data-connection-requests/dcr_smoke?mode=page",
        }),
      );
      return;
    }

    assert.equal(request.headers.cookie, cookie);

    if (request.method === "GET" && url.pathname === "/api/vana/status") {
      assert.equal(url.searchParams.get("requestId"), "dcr_smoke");
      statusCalls += 1;
      response.end(
        JSON.stringify({
          status: readCalled ? "completed" : statusCalls === 1 ? "pending" : "approved",
        }),
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/vana/read") {
      assert.equal(url.searchParams.get("requestId"), "dcr_smoke");
      readCalled = true;
      response.end(
        JSON.stringify({
          scope: "linkedin.profile",
          data: {
            name: "Private Person",
            headline: "Private headline",
            work: [],
            education: [],
            skills: [],
          },
          payment: null,
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await runSmoke({
      SMOKE_BASE_URL: `http://127.0.0.1:${address.port}`,
      SMOKE_OUTPUT_DIR: outputDir,
      SMOKE_POLL_INTERVAL_MS: "1",
      SMOKE_TIMEOUT_MS: "1000",
    });

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /https:\/\/app\.vana\.org\/data-connection-requests\/dcr_smoke/);
    assert.match(result.stdout, /completed/i);
    assert.doesNotMatch(result.stdout, /private-binding|Private Person|Private headline/);

    const files = await readdir(outputDir);
    assert.equal(files.length, 1);
    const rawRecord = await readFile(join(outputDir, files[0]!), "utf8");
    assert.doesNotMatch(rawRecord, /private-binding|Private Person|Private headline/);

    const record = JSON.parse(rawRecord) as {
      outcome: string;
      finalStatus: string;
      sdkCommit: string;
      statuses: Array<{ status: string }>;
      read: {
        scope: string;
        mappedFieldNames: string[];
        payloadSha256: string;
        payment: unknown;
      };
    };
    assert.equal(record.outcome, "completed");
    assert.equal(record.finalStatus, "completed");
    assert.equal(record.sdkCommit, "1111111111111111111111111111111111111111");
    assert.deepEqual(
      record.statuses.map(({ status }) => status),
      ["pending", "approved", "completed"],
    );
    assert.equal(record.read.scope, "linkedin.profile");
    assert.deepEqual(record.read.mappedFieldNames, [
      "education",
      "headline",
      "name",
      "skills",
      "work",
    ]);
    assert.match(record.read.payloadSha256, /^[a-f0-9]{64}$/);
    assert.equal(record.read.payment, null);
    assert.equal("data" in record.read, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("smoke:moksha fails rather than reporting missing payment evidence as free", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "vana-smoke-moksha-payment-"));
  let readCalled = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://starter.test");
    response.setHeader("Content-Type", "application/json");
    if (request.method === "POST" && url.pathname === "/api/vana/request") {
      response.setHeader("Set-Cookie", "vana_request_test=secret; Path=/; HttpOnly");
      response.end(
        JSON.stringify({
          requestId: "dcr_bad_payment",
          approvalUrl: "https://app.vana.org/data-connection-requests/dcr_bad_payment?mode=page",
        }),
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/vana/status") {
      response.end(JSON.stringify({ status: readCalled ? "completed" : "approved" }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/vana/read") {
      readCalled = true;
      response.end(
        JSON.stringify({
          scope: "linkedin.profile",
          data: {
            name: "Private Person",
            headline: "Private headline",
            work: [],
            education: [],
            skills: [],
          },
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ kind: "not_found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await runSmoke({
      SMOKE_BASE_URL: `http://127.0.0.1:${address.port}`,
      SMOKE_OUTPUT_DIR: outputDir,
      SMOKE_POLL_INTERVAL_MS: "1",
      SMOKE_TIMEOUT_MS: "1000",
    });
    assert.equal(result.code, 1);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret|Private Person|Private headline/);

    const [file] = await readdir(outputDir);
    assert.ok(file);
    const record = JSON.parse(await readFile(join(outputDir, file), "utf8")) as {
      outcome: string;
      firstFailure: {
        boundary: string;
        owner: string;
        kind: string;
      };
    };
    assert.equal(record.outcome, "failed");
    assert.deepEqual(record.firstFailure, {
      boundary: "payload_read",
      owner: "starter payment evidence contract",
      kind: "missing_payment_metadata",
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(outputDir, { recursive: true, force: true });
  }
});

function runSmoke(extraEnv: Record<string, string>): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/smoke-moksha.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SMOKE_SDK_COMMIT: "1111111111111111111111111111111111111111",
          ...extraEnv,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
