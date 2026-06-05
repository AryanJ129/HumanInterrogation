// POST /api/ask — interrogate the world.
// Route a NL question to a live free dataset, pull real numbers, answer grounded
// in that data with a chart as proof.

import { NextResponse } from "next/server";
import type { AskResponse, Plan } from "@/lib/types";
import {
  fallbackSynthesis,
  heuristicPlan,
  planQuestion,
  synthesize,
  validateChart,
} from "@/lib/gemini";
import { runTool } from "@/lib/sources";

export const maxDuration = 60;

const UNMAPPABLE_MESSAGE =
  "I can answer questions about what the world is reading (Wikipedia attention) or how it is covering a topic (global news tone and volume) - try one of those.";

// The example chips route deterministically — no planner call. They are the
// demo script, so they must not spend (or depend on) free-tier model quota
// for routing.
const CHIP_PLANS: ReadonlyMap<string, Plan> = new Map<string, Plan>([
  [
    "what is the world reading about today?",
    { tool: "wiki_top", interpretation: "Top Wikipedia articles by pageviews." },
  ],
  [
    'how has the mood on "artificial intelligence" shifted this year?',
    {
      tool: "gdelt_tone",
      query: "artificial intelligence",
      timespan: "1y",
      interpretation: "Global news tone for AI over the last year.",
    },
  ],
  [
    "how much is the world reading about bitcoin lately?",
    {
      tool: "wiki_article",
      article: "Bitcoin",
      interpretation: "Daily Wikipedia pageviews for Bitcoin.",
    },
  ],
  [
    'how loudly is the world covering "climate" right now?',
    {
      tool: "gdelt_volume",
      query: "climate",
      timespan: "7d",
      interpretation: "Global news article volume for climate this week.",
    },
  ],
]);

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
  const chipPlan = CHIP_PLANS.get(question.toLowerCase());
  if (chipPlan) {
    plan = chipPlan;
  } else {
    try {
      plan = await planQuestion(question, todayUtc());
    } catch (err) {
      // Model quota exhausted or unreachable — route by keywords instead.
      console.error("ask: plan failed:", err instanceof Error ? err.message : "unknown error");
      plan = heuristicPlan(question);
      if (!plan) {
        return NextResponse.json(
          { error: "The model could not route your question. Try again in a few seconds." },
          { status: 502 },
        );
      }
    }
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
  // If the model quota is exhausted, fall back to a deterministic answer
  // computed from the real numbers — the data is live either way.
  let synthesis;
  try {
    synthesis = await synthesize(question, result);
  } catch (err) {
    console.error("ask: synthesize failed:", err instanceof Error ? err.message : "unknown error");
    synthesis = fallbackSynthesis(result);
  }

  const chart = validateChart(synthesis.chart);
  const response: AskResponse = {
    answer: synthesis.answer,
    sourceLabel: result.sourceLabel,
    ...(chart ? { chart } : {}),
  };

  return NextResponse.json(response, { status: 200 });
}
