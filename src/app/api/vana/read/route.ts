import { mapLinkedInProfile } from "@/lib/linkedin-profile";
import { assertLinkedInReadReady } from "@/lib/vana/capability";
import { consumeApprovedReadOnce } from "@/lib/vana/consume-once";
import { mapClientError } from "@/lib/vana/errors";
import { getBoundVanaRequest, requestIdFromUrl } from "@/lib/vana/request";
import { jsonNoStore } from "@/lib/vana/response";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = requestIdFromUrl(request.url);
  if (!requestId) {
    return jsonNoStore(
      { kind: "invalid_request", error: "A single requestId is required." },
      { status: 400 },
    );
  }

  try {
    const bound = getBoundVanaRequest(request, requestId);
    if (!bound) {
      return jsonNoStore(
        { kind: "unavailable", error: "This request is not available in this browser session." },
        { status: 403 },
      );
    }

    const result = await consumeApprovedReadOnce(bound.binding, async () => {
      const status = await bound.controller.getAccessRequestStatus(requestId);
      assertLinkedInReadReady(status);
      return bound.controller.readApprovedData({ requestId });
    });
    return jsonNoStore({
      scope: result.scope,
      data: mapLinkedInProfile(result.data),
    });
  } catch (error) {
    const clientError = mapClientError(error);
    console.error(`[vana/read] Read failed for ${requestId}`, error);
    return jsonNoStore(
      { kind: clientError.kind, error: clientError.error },
      { status: clientError.status },
    );
  }
}
