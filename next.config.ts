import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Standalone output produces a minimal server bundle for the Cloud Run image.
  output: "standalone",
  // Custom in-memory cache handler with NO 2MB size cap. The default Next.js data
  // cache silently drops entries over 2MB, which broke `unstable_cache` for our
  // large analytics payloads (dashboard ~2.3MB, movements ~3.3MB) — so every
  // request re-ran BigQuery. The service runs as a single instance (min/max=1),
  // so an in-memory cache is shared across requests. See cache-handler.js.
  cacheHandler: path.resolve("./cache-handler.js"),
  cacheMaxMemorySize: 0, // disable the default in-memory cache; our handler replaces it
  // The BigQuery and Prisma SDKs are server-only; keep them out of the client bundle.
  serverExternalPackages: ["@google-cloud/bigquery", "@prisma/client", "prisma"],
  typescript: {
    // We run `tsc --noEmit` in CI / `npm run typecheck`; never silently ignore here.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
