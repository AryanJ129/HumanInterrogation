// Shared contracts — single source of truth for the ask pipeline.

export type ToolName =
  | "wiki_top"
  | "wiki_article"
  | "gdelt_tone"
  | "gdelt_volume"
  | "hn";

export interface Plan {
  tool: ToolName;
  article?: string; // wiki_article: underscored title, e.g. Artificial_intelligence
  start?: string; // wiki_article: YYYYMMDD (default: 90 days before end)
  end?: string; // wiki_article: YYYYMMDD (default: 2 days ago — pageviews lag)
  query?: string; // gdelt_* and hn: the search term
  timespan?: string; // gdelt_*: e.g. "7d", "3m", "1y" (default "3m")
  date?: string; // wiki_top: YYYY/MM/DD (default: 2 days ago)
  interpretation: string; // one line: how this tool answers the question
}

export interface SeriesPoint {
  x: string;
  y: number;
}

export interface SourceResult {
  points: SeriesPoint[];
  label: string; // what the series measures, e.g. "Daily pageviews for Bitcoin"
  sourceLabel: string; // citation, e.g. "via Wikipedia pageviews"
  raw?: unknown[]; // a few raw rows for synthesis context
}

export interface ChartSpec {
  type: "line" | "bar";
  xLabel: string;
  yLabel: string;
  series: SeriesPoint[];
}

export interface AskResponse {
  answer: string;
  chart?: ChartSpec;
  sourceLabel: string;
}
