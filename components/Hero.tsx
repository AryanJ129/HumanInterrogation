"use client";

export default function Hero() {
  const scrollToGenerate = () => {
    document.getElementById("generate")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6">
      <h1 className="animate-fade-rise font-display text-5xl sm:text-7xl md:text-8xl leading-[0.95] tracking-[-2.46px] max-w-7xl font-normal">
        Where your brand{" "}
        <em className="not-italic text-muted-foreground">
          rises above the noise.
        </em>
      </h1>

      <p className="animate-fade-rise-delay text-muted-foreground text-base sm:text-lg max-w-2xl mt-8 leading-relaxed">
        Turn one product photo into an eight-second cinematic ad — a voice, a
        beat, and a hook that stops the scroll. Generated in minutes, not weeks.
      </p>

      <button
        type="button"
        onClick={scrollToGenerate}
        className="animate-fade-rise-delay-2 liquid-glass rounded-full px-14 py-5 text-base text-foreground mt-12 hover:scale-[1.03] transition-transform cursor-pointer"
      >
        Make your first ad
      </button>
    </section>
  );
}
