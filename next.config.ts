import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces a minimal server bundle for the Cloud Run image.
  output: "standalone",
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
