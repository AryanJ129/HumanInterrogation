import { NextRequest, NextResponse } from "next/server";
import {
  describeVeoError,
  extractVideoUri,
  GEMINI_API_HOST,
  type StatusResponseBody,
  type VeoOperation,
} from "@/lib/veo";

// Operation names look like: models/<model-id>/operations/<id>
const OPERATION_NAME_PATTERN = /^models\/[A-Za-z0-9._-]+\/operations\/[A-Za-z0-9._-]+$/;

// One-shot poll via REST. The SDK's operation object doesn't survive
// between stateless invocations, so we hit the operations endpoint directly.
export async function GET(
  req: NextRequest
): Promise<NextResponse<StatusResponseBody>> {
  const op = req.nextUrl.searchParams.get("op");
  if (!op || !OPERATION_NAME_PATTERN.test(op)) {
    return NextResponse.json(
      { done: false, error: "Missing or malformed operation name." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { done: false, error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let operation: VeoOperation;
  try {
    const res = await fetch(`https://${GEMINI_API_HOST}/v1beta/${op}`, {
      headers: { "x-goog-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("status poll failed:", res.status, text.slice(0, 500));
      return NextResponse.json(
        { done: false, error: describeVeoError(`Status check failed (${res.status}).`) },
        { status: 502 }
      );
    }
    operation = (await res.json()) as VeoOperation;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("status poll error:", message);
    return NextResponse.json(
      { done: false, error: "Could not reach the video service. Retrying may help." },
      { status: 502 }
    );
  }

  if (!operation.done) {
    return NextResponse.json({ done: false });
  }

  if (operation.error) {
    const message = operation.error.message ?? "Video generation failed.";
    return NextResponse.json({ done: true, error: describeVeoError(message) });
  }

  const videoUri = extractVideoUri(operation);
  if (!videoUri) {
    const filtered =
      operation.response?.generateVideoResponse?.raiMediaFilteredReasons?.[0];
    return NextResponse.json({
      done: true,
      error: filtered
        ? describeVeoError(filtered)
        : "Generation finished but no video was returned. Try different wording or another image.",
    });
  }

  return NextResponse.json({ done: true, videoUri });
}
