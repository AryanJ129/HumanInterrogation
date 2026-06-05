"use client";

const QUESTIONS = [
  "What is the world reading about today?",
  'How has the mood on "artificial intelligence" shifted this year?',
  "How much is the world reading about Bitcoin lately?",
  'How loudly is the world covering "climate" right now?',
];

export default function ExampleChips({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {QUESTIONS.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          disabled={disabled}
          className="border border-border rounded-full px-3.5 py-1.5 text-xs sm:text-sm text-muted hover:text-fg hover:border-accent/60 transition-colors cursor-pointer disabled:opacity-40"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
