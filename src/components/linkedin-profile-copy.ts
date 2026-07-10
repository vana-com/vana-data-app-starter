export type ConsumerConnectStateType =
  | "idle"
  | "creating"
  | "awaiting_approval"
  | "reading"
  | "done"
  | "error";

export function consumerStateCopy(
  type: ConsumerConnectStateType,
  approvalTabBlocked: boolean,
): string {
  if (type === "awaiting_approval" && approvalTabBlocked) {
    return "Open the approval page manually, approve the request, and keep that tab open while this page reads your profile.";
  }

  switch (type) {
    case "creating":
      return "The app is creating a session-bound request for linkedin.profile.";
    case "awaiting_approval":
      return "Approve the request in the Vana tab and keep it open while your Personal Server is read.";
    case "reading":
      return "Approval is ready. The server is mapping the profile into this snapshot.";
    case "done":
      return "This snapshot was mapped from the LinkedIn profile you approved.";
    case "error":
      return "Your LinkedIn profile is temporarily unavailable. Try again.";
    default:
      return "The sample profile is visible now. Connect to replace it with your approved linkedin.profile data.";
  }
}
