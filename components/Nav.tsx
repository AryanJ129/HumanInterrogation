"use client";

export default function Nav() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="relative z-10">
      <div className="flex justify-between items-center px-8 py-6 max-w-7xl mx-auto">
        <a
          href="#"
          className="font-display text-3xl tracking-tight text-foreground"
        >
          AdReel<sup className="text-xs">®</sup>
        </a>

        <nav className="hidden md:flex gap-8">
          <a
            href="#"
            className="text-sm text-foreground transition-colors"
          >
            Home
          </a>
          <button
            type="button"
            onClick={() => scrollTo("generate")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Generate
          </button>
          <button
            type="button"
            onClick={() => scrollTo("examples")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Examples
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Pricing
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Contact
          </button>
        </nav>

        <button
          type="button"
          onClick={() => scrollTo("generate")}
          className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground hover:scale-[1.03] transition-transform cursor-pointer"
        >
          Make your first ad
        </button>
      </div>
    </header>
  );
}
