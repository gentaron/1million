import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1億の観測者 — Agent Observer",
  description: "1 億体の 0 次元エージェントが curl-noise 位相空間で創発する世界を観測する WebGL2 GPGPU 装置。",
  keywords: ["agents", "GPGPU", "WebGL2", "simulation", "emergence", "curl noise", "1億"],
  authors: [{ name: "gentaron" }],
  openGraph: {
    title: "1億の観測者 — Agent Observer",
    description: "1 億体の 0 次元エージェントが創発する世界を観測する。",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "1億の観測者",
    description: "1 億体の 0 次元エージェントが創発する世界を観測する。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white`}
        style={{ overflow: "hidden" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
