import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "AUGUR — interrogate the world",
  description:
    "Ask what humanity is reading, or how it feels about anything. Answered from live public data, with the numbers to prove it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexMono.variable} ${instrumentSerif.variable}`}>
      <body className="antialiased">
        {children}
        <Toaster theme="dark" position="bottom-center" />
      </body>
    </html>
  );
}
