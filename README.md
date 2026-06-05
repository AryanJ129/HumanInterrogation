# AUGUR — interrogate the world

Ask a natural-language question about what humanity is paying attention to — or how it feels about something. Gemini routes it to a live free public dataset, the backend pulls real numbers, and Gemini answers grounded in that data with a chart as proof.

The chart is the credibility: the answer comes from real signal, not the model's memory.

## Stack

- Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, Recharts
- `@google/genai` with `gemini-2.5-flash` — **free tier, zero billing anywhere**
- Data: Wikipedia pageviews, GDELT global news (tone + volume), Hacker News — all auth-free
- Stateless — no DB, one request → one answer

## How it works

`POST /api/ask` runs three steps server-side, returning in seconds:

1. **Plan** — Gemini (JSON mode) maps the question to a tool: `wiki_top`, `wiki_article`, `gdelt_tone`, `gdelt_volume`, or `hn`.
2. **Fetch** — the chosen public API is called server-side and normalized to `{points, label}`.
3. **Synthesize** — Gemini answers in 2–4 sentences grounded in the fetched numbers, plus a validated chart spec.

## Run it

```bash
npm install
cp .env.example .env.local   # then put your real key in .env.local
npm run dev
```

Free key (no card needed): https://aistudio.google.com/apikey

`GEMINI_API_KEY` is read only inside `/api/ask`. Never exposed client-side, never committed.

## Deploy

Vercel: set `GEMINI_API_KEY` in project env vars **before** the production deploy.

Host-portable — also deploys to Cloud Run with `gcloud run deploy --source .`.
