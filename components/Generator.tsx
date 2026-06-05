"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type GenState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "polling"; operationName: string }
  | { status: "done"; videoUri: string }
  | { status: "error"; message: string }
  | { status: "timeout" };

interface ProductImage {
  /** RAW base64 (no `data:` prefix). */
  base64: string;
  /** Always "image/jpeg" — we re-encode on the client. */
  mimeType: string;
  /** Full data URL, kept only for the on-screen preview. */
  previewUrl: string;
}

const POLL_INTERVAL_MS = 8_000;
const MAX_POLL_MS = 5 * 60 * 1_000; // 5 minutes
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Downscale an image file to a JPEG within MAX_DIMENSION on the longest side. */
function downscaleImage(file: File): Promise<ProductImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { width, height } = img;
      const longest = Math.max(width, height);
      const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not process that image."));
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex === -1) {
        reject(new Error("Could not process that image."));
        return;
      }
      const base64 = dataUrl.slice(commaIndex + 1);
      resolve({ base64, mimeType: "image/jpeg", previewUrl: dataUrl });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };

    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Generator() {
  const [state, setState] = useState<GenState>({ status: "idle" });
  const [hook, setHook] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [image, setImage] = useState<ProductImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Clean up every timer on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  const fail = useCallback(
    (message: string) => {
      clearTimers();
      setState({ status: "error", message });
      toast.error(message);
    },
    [clearTimers]
  );

  const reset = useCallback(() => {
    clearTimers();
    setState({ status: "idle" });
    setElapsedSeconds(0);
  }, [clearTimers]);

  // -------------------------------------------------------------------------
  // Image handling
  // -------------------------------------------------------------------------

  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Use a JPEG, PNG, or WEBP image.");
      return;
    }
    try {
      const processed = await downscaleImage(file);
      setImage(processed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not process that image.";
      toast.error(message);
    }
  }, []);

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleFile(file);
      // Allow re-selecting the same file later.
      event.target.value = "";
    },
    [handleFile]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const removeImage = useCallback(() => setImage(null), []);

  // -------------------------------------------------------------------------
  // Polling
  // -------------------------------------------------------------------------

  const pollOnce = useCallback(
    async (operationName: string) => {
      try {
        const res = await fetch(
          `/api/status?op=${encodeURIComponent(operationName)}`
        );
        const data = (await res.json()) as {
          done: boolean;
          videoUri?: string;
          error?: string;
        };

        if (!res.ok || data.error) {
          fail(data.error ?? "Something went wrong while checking status.");
          return;
        }
        if (data.done) {
          if (data.videoUri) {
            clearTimers();
            setState({ status: "done", videoUri: data.videoUri });
          } else {
            fail("Generation finished but no video came back. Try again.");
          }
        }
        // Not done yet — keep polling.
      } catch {
        fail("Lost connection while checking status. Try again.");
      }
    },
    [clearTimers, fail]
  );

  const startPolling = useCallback(
    (operationName: string) => {
      setState({ status: "polling", operationName });
      setElapsedSeconds(0);

      const startedAt = Date.now();
      tickIntervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
      }, 1_000);

      pollIntervalRef.current = setInterval(() => {
        void pollOnce(operationName);
      }, POLL_INTERVAL_MS);

      timeoutRef.current = setTimeout(() => {
        clearTimers();
        setState({ status: "timeout" });
      }, MAX_POLL_MS);

      // Kick off an immediate first poll so we don't wait a full interval.
      void pollOnce(operationName);
    },
    [clearTimers, pollOnce]
  );

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedHook = hook.trim();
      if (!trimmedHook) return;

      setState({ status: "submitting" });

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hook: trimmedHook,
            productDesc: productDesc.trim() || undefined,
            imageBase64: image?.base64,
            mimeType: image?.mimeType,
          }),
        });
        const data = (await res.json()) as {
          operationName?: string;
          error?: string;
        };

        if (!res.ok || data.error || !data.operationName) {
          fail(data.error ?? "Could not start generation. Try again.");
          return;
        }
        startPolling(data.operationName);
      } catch {
        fail("Could not reach the server. Check your connection and retry.");
      }
    },
    [hook, productDesc, image, fail, startPolling]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isBusy = state.status === "submitting" || state.status === "polling";
  const submitDisabled = isBusy || hook.trim().length === 0;

  return (
    <section
      id="generate"
      className="relative z-10 bg-background px-6 py-24"
    >
      <div className="mx-auto w-full max-w-2xl liquid-glass rounded-3xl p-6 sm:p-10">
        <h2 className="font-display text-3xl sm:text-4xl text-foreground">
          Make your ad
        </h2>

        {state.status === "done" ? (
          <Result videoUri={state.videoUri} onReset={reset} />
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
            {/* Optional product-image dropzone */}
            <div>
              {image ? (
                <div className="flex items-center gap-4 rounded-2xl border border-border p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.previewUrl}
                    alt="Product preview"
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  <span className="flex-1 text-sm text-muted-foreground">
                    Photo attached.
                  </span>
                  <button
                    type="button"
                    onClick={removeImage}
                    aria-label="Remove image"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`flex min-h-24 cursor-pointer items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground transition-colors ${
                    isDragging
                      ? "border-foreground/60 bg-input/30"
                      : "border-border"
                  }`}
                >
                  Drop a product photo, or browse. Optional.
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onInputChange}
                className="hidden"
              />
            </div>

            {/* Required hook */}
            <input
              type="text"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              maxLength={160}
              required
              placeholder="Your hook — one spoken line, under 12 words"
              className="w-full rounded-xl border border-border bg-input/30 px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-foreground/20"
            />

            {/* Optional product description */}
            <input
              type="text"
              value={productDesc}
              onChange={(e) => setProductDesc(e.target.value)}
              maxLength={200}
              placeholder="What is the product? (optional)"
              className="w-full rounded-xl border border-border bg-input/30 px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-foreground/20"
            />

            {/* Submit + progress */}
            <div className="flex flex-col items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={submitDisabled}
                className="liquid-glass rounded-full px-10 py-4 text-base text-foreground transition-transform hover:scale-[1.03] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {isBusy ? "Generating…" : "Generate"}
              </button>

              {state.status === "polling" && (
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-foreground" />
                    <span>Generating your ad… {formatElapsed(elapsedSeconds)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Usually takes 1–3 minutes.
                  </p>
                </div>
              )}

              {state.status === "submitting" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-foreground" />
                  <span>Starting…</span>
                </div>
              )}

              {state.status === "error" && (
                <p className="text-sm text-foreground/90 text-center">
                  {state.message}
                </p>
              )}

              {state.status === "timeout" && (
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-sm text-foreground/90">
                    Took too long. Try again.
                  </p>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Result subview
// ---------------------------------------------------------------------------

function Result({
  videoUri,
  onReset,
}: {
  videoUri: string;
  onReset: () => void;
}) {
  const playbackUrl = `/api/video?uri=${encodeURIComponent(videoUri)}`;
  const downloadUrl = `${playbackUrl}&download=1`;

  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground">Sound on — tap play.</p>
      <video
        controls
        loop
        playsInline
        src={playbackUrl}
        className="w-full max-w-xs mx-auto aspect-[9/16] rounded-2xl bg-black"
      />
      <div className="flex items-center gap-5 pt-1">
        <a
          href={downloadUrl}
          className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground"
        >
          Download
        </a>
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          Make another
        </button>
      </div>
    </div>
  );
}
