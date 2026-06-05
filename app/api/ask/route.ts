// POST /api/ask — interrogate the world.
// Route a NL question to a live free dataset, pull real numbers, answer grounded
// in that data with a chart as proof.

import { NextResponse } from "next/server";
import type { AskResponse } from "@/lib/types";
import { planQuestion, synthesize, validateChart } from "@/lib/gemini";
import { runTool } from "@/lib/sources";

export const maxDuration = 60;

const UNMAPPABLE_MESSAGE =
  "I can answer questions about what the world is reading (Wikipedia attention) or how it is covering a topic (global news tone and volume) - try one of those.";

interface AskBody {
  question?: unknown;
}

/** Current UTC date as YYYY-MM-DD. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request): Promise<NextResponse> {
  // --- Parse + validate body ---
  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }
  if (question.length > 300) {
    return NextResponse.json({ error: "Question is too long (max 300 characters)." }, { status: 400 });
  }

  // --- Step 1: route the question to a tool plan ---
  let plan;
  try {
    plan = await planQuestion(question, todayUtc());
  } catch (err) {
    console.error("ask: plan failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json(
      { error: "The model could not route your question. Try again." },
      { status: 502 },
    );
  }

  if (!plan) {
    return NextResponse.json({ error: UNMAPPABLE_MESSAGE }, { status: 422 });
  }

  // --- Step 2: pull real numbers from the live dataset ---
  let result;
  try {
    result = await runTool(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The data source failed.";
    console.error("ask: runTool failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // --- Step 3: synthesize a grounded answer + chart ---
  let synthesis;
  try {
    synthesis = await synthesize(question, result);
  } catch (err) {
    console.error("ask: synthesize failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json(
      { error: "The model could not synthesize an answer. Try rephrasing." },
      { status: 502 },
    );
  }

  const chart = validateChart(synthesis.chart);
  const response: AskResponse = {
    answer: synthesis.answer,
    sourceLabel: result.sourceLabel,
    ...(chart ? { chart } : {}),
  };

  return NextResponse.json(response, { status: 200 });
}
