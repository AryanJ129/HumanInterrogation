"use client";

import { useState } from "react";

type Sample = {
  id: string;
  src: string;
  alt: string;
};

// Placeholder stills for now — swapped for real generated clips later.
const SAMPLES: readonly Sample[] = [
  { id: "sample-1", src: "/samples/sample-1.jpg", alt: "Sample ad still" },
  { id: "sample-2", src: "/samples/sample-2.jpg", alt: "Sample ad still" },
];

export default function Examples() {
  const [errored, setErrored] = useState<Record<string, boolean>>({});

  const visible = SAMPLES.filter((sample) => !errored[sample.id]);

  return (
    <section id="examples" className="relative z-10 bg-background px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl sm:text-4xl">Examples</h2>
        <p className="mt-3 text-muted-foreground">
          Sample stills — full clips with sound land here soon.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="mx-auto mt-10 max-w-2xl text-center text-muted-foreground">
          Sample ads land here soon.
        </p>
      ) : (
        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
          {visible.map((sample) => (
            <div
              key={sample.id}
              className="liquid-glass relative block w-full rounded-3xl p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sample.src}
                alt={sample.alt}
                loading="lazy"
                onError={() =>
                  setErrored((prev) => ({ ...prev, [sample.id]: true }))
                }
                className="w-full aspect-[9/16] rounded-2xl bg-black object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
