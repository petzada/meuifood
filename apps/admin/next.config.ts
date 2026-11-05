import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@foode/shared", "@foode/ui"],
  // Foto do Cardápio sobe pelos bytes numa server action (decisão 64): 5 MiB + envelope.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;

// `next dev` com os bindings do wrangler.jsonc (getCloudflareContext).
void initOpenNextCloudflareForDev();
