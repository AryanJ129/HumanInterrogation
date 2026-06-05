import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";

const env = fs.readFileSync(
  ".env.local",
  "utf8"
);
const apiKey = env.match(/GEMINI_API_KEY=(.+)/)[1].trim();
const ai = new GoogleGenAI({ apiKey });

const prompt = [
  "8-second vertical product ad, cinematic and high-energy.",
  "Subject: a sleek matte-black insulated coffee tumbler.",
  "Scene: dynamic close-up product shots, shallow depth of field, clean modern lighting.",
  'Audio: upbeat background music; a confident voiceover says clearly: "Your morning just got an upgrade.".',
  "End on the product centered with the spoken line landing on the final beat.",
  "Style: premium DTC commercial, sharp, no on-screen text.",
].join("\n");

console.log("kicking off generation...");
let op;
try {
  op = await ai.models.generateVideos({
    model: "veo-3.1-fast-generate-preview",
    prompt,
    config: {
      aspectRatio: "9:16",
      resolution: "720p",
      negativePrompt: "blurry, distorted text, watermark, low quality",
    },
  });
} catch (err) {
  console.error("KICKOFF_FAILED:", err.message ?? String(err));
  process.exit(1);
}
console.log("operation:", op.name);

const start = Date.now();
while (!op.done) {
  if (Date.now() - start > 8 * 60 * 1000) {
    console.error("TIMEOUT after 8 minutes");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 8000));
  op = await ai.operations.getVideosOperation({ operation: op });
  console.log(`polled +${Math.round((Date.now() - start) / 1000)}s done=${op.done ?? false}`);
}

if (op.error) {
  console.error("OPERATION_ERROR:", JSON.stringify(op.error));
  process.exit(1);
}

const uri =
  op.response?.generatedVideos?.[0]?.video?.uri ??
  op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
if (!uri) {
  console.error("NO_URI. response:", JSON.stringify(op.response).slice(0, 800));
  process.exit(1);
}
console.log("video uri:", uri);

const res = await fetch(uri, { headers: { "x-goog-api-key": apiKey } });
if (!res.ok) {
  console.error("DOWNLOAD_FAILED:", res.status);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync("/tmp/adreel-phase0.mp4", buf);
console.log(`SUCCESS: saved /tmp/adreel-phase0.mp4 (${(buf.length / 1e6).toFixed(1)} MB) in ${Math.round((Date.now() - start) / 1000)}s`);
