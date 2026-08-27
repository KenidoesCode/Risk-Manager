import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/*
 * Fonts are fetched at BUILD time and served from this origin, so a running
 * instance makes no third-party request.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
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
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
