"use client";

import { useEffect, useState } from "react";

interface AnswerProps {
  answer: string;
  sourceLabel: string;
}

export default function Answer({ answer, sourceLabel }: AnswerProps) {
  const [shown, setShown] = useState<number>(0);

  useEffect(() => {
    setShown(0);

    if (answer.length === 0) {
      return;
    }

    const step = Math.max(1, Math.ceil(answer.length / 80));
    const interval = setInterval(() => {
      setShown((prev) => {
        const next = prev + step;
        if (next >= answer.length) {
          clearInterval(interval);
          return answer.length;
        }
        return next;
      });
    }, 25);

    return () => {
      clearInterval(interval);
    };
  }, [answer]);

  const isTyping = shown < answer.length;
  const visible = answer.slice(0, shown);

  return (
    <div>
      <p className="text-fg text-base sm:text-lg leading-relaxed text-left whitespace-pre-wrap">
        {visible}
        {isTyping ? (
          <span className="inline-block w-2 h-4 bg-accent animate-blink align-middle" />
        ) : null}
      </p>
      {!isTyping ? (
        <p className="text-muted text-xs sm:text-sm animate-fade-rise mt-3">
          {sourceLabel}
        </p>
      ) : null}
    </div>
  );
}
