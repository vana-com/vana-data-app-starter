"use client";

import {
  useDirectVanaConnect,
  type AccessRequest,
  type AccessRequestStatus,
  type ApprovedDataResult,
  type DirectConnectState,
} from "@opendatalabs/vana-sdk/react";
import type { LinkedInSnapshot } from "@/lib/linkedin-profile";
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

  return (
    <main className="page-shell">
      <aside className="connection-panel" aria-live="polite">
        <p className="eyebrow">LinkedIn profile snapshot</p>
        <h2>{stateTitle(state.type, state.type === "awaiting_approval" && state.popupBlocked)}</h2>
        <p className="state-copy">{stateCopy(state)}</p>

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
    case "error": return "Connection interrupted";
    default: return "Your profile, with permission";
  }
}

function stateCopy(state: DirectConnectState<LinkedInSnapshot>): string {
  if (state.type === "awaiting_approval" && state.popupBlocked) {
    return "Open the approval page manually, approve the request, and keep that tab open while this page reads your profile.";
  }
  switch (state.type) {
    case "creating": return "The app is creating a session-bound request for linkedin.profile.";
    case "awaiting_approval": return "Approve the request in the Vana tab and keep it open while your Personal Server is read.";
    case "reading": return "Approval is ready. The server is mapping the profile into this snapshot.";
    case "done": return "This snapshot was mapped from the LinkedIn profile you approved.";
    case "error": return state.error.message;
    default: return "The sample profile is visible now. Connect to replace it with your approved linkedin.profile data.";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
