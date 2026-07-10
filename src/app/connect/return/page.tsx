import { readRequestBinding } from "@/lib/vana/binding";
import { assertLinkedInReadReady } from "@/lib/vana/capability";
import { getVanaController, getVanaServerConfig } from "@/lib/vana/server";
import { cookies } from "next/headers";

type ReturnState = {
  title: string;
  message: string;
  kind: "success" | "waiting" | "error";
};

export default async function ConnectReturn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestId = typeof params.request_id === "string" ? params.request_id : null;
  const state = await authoritativeReturnState(requestId);

  return (
    <main className="return-shell">
      <p className={`mode-label ${state.kind}`}>Verified request status</p>
      <h1>{state.title}</h1>
      <p>{state.message}</p>
      <a className="primary-action return-action" href="/">Return to profile snapshot</a>
    </main>
  );
}

async function authoritativeReturnState(requestId: string | null): Promise<ReturnState> {
  if (!requestId || requestId.length > 256) return invalidReturn();

  try {
    const config = getVanaServerConfig();
    const binding = readRequestBinding(
      await cookies(),
      { requestId, returnOrigin: config.returnOrigin },
      config.appPrivateKey,
    );
    if (!binding) return invalidReturn();

    const status = await getVanaController(binding.runtime, config).getAccessRequestStatus(requestId);
    switch (status.status) {
      case "completed":
        return {
          title: "Profile read complete",
          message: "The authoritative request status is complete. You can return to the profile tab.",
          kind: "success",
        };
      case "approved":
      case "ready_for_read":
        assertLinkedInReadReady(status);
        return {
          title: "Profile approved",
          message: "The request is ready. Keep this tab open while the original tab finishes the approved read.",
          kind: "waiting",
        };
      case "pending":
        return {
          title: "Approval still pending",
          message: "The request has not reached a read-ready state yet.",
          kind: "waiting",
        };
      case "denied":
        return {
          title: "Request declined",
          message: "The authoritative request status is declined. Return to the profile tab to try again.",
          kind: "error",
        };
      case "expired":
        return {
          title: "Request expired",
          message: "The authoritative request status is expired. Return to the profile tab to start a new request.",
          kind: "error",
        };
    }
  } catch (error) {
    console.error(`[vana/return] Return verification failed for ${requestId}`, error);
    return {
      title: "Status unavailable",
      message: "The request status could not be verified. Return to the profile tab to try again.",
      kind: "error",
    };
  }
}

function invalidReturn(): ReturnState {
  return {
    title: "Request unavailable",
    message: "This return does not match a request from the current browser session.",
    kind: "error",
  };
}
