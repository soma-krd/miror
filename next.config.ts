import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone in dev — supports dynamic API routes (git, AI diagnose).
  // For Tauri packaging, change to "export" and move API routes to Rust.
  output: "standalone",
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
