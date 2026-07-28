import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@foode/shared", "@foode/ui"],
};

export default nextConfig;
