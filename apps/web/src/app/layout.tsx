import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const display = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "ChainProof",
  description: "Tamper-evident digital evidence: signed capture, chain of custody and photo forensics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
