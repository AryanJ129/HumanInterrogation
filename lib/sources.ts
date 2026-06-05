// Public-data fetchers + normalizers for the AUGUR ask pipeline.
// Each fetcher hits a free, auth-free endpoint and shapes the response into a
// SourceResult. On any failure or empty data we throw an Error whose message is
// plain language a user can read in the UI.

import { findSnapshot } from "@/lib/gdelt-snapshots";
import type { Plan, SeriesPoint, SourceResult } from "@/lib/types";

// --- Shared constants ---------------------------------------------------------

const WIKI_UA = "AUGUR/1.0 (hackathon demo)";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RAW_ROWS = 5;
const MAX_TIMELINE_POINTS = 100;

// --- Date helpers (all UTC) ---------------------------------------------------

/** UTC "now" shifted back by `days`. */
function daysAgoUTC(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYYMMDD in UTC. */
function compactDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

/** YYYY/MM/DD in UTC (wiki_top path format). */
function slashedDate(d: Date): string {
  return `${d.getUTCFullYear()}/${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}`;
}

/** Subtract `days` from a YYYYMMDD string, returning YYYYMMDD (UTC). */
function compactMinusDays(yyyymmdd: string, days: number): string {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return compactDate(d);
}

/**
 * Convert a Wikipedia per-article timestamp (e.g. "2026060100") into an
 * ISO-ish "YYYY-MM-DD" string.
 */
function wikiTimestampToISODate(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/**
 * Convert a GDELT date (e.g. "20260301T120000Z") into "YYYY-MM-DD".
 */
function gdeltDateToISODate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

// --- Fetch helpers ------------------------------------------------------------

/** GET a Wikimedia REST endpoint, with the required User-Agent. Returns the
 *  raw Response so callers can branch on status (e.g. 404 = missing article). */
async function fetchWiki(url: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { "User-Agent": WIKI_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      "Could not reach Wikipedia's pageviews service. Please try again in a moment.",
    );
  }
}

/** GET a GDELT timeline endpoint, retrying once after a pause if GDELT's
 *  1-request-per-5-seconds limit bites (seen in practice as either a 429 or
 *  a plain-text notice). */
async function fetchGdeltTimeline(url: string): Promise<GdeltTimelineResponse> {
  try {
    return await fetchGdeltTimelineOnce(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!/rate-limiting|status 429/.test(message)) {
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 6500));
    return fetchGdeltTimelineOnce(url);
  }
}

/** GET a GDELT timeline endpoint. GDELT sometimes serves JSON with a
 *  non-JSON content-type and can return a plain-text rate-limit notice, so we
 *  read the body as text and parse it ourselves. */
async function fetchGdeltTimelineOnce(url: string): Promise<GdeltTimelineResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      "Could not reach the GDELT global news service. Please try again in a moment.",
    );
  }
  if (!res.ok) {
    throw new Error(
      `GDELT global news returned an error (status ${res.status}). Please try again.`,
    );
  }
  const text = await res.text();
  const trimmed = text.trim();
  if (
    trimmed.length === 0 ||
    /limit requests|please limit/i.test(trimmed) ||
    trimmed[0] !== "{"
  ) {
    if (/limit requests|please limit/i.test(trimmed)) {
      throw new Error(
        "GDELT is rate-limiting requests right now. Please wait a few seconds and try again.",
      );
    }
    throw new Error("GDELT returned no usable data for that query.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("GDELT returned a response we could not read. Please try again.");
  }
  return parsed as GdeltTimelineResponse;
}

// --- Minimal raw response shapes ---------------------------------------------

interface WikiTopArticle {
  article: string;
  views: number;
  rank: number;
}

interface WikiTopResponse {
  items?: Array<{ articles?: WikiTopArticle[] }>;
}

interface WikiArticleItem {
  timestamp: string;
  views: number;
}

interface WikiArticleResponse {
  items?: WikiArticleItem[];
}

interface GdeltTimelinePoint {
  date: string;
  value: number;
}

interface GdeltTimelineSeries {
  series: string;
  data?: GdeltTimelinePoint[];
}

interface GdeltTimelineResponse {
  timeline?: GdeltTimelineSeries[];
}

interface HnHit {
  title?: string | null;
  points?: number | null;
  num_comments?: number | null;
  objectID?: string;
}

interface HnResponse {
  hits?: HnHit[];
}

// --- Generic helpers ----------------------------------------------------------

/** Downsample evenly to at most `max` points, preserving first and last. */
function downsample(points: SeriesPoint[], max: number): SeriesPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < max; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// --- Tool implementations -----------------------------------------------------

async function runWikiTop(plan: Plan): Promise<SourceResult> {
  const dateSlash = plan.date ?? slashedDate(daysAgoUTC(2));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia.org/all-access/${dateSlash}`;

  const res = await fetchWiki(url);
  if (res.status === 404) {
    throw new Error(
      `Wikipedia has no most-read list for ${dateSlash}. Pageview data lags about a day — try an earlier date.`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Wikipedia pageviews returned an error (status ${res.status}). Please try again.`,
    );
  }

  let data: WikiTopResponse;
  try {
    data = (await res.json()) as WikiTopResponse;
  } catch {
    throw new Error("Wikipedia returned a response we could not read. Please try again.");
  }

  const articles = data.items?.[0]?.articles;
  if (!articles || articles.length === 0) {
    throw new Error(`Wikipedia returned no most-read articles for ${dateSlash}.`);
  }

  const filtered = articles.filter(
    (a) => a.article !== "Main_Page" && !a.article.includes(":"),
  );
  if (filtered.length === 0) {
    throw new Error(`Wikipedia returned no readable articles for ${dateSlash}.`);
  }

  const top = filtered.slice(0, 10);
  const points: SeriesPoint[] = top.map((a) => ({
    x: a.article.replace(/_/g, " "),
    y: a.views,
  }));

  return {
    points,
    label: `Most-read Wikipedia articles on ${dateSlash}`,
    sourceLabel: "via Wikipedia pageviews",
    raw: top.slice(0, MAX_RAW_ROWS),
  };
}

async function runWikiArticle(plan: Plan): Promise<SourceResult> {
  const article = plan.article;
  if (!article) {
    throw new Error("No Wikipedia article was specified for this question.");
  }

  const end = plan.end ?? compactDate(daysAgoUTC(2));
  const start = plan.start ?? compactMinusDays(end, 90);
  const encoded = encodeURIComponent(article);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/all-agents/${encoded}/daily/${start}/${end}`;

  const res = await fetchWiki(url);
  const title = article.replace(/_/g, " ");
  if (res.status === 404) {
    throw new Error(
      `No Wikipedia article titled "${title}" was found. The exact title may be different.`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Wikipedia pageviews returned an error (status ${res.status}). Please try again.`,
    );
  }

  let data: WikiArticleResponse;
  try {
    data = (await res.json()) as WikiArticleResponse;
  } catch {
    throw new Error("Wikipedia returned a response we could not read. Please try again.");
  }

  const items = data.items;
  if (!items || items.length === 0) {
    throw new Error(
      `Wikipedia has no pageview data for "${title}" in that date range.`,
    );
  }

  const points: SeriesPoint[] = items.map((it) => ({
    x: wikiTimestampToISODate(it.timestamp),
    y: it.views,
  }));

  return {
    points,
    label: `Daily Wikipedia pageviews for ${title}`,
    sourceLabel: "via Wikipedia pageviews",
    raw: items.slice(0, MAX_RAW_ROWS),
  };
}

/** Build the GDELT doc-api timeline URL. Multi-word queries are wrapped in
 *  double quotes inside the query value, then the whole value is URL-encoded. */
function gdeltUrl(query: string, mode: string, timespan: string): string {
  const phrase = query.trim().includes(" ") ? `"${query.trim()}"` : query.trim();
  const q = encodeURIComponent(phrase);
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=${mode}&format=json&timespan=${encodeURIComponent(timespan)}`;
}

async function runGdeltTone(plan: Plan): Promise<SourceResult> {
  const query = plan.query?.trim();
  if (!query) {
    throw new Error("No search term was provided for the news-tone lookup.");
  }
  const timespan = plan.timespan ?? "3m";
  const url = gdeltUrl(query, "timelinetone", timespan);

  let data: GdeltTimelineResponse;
  try {
    data = await fetchGdeltTimeline(url);
  } catch (err) {
    // GDELT rate-limits (1 req/5s per IP) and can be unreachable from shared
    // cloud egress IPs entirely. Serve a baked real-data snapshot rather than
    // dying, labeled honestly.
    const snapshot = findSnapshot("timelinetone", query);
    if (snapshot) {
      return {
        points: snapshot.points,
        label: `Average global news tone for ${query}`,
        sourceLabel: `via GDELT global news - tone scale -10 to +10 (cached snapshot from ${snapshot.capturedOn}; GDELT is rate-limiting live calls)`,
        raw: snapshot.points.slice(0, MAX_RAW_ROWS),
      };
    }
    throw err;
  }
  const series = data.timeline?.[0];
  const rows = series?.data;
  if (!rows || rows.length === 0) {
    throw new Error(`GDELT found no news coverage for "${query}" to measure tone.`);
  }

  let points: SeriesPoint[] = rows.map((r) => ({
    x: gdeltDateToISODate(r.date),
    y: r.value,
  }));
  if (points.length > MAX_TIMELINE_POINTS + 20) {
    points = downsample(points, MAX_TIMELINE_POINTS);
  }

  return {
    points,
    label: `Average global news tone for ${query}`,
    sourceLabel: "via GDELT global news - tone scale -10 to +10",
    raw: rows.slice(0, MAX_RAW_ROWS),
  };
}

async function runGdeltVolume(plan: Plan): Promise<SourceResult> {
  const query = plan.query?.trim();
  if (!query) {
    throw new Error("No search term was provided for the news-volume lookup.");
  }
  const timespan = plan.timespan ?? "3m";
  const url = gdeltUrl(query, "timelinevolraw", timespan);

  let data: GdeltTimelineResponse;
  try {
    data = await fetchGdeltTimeline(url);
  } catch (err) {
    const snapshot = findSnapshot("timelinevolraw", query);
    if (snapshot) {
      return {
        points: snapshot.points,
        label: `Global news article volume for ${query}`,
        sourceLabel: `via GDELT global news volume (cached snapshot from ${snapshot.capturedOn}; GDELT is rate-limiting live calls)`,
        raw: snapshot.points.slice(0, MAX_RAW_ROWS),
      };
    }
    throw err;
  }
  const timeline = data.timeline;
  if (!timeline || timeline.length === 0) {
    throw new Error(`GDELT found no news coverage for "${query}" to count.`);
  }

  // timelinevolraw returns raw article counts. A normalized series may sit
  // alongside the raw one — prefer a series that is not the normalized one.
  const rawSeries =
    timeline.find(
      (s) =>
        s.data &&
        s.data.length > 0 &&
        !/norm/i.test(s.series),
    ) ?? timeline.find((s) => s.data && s.data.length > 0);

  const rows = rawSeries?.data;
  if (!rows || rows.length === 0) {
    throw new Error(`GDELT found no news coverage for "${query}" to count.`);
  }

  let points: SeriesPoint[] = rows.map((r) => ({
    x: gdeltDateToISODate(r.date),
    y: r.value,
  }));
  if (points.length > MAX_TIMELINE_POINTS + 20) {
    points = downsample(points, MAX_TIMELINE_POINTS);
  }

  return {
    points,
    label: `Global news article volume for ${query}`,
    sourceLabel: "via GDELT global news volume",
    raw: rows.slice(0, MAX_RAW_ROWS),
  };
}

async function runHn(plan: Plan): Promise<SourceResult> {
  const query = plan.query?.trim();
  if (!query) {
    throw new Error("No search term was provided for the Hacker News lookup.");
  }
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Could not reach Hacker News. Please try again in a moment.");
  }
  if (!res.ok) {
    throw new Error(
      `Hacker News search returned an error (status ${res.status}). Please try again.`,
    );
  }

  let data: HnResponse;
  try {
    data = (await res.json()) as HnResponse;
  } catch {
    throw new Error("Hacker News returned a response we could not read. Please try again.");
  }

  const hits = data.hits ?? [];
  const scored = hits
    .filter((h): h is HnHit & { title: string } => typeof h.title === "string" && h.title.length > 0)
    .map((h) => ({ title: h.title, points: typeof h.points === "number" ? h.points : 0, hit: h }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  if (scored.length === 0) {
    throw new Error(`Hacker News has no stories matching "${query}".`);
  }

  const points: SeriesPoint[] = scored.map((s) => ({
    x: truncate(s.title, 40),
    y: s.points,
  }));

  return {
    points,
    label: `Top Hacker News stories for ${query}`,
    sourceLabel: "via Hacker News",
    raw: scored.slice(0, MAX_RAW_ROWS).map((s) => s.hit),
  };
}

// --- Dispatch -----------------------------------------------------------------

export async function runTool(plan: Plan): Promise<SourceResult> {
  switch (plan.tool) {
    case "wiki_top":
      return runWikiTop(plan);
    case "wiki_article":
      return runWikiArticle(plan);
    case "gdelt_tone":
      return runGdeltTone(plan);
    case "gdelt_volume":
      return runGdeltVolume(plan);
    case "hn":
      return runHn(plan);
    default: {
      // Exhaustiveness guard — should be unreachable given the ToolName union.
      const exhaustive: never = plan.tool;
      throw new Error(`Unsupported data source: ${String(exhaustive)}`);
    }
  }
}
