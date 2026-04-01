import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { Analytics } from "@vercel/analytics/next";

const AiChatSheet = dynamic(
  () => import("@/components/AiChatSheet").then((module) => module.AiChatSheet)
);

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrAIner - Personal Trainer & Nutrizionista AI",
  description: "Web app mobile-first per allenamento e nutrizione con AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen text-foreground`}>
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-primary/18 blur-3xl" />
          <div className="absolute top-28 -right-28 h-72 w-72 rounded-full bg-info/12 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl justify-center md:px-4 md:py-5">
          <div className="relative flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border border-border/80 bg-card/95 backdrop-blur-sm md:h-[calc(100dvh-2.5rem)] md:rounded-[2rem] md:shadow-[0_25px_60px_-26px_rgba(15,40,28,0.45)]">
            <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
              {children}
            </div>
            <BottomNav />
            <AiChatSheet />
          </div>
        </div>

        <Analytics />
      </body>
    </html>
  );
}
