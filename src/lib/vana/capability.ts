import {
  AccessNotApprovedError,
  type AccessRequestStatus,
} from "@opendatalabs/vana-sdk/server";
import { VANA_APP } from "./constants";

export function assertLinkedInReadReady(status: AccessRequestStatus): void {
  if (
    (status.status !== "approved" && status.status !== "ready_for_read") ||
    status.scope !== VANA_APP.scope
  ) {
    throw new AccessNotApprovedError("LinkedIn profile capability is not ready.");
  }
}
