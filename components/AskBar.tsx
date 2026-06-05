"use client";

import { useState, type FormEvent } from "react";

export default function AskBar({
  onSubmit,
  disabled,
}: {
  onSubmit: (q: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Ask the world…"
        className="flex-1 bg-surface border border-border rounded-lg px-4 py-3.5 text-fg placeholder:text-muted outline-none focus:border-accent/60 transition-colors disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={disabled}
        className="bg-accent text-fg rounded-lg px-5 py-3.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
      >
        Ask
      </button>
    </form>
  );
}
