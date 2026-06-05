import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HeroVideo from "@/components/HeroVideo";
import Generator from "@/components/Generator";
import Examples from "@/components/Examples";

export default function Home() {
  return (
    <main>
      <div className="relative overflow-hidden">
        <HeroVideo />
        <Nav />
        <Hero />
      </div>
      <Generator />
      <Examples />
    </main>
  );
}
