import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { Curtain } from "@/ui/curtain";

/*
 * Two families, six files, fetched at BUILD time and served from this origin.
 * A running instance makes no third-party request.
 *
 * Archivo is a grotesque drawn for print signage, and it holds its counters
 * at 900 in tight uppercase, which is what display lettering on a comic page
 * needs and what most grotesques fall apart doing. Set at 900 for every
 * heading and at 400 for everything a person actually reads.
 *
 * JetBrains Mono carries identifiers, densities and every column of figures,
 * with tabular numerals so scores line up down a table.
 */
const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ring Sentinel - graph-based return-abuse detection",
  description:
    "Builds an entity graph from commerce activity, finds coordinated return-abuse clusters, scores them against a published weight table, and hands an investigator a decomposed answer. It never acts against a customer.",
};

export const viewport: Viewport = {
  themeColor: "#ece2cf",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Curtain />
        {children}
      </body>
    </html>
  );
}
