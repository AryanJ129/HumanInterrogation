"use client";

// Decorative fullscreen background for the nav + hero. Distinct from the
// generated ad videos — never wire generator output into this element.
// Client component so React reliably applies `muted` before autoplay.
const HERO_VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4";

export default function HeroVideo() {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster="/hero-poster.jpg"
      src={HERO_VIDEO_SRC}
      className="absolute inset-0 w-full h-full object-cover z-0"
    />
  );
}
