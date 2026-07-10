"use client";

import {
  useDirectVanaConnect,
  type AccessRequest,
  type AccessRequestStatus,
  type ApprovedDataResult,
} from "@opendatalabs/vana-sdk/react";
import type { LinkedInSnapshot } from "@/lib/linkedin-profile";
import { consumerStateCopy } from "./linkedin-profile-copy";
import { ProfileSnapshot } from "./ProfileSnapshot";

type ErrorBody = { error?: unknown };

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const candidate = isRecord(body) ? (body as ErrorBody).error : undefined;
    const message = typeof candidate === "string" ? candidate : "The Vana request failed.";
    throw new Error(message);
  }
  return body as T;
}

function requestPath(): string {
  const input = new URLSearchParams(window.location.search);
  const launch = new URLSearchParams();
  for (const key of ["vana_env", "network"]) {
    for (const value of input.getAll(key)) launch.append(key, value);
  }
  const query = launch.toString();
  return query ? `/api/vana/request?${query}` : "/api/vana/request";
}

export function LinkedInProfileApp({ sample }: { sample: LinkedInSnapshot }) {
  const connect = useDirectVanaConnect<LinkedInSnapshot>({
    createRequest: () => jsonFetch<AccessRequest>(requestPath(), { method: "POST" }),
    getStatus: (requestId) =>
      jsonFetch<AccessRequestStatus>(`/api/vana/status?requestId=${encodeURIComponent(requestId)}`),
    readResult: (requestId) =>
      jsonFetch<ApprovedDataResult<LinkedInSnapshot>>(`/api/vana/read?requestId=${encodeURIComponent(requestId)}`),
  });
  const { state } = connect;
  const profile = state.type === "done" ? state.result.data : sample;
  const isLive = state.type === "done";
  const approvalTabBlocked = state.type === "awaiting_approval" && state.popupBlocked;

  return (
    <main className="page-shell">
      <aside className="connection-panel" aria-live="polite">
        <p className="eyebrow">LinkedIn profile snapshot</p>
        <h2>{stateTitle(state.type, approvalTabBlocked)}</h2>
        <p className="state-copy">{consumerStateCopy(state.type, approvalTabBlocked)}</p>

        {state.type === "awaiting_approval" && state.popupBlocked ? (
          <a className="secondary-action" href={state.request.approvalUrl} target="_blank" rel="noreferrer">
            Open approval
          </a>
        ) : null}

        {state.type === "idle" ? (
          <button className="primary-action" type="button" onClick={() => void connect.start()}>
            Connect LinkedIn
          </button>
        ) : null}

        {state.type === "creating" || state.type === "awaiting_approval" || state.type === "reading" ? (
          <button className="primary-action" type="button" disabled>
            {state.type === "reading" ? "Reading profile..." : "Waiting..."}
          </button>
        ) : null}

        {state.type === "error" ? (
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              connect.reset();
              void connect.start();
            }}
          >
            Try again
          </button>
        ) : null}

        {state.type === "done" ? (
          <button className="secondary-action button-link" type="button" onClick={connect.reset}>
            Show sample profile
          </button>
        ) : null}

        <p className={`mode-label ${isLive ? "live" : "sample"}`}>
          {isLive ? "Approved profile" : "Sample fixture"}
        </p>
      </aside>

      <ProfileSnapshot profile={profile} />
    </main>
  );
}

function stateTitle(type: string, popupBlocked: boolean): string {
  if (popupBlocked) return "Approval window blocked";
  switch (type) {
    case "creating": return "Creating a request";
    case "awaiting_approval": return "Waiting for approval";
    case "reading": return "Reading approved data";
    case "done": return "Profile ready";
    case "error": return "Could not load your profile";
    default: return "Your profile, with permission";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
