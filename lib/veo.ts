import { GoogleGenAI } from "@google/genai";

// Single source of truth for the model id. AI Studio keys use the
// `...-preview` ids; the `...-001` ids are Vertex-only.
export const VEO_MODEL = "veo-3.1-fast-generate-preview";

export const GEMINI_API_HOST = "generativelanguage.googleapis.com";

export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({ apiKey });
}

export interface GenerateRequestBody {
  hook: string;
  productDesc?: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface GenerateResponseBody {
  operationName: string;
}

export interface StatusResponseBody {
  done: boolean;
  videoUri?: string;
  error?: string;
}

// Shape of the raw REST operation object returned by
// GET https://generativelanguage.googleapis.com/v1beta/{operationName}
export interface VeoOperation {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };
    // SDK-style shape, kept as a fallback in case the REST shape shifts.
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };
}

// The audio is the product: the voiceover and music are scripted
// explicitly because Veo 3.x drives native audio from the prompt text.
export function buildPrompt(hook: string, productDesc?: string): string {
  const subject =
    productDesc?.trim() || "the product shown in the reference image";
  return [
    "8-second vertical product ad, cinematic and high-energy.",
    `Subject: ${subject}.`,
    "Scene: dynamic close-up product shots with shallow depth of field, clean modern lighting.",
    `Audio: upbeat background music; a confident voiceover says clearly: "${hook.trim()}".`,
    "End on the product centered with the spoken line landing on the final beat.",
    "Style: premium DTC commercial, sharp, no on-screen text.",
  ].join("\n");
}

// Extract the video URI from a finished operation, whichever shape it uses.
export function extractVideoUri(op: VeoOperation): string | undefined {
  return (
    op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    op.response?.generatedVideos?.[0]?.video?.uri
  );
}

// Map raw upstream failures to messages the UI can show as-is.
export function describeVeoError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("api key not valid") || m.includes("api_key_invalid")) {
    return "The server's Gemini API key is invalid. Check GEMINI_API_KEY.";
  }
  if (
    m.includes("resource_exhausted") ||
    m.includes("quota") ||
    m.includes("billing") ||
    m.includes("429")
  ) {
    return "Quota or billing limit hit on the Gemini API project. Enable billing / check quota, then retry.";
  }
  if (m.includes("safety") || m.includes("blocked") || m.includes("rai")) {
    return "The request was blocked by content safety filters. Try a different image or wording.";
  }
  return message;
}
