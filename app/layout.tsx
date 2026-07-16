import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// IBM Plex — engineered for a technology brand; Sans carries the UI, Mono
// carries data/coordinates/metrics. Self-hosted by next/font (no runtime CDN).
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CamDetec — Pest Monitoring Console",
  description:
    "In-browser camera monitoring for pest & wildlife activity. Tracks movement, maps where pests enter and loiter, and suggests where to place traps. Nothing leaves your device.",
};

export const viewport: Viewport = {
  themeColor: "#0e1315",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
