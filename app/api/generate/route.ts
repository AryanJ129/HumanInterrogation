import { NextRequest, NextResponse } from "next/server";
import {
  buildPrompt,
  describeVeoError,
  getClient,
  VEO_MODEL,
  type GenerateRequestBody,
  type GenerateResponseBody,
} from "@/lib/veo";

// Safety margin only — this route kicks off the operation and returns in
// seconds. It must NEVER await operation completion (that takes minutes).
export const maxDuration = 60;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_HOOK_LENGTH = 160;
// ~4MB of base64 — Vercel's request body cap is 4.5MB; the client
// downscales images before upload to stay well under this.
const MAX_IMAGE_BASE64_LENGTH = 4 * 1024 * 1024;

export async function POST(
  req: NextRequest
): Promise<NextResponse<GenerateResponseBody | { error: string }>> {
  let body: GenerateRequestBody;
  try {
    body = (await req.json()) as GenerateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const hook = typeof body.hook === "string" ? body.hook.trim() : "";
  if (!hook) {
    return NextResponse.json(
      { error: "A hook line is required." },
      { status: 400 }
    );
  }
  if (hook.length > MAX_HOOK_LENGTH) {
    return NextResponse.json(
      { error: `Keep the hook under ${MAX_HOOK_LENGTH} characters.` },
      { status: 400 }
    );
  }

  let image: { imageBytes: string; mimeType: string } | undefined;
  if (body.imageBase64) {
    if (!body.mimeType || !ALLOWED_MIME_TYPES.has(body.mimeType)) {
      return NextResponse.json(
        { error: "Image must be JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }
    if (body.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "Image is too large. Use an image under ~3MB." },
        { status: 400 }
      );
    }
    image = { imageBytes: body.imageBase64, mimeType: body.mimeType };
  }

  try {
    const ai = getClient();
    const operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt: buildPrompt(hook, body.productDesc),
      image,
      config: {
        aspectRatio: "9:16",
        resolution: "720p",
        negativePrompt: "blurry, distorted text, watermark, low quality",
        generateAudio: true,
      },
    });

    if (!operation.name) {
      return NextResponse.json(
        { error: "Veo did not return an operation name. Try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({ operationName: operation.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate failed:", message);
    return NextResponse.json(
      { error: describeVeoError(message) },
      { status: 502 }
    );
  }
}
