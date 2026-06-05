import { NextRequest, NextResponse } from "next/server";
import { GEMINI_API_HOST } from "@/lib/veo";

export const maxDuration = 60;

// Proxies the authenticated Veo file URI so the API key stays server-side
// and <video> can play the mp4 directly. Strictly limited to Google's
// generative-language host — this must not become an open relay.
export async function GET(req: NextRequest): Promise<Response> {
  const uri = req.nextUrl.searchParams.get("uri");
  const wantsDownload = req.nextUrl.searchParams.get("download") === "1";
  if (!uri) {
    return NextResponse.json({ error: "Missing video URI." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return NextResponse.json({ error: "Malformed video URI." }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== GEMINI_API_HOST) {
    return NextResponse.json(
      { error: "Refusing to proxy a non-Google video URI." },
      { status: 403 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { "x-goog-api-key": apiKey },
      redirect: "follow",
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      console.error("video proxy upstream failed:", upstream.status);
      const expired = upstream.status === 403 || upstream.status === 404;
      return NextResponse.json(
        {
          error: expired
            ? "This video link has expired. Generate it again."
            : `Video fetch failed (${upstream.status}).`,
        },
        { status: 502 }
      );
    }

    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": wantsDownload
        ? 'attachment; filename="adreel-ad.mp4"'
        : "inline",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("video proxy error:", message);
    return NextResponse.json(
      { error: "Could not stream the video. Try again." },
      { status: 502 }
    );
  }
}
