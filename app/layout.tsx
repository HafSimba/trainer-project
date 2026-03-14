import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AiChatSheet } from "@/components/AiChatSheet";
import { NextAuthProvider } from "@/components/NextAuthProvider";

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100 flex justify-center min-h-screen`}
      >
        <NextAuthProvider>
          <div className="w-full max-w-md bg-white min-h-[100dvh] relative shadow-2xl overflow-x-hidden flex flex-col">
            {children}
            <AiChatSheet />
          </div>
        </NextAuthProvider>
      </body>
    </html>
  );
}
