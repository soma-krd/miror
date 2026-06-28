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
  title: "Mir — Command Module for Local Dev",
  description:
    "Mir is a cross-platform desktop control tower for managing multiple projects and their services from a single unified panel.",
  keywords: [
    "Mir", "developer tools", "process manager", "Tauri",
    "Next.js", "dev workspace", "dashboard", "control tower", "command module",
  ],
  authors: [{ name: "Mir" }],
  icons: {
    icon: "/mir-favicon.svg",
    shortcut: "/mir-favicon.svg",
    apple: "/mir-favicon.svg",
  },
  openGraph: {
    title: "Mir — Command Module for Local Dev",
    description: "Cross-platform desktop control tower for managing multiple projects and their services.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mir — Command Module for Local Dev",
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
        <link rel="icon" href="/mir-favicon.svg" type="image/svg+xml" />
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
