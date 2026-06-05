"use client";

import { useState } from "react";
import { toast } from "sonner";
import AboutPanel from "@/components/AboutPanel";
import AskBar from "@/components/AskBar";
import ExampleChips from "@/components/ExampleChips";
import Answer from "@/components/Answer";
import DataChart from "@/components/DataChart";
import type { AskResponse } from "@/lib/types";

type Status = "idle" | "loading" | "done" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function ask(question: string) {
    const q = question.trim();
    if (!q || status === "loading") return;
    setStatus("loading");
    setResult(null);
    setErrorMsg("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as AskResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Request failed (${res.status}).`);
      }
      setResult(data);
      setStatus("done");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setErrorMsg(message);
      setStatus("error");
      toast.error(message);
    }
  }

  const asked = status !== "idle";

  return (
    <main className="relative min-h-screen flex flex-col items-center px-5 sm:px-6 py-12 sm:py-20">
      <header className="absolute top-0 left-0 px-5 sm:px-8 py-5 sm:py-6">
        <span className="font-display text-2xl sm:text-3xl tracking-tight">
          AUGUR
        </span>
      </header>
      <AboutPanel />
      <div className="w-full max-w-3xl flex flex-col items-center">
        <h1
          className={`font-display text-center transition-all duration-500 ${
            asked
              ? "text-3xl sm:text-4xl"
              : "text-5xl sm:text-7xl mt-[12vh] sm:mt-[16vh]"
          }`}
        >
          Interrogate the world.
        </h1>
        {!asked && (
          <p className="mt-5 text-center text-muted text-sm sm:text-base max-w-xl leading-relaxed">
            Ask what humanity is reading, or how it feels about anything.
            Answered from live public data.
          </p>
        )}

        <div className="w-full mt-10">
          <AskBar onSubmit={ask} disabled={status === "loading"} />
        </div>
        <div className="mt-5 w-full">
          <ExampleChips onPick={ask} disabled={status === "loading"} />
        </div>

        <div className="w-full mt-12">
          {status === "loading" && (
            <p className="text-muted text-sm animate-pulse">
              <span className="text-accent">▋</span> interrogating sources…
            </p>
          )}

          {status === "error" && (
            <p className="text-sm leading-relaxed">
              <span className="text-accent">error:</span>{" "}
              <span className="text-muted">{errorMsg}</span>
            </p>
          )}

          {status === "done" && result && (
            <div className="flex flex-col gap-8">
              <Answer answer={result.answer} sourceLabel={result.sourceLabel} />
              {result.chart && <DataChart chart={result.chart} />}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
