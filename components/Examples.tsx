"use client";

import { useState } from "react";

type Sample = {
  id: string;
  src: string;
};

const SAMPLES: readonly Sample[] = [
  { id: "sample-1", src: "/samples/sample-1.mp4" },
  { id: "sample-2", src: "/samples/sample-2.mp4" },
];

function SampleVideo({
  src,
  onError,
}: {
  src: string;
  onError: () => void;
}) {
  const [muted, setMuted] = useState(true);

  return (
    <button
      type="button"
      onClick={() => setMuted((prev) => !prev)}
      className="liquid-glass group relative block w-full cursor-pointer rounded-3xl p-2 text-left"
      aria-label={muted ? "Unmute sample ad" : "Mute sample ad"}
    >
      <video
        src={src}
        loop
        muted={muted}
        autoPlay
        playsInline
        onError={onError}
        className="w-full aspect-[9/16] object-cover rounded-2xl bg-black"
      />
      <span className="liquid-glass pointer-events-none absolute bottom-3 left-3 rounded-full px-2 py-0.5 text-xs text-muted-foreground">
        {muted ? "muted" : "sound on"}
      </span>
    </button>
  );
}

export default function Examples() {
  const [errored, setErrored] = useState<Record<string, boolean>>({});

  const visible = SAMPLES.filter((sample) => !errored[sample.id]);

  return (
    <section
      id="examples"
      className="relative z-10 bg-background px-6 py-24"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl sm:text-4xl">Examples</h2>
        <p className="mt-3 text-muted-foreground">
          Ads generated with AdReel. Tap for sound.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="mx-auto mt-10 max-w-2xl text-center text-muted-foreground">
          Sample ads land here soon.
        </p>
      ) : (
        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
          {visible.map((sample) => (
            <SampleVideo
              key={sample.id}
              src={sample.src}
              onError={() =>
                setErrored((prev) => ({ ...prev, [sample.id]: true }))
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
