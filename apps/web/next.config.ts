import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source (same code the phone app uses).
  transpilePackages: ["@chainproof/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
