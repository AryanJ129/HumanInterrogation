// Gemini routing + synthesis for the "interrogate the world" pipeline.
// Two structured-output calls: planQuestion (route a NL question to a tool)
// and synthesize (ground an answer + chart in real data).

import { GoogleGenAI, Type } from "@google/genai";
import type { ChartSpec, Plan, SeriesPoint, SourceResult, ToolName } from "@/lib/types";

// Single source of truth. Free tier only — never a Pro model.
export const MODEL = "gemini-2.5-flash";
// Last-resort fallback when MODEL is overloaded (also free tier).
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

interface GenerateRequest {
  contents: string;
  config: {
    responseMimeType: string;
    responseSchema: object;
    temperature: number;
  };
}

/**
 * The free tier throws transient 503 UNAVAILABLE under load and short-window
 * 429s that clear in under a second ("retry in 748ms" seen in practice).
 * Retry the primary model patiently, then try the fallback model once.
 * Total worst-case stays well under the route's maxDuration.
 */
async function generateWithRetry(req: GenerateRequest): Promise<string | undefined> {
  const client = getClient();
  const attempts: Array<{ model: string; waitAfterFailureMs: number }> = [
    { model: MODEL, waitAfterFailureMs: 1200 },
    { model: MODEL, waitAfterFailureMs: 3000 },
    { model: MODEL, waitAfterFailureMs: 1000 },
    { model: FALLBACK_MODEL, waitAfterFailureMs: 0 },
  ];
  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, waitAfterFailureMs } = attempts[i];
    try {
      const response = await client.models.generateContent({ model, ...req });
      return response.text;
    } catch (err) {
      lastError = err;
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? (err as { status: unknown }).status
          : undefined;
      const transient = status === 503 || status === 429;
      if (!transient || i === attempts.length - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, waitAfterFailureMs));
    }
  }
  throw lastError;
}

const ALLOWED_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "wiki_top",
  "wiki_article",
  "gdelt_tone",
  "gdelt_volume",
  "hn",
]);

let cachedClient: GoogleGenAI | null = null;

/** Returns a singleton client. Throws if GEMINI_API_KEY is unset. Never logs the key. */
export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Plan schema (Gemini call #1). Mirrors Plan, but tool enum is extended by
// "none" so the model can decline a question it can't map to any tool.
// ---------------------------------------------------------------------------

const PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tool: {
      type: Type.STRING,
      enum: ["wiki_top", "wiki_article", "gdelt_tone", "gdelt_volume", "hn", "none"],
      description: "Which data tool answers the question, or 'none' if unmappable.",
    },
    article: {
      type: Type.STRING,
      description:
        "wiki_article only: underscored, properly capitalized Wikipedia title, e.g. Artificial_intelligence.",
    },
    start: { type: Type.STRING, description: "wiki_article only: window start YYYYMMDD." },
    end: { type: Type.STRING, description: "wiki_article only: window end YYYYMMDD (default 2 days ago)." },
    query: { type: Type.STRING, description: "gdelt_* and hn only: the search term." },
    timespan: { type: Type.STRING, description: "gdelt_* only: e.g. 7d, 3m, 1y (default 3m)." },
    date: { type: Type.STRING, description: "wiki_top only: YYYY/MM/DD (default 2 days ago)." },
    interpretation: {
      type: Type.STRING,
      description: "One line: how this tool answers the question.",
    },
  },
  required: ["tool", "interpretation"],
} as const;

const PLAN_SYSTEM = (today: string): string =>
  `You route a natural-language question about human attention and sentiment to exactly one live data tool.

Tools:
- wiki_top: what the world is reading on a given day (top Wikipedia articles).
- wiki_article: the attention timeline for one topic, via its Wikipedia article's daily pageviews.
- gdelt_tone: how positively or negatively global news covers a topic over time.
- gdelt_volume: how loudly (how much) global news covers a topic over time.
- hn: the tech and startup community pulse, via Hacker News.

Rules:
- Today is ${today}. Wikipedia pageviews lag, so any date window must end about 2 days ago — never today or the future.
- For wiki_article and wiki_top, give underscored, properly capitalized Wikipedia titles (e.g. Artificial_intelligence, Bitcoin, Climate_change).
- For gdelt_* and hn, set query to the bare search term.
- For a comparison question (X vs Y), pick the single primary subject for the tool fields and note the full comparison in interpretation.
- If the question cannot be mapped to any tool, set tool to "none".
- Respond with JSON only.

Examples:
- "What is the world reading about today?" -> {"tool":"wiki_top"}
- "How much is the world reading about Bitcoin lately?" / "how many people searched X" / "how popular is X" -> {"tool":"wiki_article","article":"Bitcoin"} (attention for ONE named topic = wiki_article, never wiki_top)
- "How has the mood on \\"artificial intelligence\\" shifted this year?" -> {"tool":"gdelt_tone","query":"artificial intelligence","timespan":"1y"}
- "How loudly is the world covering \\"climate\\" right now?" -> {"tool":"gdelt_volume","query":"climate","timespan":"7d"}
- "What is the tech community saying about Rust?" -> {"tool":"hn","query":"Rust"}`;

/** Gemini call #1: route the question to a tool plan, or null if unmappable. */
export async function planQuestion(question: string, today: string): Promise<Plan | null> {
  const text = await generateWithRetry({
    contents: `${PLAN_SYSTEM(today)}\n\nQuestion: ${question}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: PLAN_SCHEMA,
      temperature: 0,
    },
  });
  if (!text) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  return validatePlan(parsed);
}

// ---------------------------------------------------------------------------
// Heuristic router — used when the free-tier model quota is exhausted, so a
// typed question still routes without a Gemini call. Deliberately simple.
// ---------------------------------------------------------------------------

const SUBJECT_STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "how", "what", "which", "who", "when", "where", "why",
  "much", "many", "most", "more", "lately", "recently",
  "this", "that", "these", "those", "year", "week", "month", "day", "days",
  "right", "now", "today", "yesterday",
  "about", "on", "of", "in", "for", "to", "and", "or", "with",
  "did", "does", "do", "has", "have", "had", "will",
  "world", "people", "everyone", "region", "country",
  "search", "searched", "searching", "searches",
  "reading", "read", "reads",
  "covering", "coverage", "cover", "covered",
  "mood", "feel", "feels", "feeling", "sentiment", "tone",
  "talking", "talk", "saying", "say",
  "popular", "popularity", "attention", "interest", "interested",
  "loud", "loudly", "shifted", "shift", "changed", "change",
]);

/** Pull the likely subject out of a question: a quoted phrase if present,
 *  else whatever tokens survive the stopword filter. */
function extractSubject(question: string): string | undefined {
  const quoted = question.match(/"([^"]+)"|'([^']+)'/);
  if (quoted) return (quoted[1] ?? quoted[2]).trim();
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !SUBJECT_STOPWORDS.has(t));
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

/** Title-case a subject into a Wikipedia-style underscored title. */
function toWikiTitle(subject: string): string {
  const words = subject.split(/\s+/);
  return (words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? "_" + words.slice(1).join("_") : ""));
}

/** Keyword routing for when the model can't be reached. Null if no match. */
export function heuristicPlan(question: string): Plan | null {
  const q = question.toLowerCase();
  const subject = extractSubject(question);

  if (/hacker news|tech community|startup/.test(q)) {
    return subject
      ? { tool: "hn", query: subject, interpretation: "Hacker News pulse (heuristic routing)." }
      : null;
  }
  if (/mood|sentiment|feel|tone|positive|negative/.test(q)) {
    return subject
      ? {
          tool: "gdelt_tone",
          query: subject,
          timespan: /year/.test(q) ? "1y" : "3m",
          interpretation: "Global news tone (heuristic routing).",
        }
      : null;
  }
  if (/loud|volume|how much.*(news|coverage)|covering|coverage/.test(q)) {
    return subject
      ? {
          tool: "gdelt_volume",
          query: subject,
          timespan: /now|this week|week/.test(q) ? "7d" : "3m",
          interpretation: "Global news volume (heuristic routing).",
        }
      : null;
  }
  if (!subject || /most.?read|top article|reading about today|what.*world.*reading/.test(q)) {
    return { tool: "wiki_top", interpretation: "Top Wikipedia articles (heuristic routing)." };
  }
  // Default: attention for a named subject via its Wikipedia article.
  return {
    tool: "wiki_article",
    article: toWikiTitle(subject),
    interpretation: "Wikipedia attention timeline (heuristic routing).",
  };
}

// ---------------------------------------------------------------------------
// Synthesis schema (Gemini call #2).
// ---------------------------------------------------------------------------

// The chart series is built server-side from the source data — the model only
// returns prose + chart labels. That keeps the output tiny (free-tier tokens),
// fast, and makes it impossible for the model to misquote the series.
const SYNTH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: "2-4 plain-language sentences that cite the number that matters.",
    },
    chartType: { type: Type.STRING, enum: ["line", "bar"] },
    xLabel: { type: Type.STRING },
    yLabel: { type: Type.STRING },
  },
  required: ["answer", "chartType", "xLabel", "yLabel"],
} as const;

const SYNTH_SYSTEM = `You answer a question grounded strictly in the data points provided.

- Write 2-4 plain-language sentences. Cite the specific number that matters. No hedging, no boilerplate, no "as an AI" or "based on the data provided" filler.
- If the question asks for something the data does not contain (e.g. regions), answer what the data does show and say plainly what it cannot.
- chartType: "line" for timelines (data over dates), "bar" for rankings or category comparisons. xLabel/yLabel: short axis labels for the given data.
- Respond with JSON only.`;

/** Build a ChartSpec directly from source points (capped). */
export function chartFromPoints(
  type: "line" | "bar",
  xLabel: string,
  yLabel: string,
  points: SeriesPoint[],
): ChartSpec {
  return { type, xLabel, yLabel, series: points.slice(0, 120) };
}

/** True when the x values look like a date timeline. */
function looksLikeTimeline(points: SeriesPoint[]): boolean {
  return points.length > 0 && /^\d{4}-\d{2}-\d{2}/.test(points[0].x);
}

/**
 * Deterministic last-resort answer computed from the real numbers, for when
 * the free-tier model quota is exhausted. The data is still live and real —
 * only the prose is templated.
 */
export function fallbackSynthesis(result: SourceResult): { answer: string; chart: ChartSpec } {
  const points = result.points;
  if (looksLikeTimeline(points)) {
    let max = points[0];
    let min = points[0];
    for (const p of points) {
      if (p.y > max.y) max = p;
      if (p.y < min.y) min = p;
    }
    const latest = points[points.length - 1];
    const round = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2));
    return {
      answer:
        `${result.label}: peaked at ${round(max.y)} on ${max.x}, ` +
        `bottomed at ${round(min.y)} on ${min.x}, ` +
        `most recently ${round(latest.y)} on ${latest.x}.`,
      chart: chartFromPoints("line", "Date", result.label, points),
    };
  }
  const top = points[0];
  return {
    answer: `${result.label}: "${top.x}" leads with ${top.y.toLocaleString("en-US")}, ahead of ${points
      .slice(1, 3)
      .map((p) => `"${p.x}" (${p.y.toLocaleString("en-US")})`)
      .join(" and ")}.`,
    chart: chartFromPoints("bar", "Item", result.label, points),
  };
}

/** Gemini call #2: grounded answer; the chart series comes from the data itself. */
export async function synthesize(
  question: string,
  result: SourceResult,
): Promise<{ answer: string; chart?: ChartSpec }> {
  const compactPoints = JSON.stringify(result.points);

  const text = await generateWithRetry({
    contents: `${SYNTH_SYSTEM}

Question: ${question}
What the data measures: ${result.label}
Data points: ${compactPoints}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: SYNTH_SCHEMA,
      temperature: 0.2,
    },
  });
  if (!text) {
    throw new Error("Empty synthesis response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Synthesis response was not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Synthesis response was not an object");
  }

  const obj = parsed as Record<string, unknown>;
  const answer = typeof obj.answer === "string" ? obj.answer.trim() : "";
  if (!answer) {
    throw new Error("Synthesis response had no answer");
  }

  const chartType = obj.chartType === "bar" ? "bar" : "line";
  const xLabel = typeof obj.xLabel === "string" ? obj.xLabel : "x";
  const yLabel = typeof obj.yLabel === "string" ? obj.yLabel : "y";
  const chart = validateChart(chartFromPoints(chartType, xLabel, yLabel, result.points));
  return chart ? { answer, chart } : { answer };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validates a model-produced object into a Plan, or null if invalid. */
export function validatePlan(c: unknown): Plan | null {
  if (typeof c !== "object" || c === null) {
    return null;
  }
  const obj = c as Record<string, unknown>;

  const tool = obj.tool;
  if (typeof tool !== "string" || !ALLOWED_TOOLS.has(tool as ToolName)) {
    // Covers "none" and any unexpected value.
    return null;
  }
  const toolName = tool as ToolName;

  const interpretation = typeof obj.interpretation === "string" ? obj.interpretation : "";
  if (!interpretation) {
    return null;
  }

  const article = optString(obj.article);
  const query = optString(obj.query);

  // Required field per tool.
  if (toolName === "wiki_article" && !article) {
    return null;
  }
  if ((toolName === "gdelt_tone" || toolName === "gdelt_volume" || toolName === "hn") && !query) {
    return null;
  }

  const plan: Plan = { tool: toolName, interpretation };
  if (article) plan.article = article;
  if (query) plan.query = query;

  const start = optString(obj.start);
  if (start) plan.start = start;
  const end = optString(obj.end);
  if (end) plan.end = end;
  const timespan = optString(obj.timespan);
  if (timespan) plan.timespan = timespan;
  const date = optString(obj.date);
  if (date) plan.date = date;

  return plan;
}

/** Validates a model-produced object into a ChartSpec, or undefined if malformed. */
export function validateChart(c: unknown): ChartSpec | undefined {
  if (typeof c !== "object" || c === null) {
    return undefined;
  }
  const obj = c as Record<string, unknown>;

  const type = obj.type;
  if (type !== "line" && type !== "bar") {
    return undefined;
  }
  if (typeof obj.xLabel !== "string" || typeof obj.yLabel !== "string") {
    return undefined;
  }
  if (!Array.isArray(obj.series) || obj.series.length === 0) {
    return undefined;
  }

  const series: SeriesPoint[] = [];
  for (const point of obj.series) {
    if (typeof point !== "object" || point === null) {
      return undefined;
    }
    const p = point as Record<string, unknown>;
    if (typeof p.x !== "string") {
      return undefined;
    }
    if (typeof p.y !== "number" || !Number.isFinite(p.y)) {
      return undefined;
    }
    series.push({ x: p.x, y: p.y });
    if (series.length >= 120) {
      break; // cap series at 120 points
    }
  }

  return {
    type,
    xLabel: obj.xLabel,
    yLabel: obj.yLabel,
    series,
  };
}

function optString(v: unknown): string | undefined {
  if (typeof v !== "string") {
    return undefined;
  }
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
