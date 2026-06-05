"use client";

import { useEffect, useState } from "react";

// The "?" button (top right) and the slide-in sidebar explaining AUGUR.
export default function AboutPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="What is AUGUR?"
        className="fixed top-5 right-5 sm:top-6 sm:right-8 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-fg hover:border-accent/60 cursor-pointer"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 right-0 z-50 h-full w-[85vw] max-w-sm overflow-y-auto border-l border-border bg-surface p-6 sm:p-8 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-fg hover:border-accent/60 cursor-pointer"
        >
          ×
        </button>

        <h2 className="font-display text-3xl">What is AUGUR?</h2>

        <div className="mt-6 flex flex-col gap-5 text-sm leading-relaxed text-fg">
          <p>
            AUGUR answers questions about what humanity is paying attention to
            — from live public data, not a model&apos;s memory.
          </p>

          <div>
            <p className="text-muted mb-2">How it works</p>
            <ol className="flex flex-col gap-1.5 list-decimal list-inside">
              <li>Your question is routed to the right dataset.</li>
              <li>Real numbers are fetched, live.</li>
              <li>The answer is written from those numbers.</li>
            </ol>
          </div>

          <div>
            <p className="text-muted mb-2">Where the data comes from</p>
            <ul className="flex flex-col gap-1.5">
              <li>
                <span className="text-accent">·</span> Wikipedia pageviews —
                what the world is reading
              </li>
              <li>
                <span className="text-accent">·</span> GDELT global news — how
                loudly and how warmly topics are covered
              </li>
              <li>
                <span className="text-accent">·</span> Hacker News — the tech
                community&apos;s pulse
              </li>
            </ul>
          </div>

          <p className="text-muted">
            The chart under every answer is the proof — it plots the actual
            numbers the answer was written from.
          </p>
        </div>
      </aside>
    </>
  );
}
