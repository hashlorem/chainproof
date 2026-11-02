import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "ChainProof",
  description: "Tamper-evident digital evidence: signed capture, chain of custody and photo forensics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Applies a saved light theme before the first paint, so the page doesn't flash dark. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('chainproof-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}" }} />
      </head>
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
