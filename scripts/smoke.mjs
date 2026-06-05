// Phase 0 proof: planner JSON call -> real GDELT fetch -> synthesis call.
// Run from the project root: node scripts/smoke.mjs
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";

const env = fs.readFileSync(".env.local", "utf8");
const apiKey = env.match(/GEMINI_API_KEY=(.+)/)[1].trim();
const ai = new GoogleGenAI({ apiKey });
let MODEL = "gemini-2.5-flash";

// Free tier throws transient 503s under load — retry, then fall back to flash-lite.
async function gen(req) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await ai.models.generateContent({ ...req, model: MODEL });
    } catch (err) {
      const transient = err?.status === 503 || err?.status === 429;
      if (!transient || attempt === 4) throw err;
      if (attempt === 3 && MODEL === "gemini-2.5-flash") {
        MODEL = "gemini-2.5-flash-lite";
        console.log("   (falling back to", MODEL + ")");
      }
      console.log(`   (attempt ${attempt} got ${err.status}, retrying in 4s)`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

// 1. planner-style JSON call
const plan = await gen({
  contents:
    'Pick a tool for the question "How has the mood on artificial intelligence shifted?". Respond ONLY with JSON like {"tool":"gdelt_tone","query":"artificial intelligence","timespan":"3m"}.',
  config: { responseMimeType: "application/json" },
});
console.log("1. PLAN:", plan.text);

// 2. real GDELT fetch
const gdeltUrl =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
  encodeURIComponent('"artificial intelligence"') +
  "&mode=timelinetone&format=json&timespan=3m";
let gdata;
let gres;
for (let i = 1; i <= 4; i++) {
  gres = await fetch(gdeltUrl, { signal: AbortSignal.timeout(20000) });
  const gtext = await gres.text();
  try {
    gdata = JSON.parse(gtext);
    break;
  } catch {
    // GDELT rate-limits to 1 req / 5s per IP and answers in PLAIN TEXT.
    console.log(`   (gdelt non-JSON reply, attempt ${i}: ${gtext.slice(0, 60)}…)`);
    if (i === 4) throw new Error("GDELT kept rate-limiting");
    await new Promise((r) => setTimeout(r, 6500));
  }
}
const series = gdata.timeline?.[0]?.data ?? [];
console.log(
  `2. GDELT: ${gres.status}, ${series.length} points, first:`,
  JSON.stringify(series[0])
);

// 3. Wikimedia with User-Agent (403 check)
const d = new Date(Date.now() - 2 * 86400_000);
const y = d.getUTCFullYear(),
  m = String(d.getUTCMonth() + 1).padStart(2, "0"),
  day = String(d.getUTCDate()).padStart(2, "0");
const wres = await fetch(
  `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia.org/all-access/${y}/${m}/${day}`,
  { headers: { "User-Agent": "AUGUR/1.0 (hackathon demo)" } }
);
const wdata = await wres.json();
console.log(
  `3. WIKI TOP: ${wres.status}, first article:`,
  wdata.items?.[0]?.articles?.[1]?.article
);

// 4. synthesis-style JSON call with the real data
const sample = series.slice(0, 30).map((p) => ({ x: p.date, y: p.value }));
const synth = await gen({
  contents:
    'Question: "How has the mood on artificial intelligence shifted?" Data (avg global news tone, -10..+10): ' +
    JSON.stringify(sample) +
    ' Respond ONLY with JSON {"answer":"2-4 sentences citing a number","chart":{"type":"line","xLabel":"date","yLabel":"tone","series":[{"x":"...","y":0}]}}.',
  config: { responseMimeType: "application/json" },
});
const parsed = JSON.parse(synth.text);
console.log("4. ANSWER:", parsed.answer);
console.log(
  `4. CHART: type=${parsed.chart?.type}, ${parsed.chart?.series?.length} points`
);
console.log("SMOKE_OK");
