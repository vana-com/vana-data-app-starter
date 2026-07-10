import "server-only";

import { createDirectDataController } from "@opendatalabs/vana-sdk/server";
import { resolveAppUrl } from "./app-url";
import { VANA_APP } from "./constants";
import type { VanaRuntime } from "./runtime";

type Controller = ReturnType<typeof createDirectDataController>;

const controllers = new Map<string, Controller>();

export type VanaServerConfig = {
  appPrivateKey: string;
  appUrl: string;
  returnOrigin: string;
  returnUrl: string;
};

export function getVanaServerConfig(): VanaServerConfig {
  const appPrivateKey = process.env.VANA_APP_PRIVATE_KEY?.trim();
  const rawAppUrl = process.env.VANA_APP_URL?.trim();

  if (!appPrivateKey) throw new Error("Missing VANA_APP_PRIVATE_KEY.");
  if (!rawAppUrl) throw new Error("Missing VANA_APP_URL.");

  const resolvedUrl = resolveAppUrl(rawAppUrl);
  return {
    appPrivateKey,
    ...resolvedUrl,
  };
}

export function getVanaController(runtime: VanaRuntime, config = getVanaServerConfig()): Controller {
  const key = `${runtime.env}:${runtime.network}`;
  const cached = controllers.get(key);
  if (cached) return cached;

  // SDK 3.13.4 keeps production app/API endpoints for production+moksha while
  // deriving Moksha's escrow chain defaults from `network`. Do not hardcode a
  // gateway here: that would turn an SDK-owned endpoint decision into app drift.
  const controller = createDirectDataController({
    env: runtime.env,
    network: runtime.network,
    appPrivateKey: config.appPrivateKey,
    app: {
      id: VANA_APP.id,
      name: VANA_APP.name,
      homepageUrl: config.appUrl,
    },
    source: VANA_APP.source,
    scopes: [VANA_APP.scope],
  });
  controllers.set(key, controller);
  return controller;
}
