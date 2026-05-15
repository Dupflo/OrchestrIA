import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Topbar from "@/components/Topbar";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OrchestrIA — Agentic OS",
  description: "Personal agentic operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`} style={{ background: "var(--bg)" }} suppressHydrationWarning>
      <body suppressHydrationWarning style={{ margin: 0, minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
        <Topbar />
        <div style={{ minHeight: "calc(100vh - 48px)" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
