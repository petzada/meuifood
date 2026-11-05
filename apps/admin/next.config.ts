import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@foode/shared", "@foode/ui"],
};

export default nextConfig;

// `next dev` com os bindings do wrangler.jsonc (getCloudflareContext).
void initOpenNextCloudflareForDev();
