import type { Metadata, Viewport } from "next";
import { Bungee, JetBrains_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

/*
 * Fonts are fetched at BUILD time and served from this origin, so a running
 * instance makes no third-party request.
 */
/*
 * Bungee for display. It is a signage face — blocky, all-caps, built for
 * posters — and it is the closest thing on a font CDN to a comic title card.
 * Used only for headings and panel labels: the console has to stay readable
 * under the costume, so Public Sans carries every sentence and every number.
 */
const display = Bungee({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bungee",
  display: "swap",
});

const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-web",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ring Sentinel - graph-based return-abuse detection",
  description:
    "Builds an entity graph from commerce activity, finds coordinated return-abuse clusters, scores them against a published weight table, and hands an investigator a decomposed answer. It never acts against a customer.",
};

export const viewport: Viewport = {
  themeColor: "#05060d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
