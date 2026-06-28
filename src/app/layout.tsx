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
  title: "Miror — Command Module for Local Dev",
  description:
    "Miror is a cross-platform desktop control tower for managing multiple projects and their services from a single unified panel.",
  keywords: [
    "Miror", "developer tools", "process manager", "Tauri",
    "Next.js", "dev workspace", "dashboard", "control tower", "command module",
  ],
  authors: [{ name: "Miror" }],
  icons: {
    icon: [
      { url: "/miror-favicon.svg", type: "image/svg+xml" },
      { url: "/miror-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/miror-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/miror-icon-32.png",
    apple: "/miror-icon-512.png",
  },
  openGraph: {
    title: "Miror — Command Module for Local Dev",
    description: "Cross-platform desktop control tower for managing multiple projects and their services.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Miror — Command Module for Local Dev",
    description: "Cross-platform desktop control tower for managing multiple projects and their services.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/miror-favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/miror-icon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/miror-icon-512.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
