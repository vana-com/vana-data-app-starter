import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

type RegistryFile = {
  path: string;
  type: string;
  target?: string;
};

type RegistryManifest = {
  $schema: string;
  items: Array<{
    name: string;
    type: string;
    dependencies?: string[];
    devDependencies?: string[];
    envVars?: Record<string, string>;
    files: RegistryFile[];
  }>;
};

const expectedPaths = [
  "src/lib/vana/app-url.ts",
  "src/lib/vana/binding.ts",
  "src/lib/vana/capability.ts",
  "src/lib/vana/constants.ts",
  "src/lib/vana/errors.ts",
  "src/lib/vana/request.ts",
  "src/lib/vana/response.ts",
  "src/lib/vana/return-state.ts",
  "src/lib/vana/runtime.ts",
  "src/lib/vana/server.ts",
  "src/lib/linkedin-profile.ts",
  "src/data/linkedin-profile.fixture.ts",
  "src/app/api/vana/request/route.ts",
  "src/app/api/vana/status/route.ts",
  "src/app/api/vana/read/route.ts",
  "src/app/connect/return/page.tsx",
  "test/contract.test.ts",
];

test("registry exposes only the complete Direct LinkedIn reference", () => {
  const root = process.cwd();
  const manifest = JSON.parse(
    readFileSync(resolve(root, "registry.json"), "utf8"),
  ) as RegistryManifest;

  assert.equal(manifest.$schema, "https://ui.shadcn.com/schema/registry.json");
  assert.equal(manifest.items.length, 1);

  const item = manifest.items[0];
  assert.ok(item);
  assert.equal(item.name, "direct-vana-linkedin-next");
  assert.equal(item.type, "registry:item");
  assert.deepEqual(item.dependencies, [
    "@opendatalabs/vana-sdk@3.13.4",
    "server-only@0.0.1",
  ]);
  assert.deepEqual(item.devDependencies, ["tsx@^4.21.0"]);
  assert.equal(item.envVars, undefined);
  assert.deepEqual(
    item.files.map((file) => file.path),
    expectedPaths,
  );

  for (const file of item.files) {
    assert.equal(file.type, "registry:file");
    assert.equal(file.target, `~/${file.path}`);
    assert.doesNotThrow(() => readFileSync(resolve(root, file.path)));
  }
});
