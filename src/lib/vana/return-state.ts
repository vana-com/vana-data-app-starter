import type { AccessRequestStatusValue } from "@opendatalabs/vana-sdk/server";

export type ReturnState = {
  title: string;
  message: string;
  kind: "success" | "waiting" | "error";
};

export function returnStateForStatus(status: AccessRequestStatusValue): ReturnState {
  switch (status) {
    case "completed":
      return {
        title: "Profile read complete",
        message: "The authoritative request status is complete. You can return to the profile tab.",
        kind: "success",
      };
    case "approved":
    case "ready_for_read":
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
        title: "Request not completed",
        message: "No approved profile was made available. Return to the profile tab and retry after the platform is ready.",
        kind: "error",
      };
    case "expired":
      return {
        title: "Request expired",
        message: "The authoritative request status is expired. Return to the profile tab to start a new request.",
        kind: "error",
      };
  }
}
