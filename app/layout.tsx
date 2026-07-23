import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Duo — Midnight Lounge for Couples",
  description:
    "Ephemeral long-distance date rooms: WebRTC video, YouTube co-watch, dinner prompts, mini-games, and voice audio ducking.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://justduo.vercel.app",
  ),
  openGraph: {
    title: "Duo — Midnight Lounge for Couples",
    description:
      "Ephemeral long-distance date rooms with WebRTC video, YouTube co-watch, games, and voice audio ducking.",
    url: "https://justduo.vercel.app",
    siteName: "Duo",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Duo — Midnight Lounge for Long-Distance Couples",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Duo — Midnight Lounge for Couples",
    description:
      "Ephemeral long-distance date rooms with WebRTC video, YouTube co-watch, games, and voice audio ducking.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0B10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-dvh`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
