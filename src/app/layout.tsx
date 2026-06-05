import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { MuiProviders } from "@/theme/Providers";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Absolute base for OG/Twitter image URLs so shared links resolve correctly.
// Override per-environment with NEXT_PUBLIC_APP_URL; falls back to the Cloud Run URL.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://warehouse-505424789443.us-central1.run.app";

const TAGLINE =
  "Multi-tenant warehouse management — transactional ops, BigQuery analytics, and permission-based RBAC.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  // Per-page titles render as "Analytics · FSE Warehouse"; the default is the full lockup.
  title: {
    default: "FSE Warehouse — Operations Platform",
    template: "%s · FSE Warehouse",
  },
  description: TAGLINE,
  applicationName: "FSE Warehouse",
  keywords: [
    "warehouse management",
    "inventory",
    "stock movements",
    "multi-tenant",
    "RBAC",
    "analytics",
    "BigQuery",
  ],
  // The opengraph-image.tsx / twitter-image.tsx routes auto-populate the images.
  openGraph: {
    type: "website",
    siteName: "FSE Warehouse",
    title: "FSE Warehouse — Operations Platform",
    description: TAGLINE,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "FSE Warehouse — Operations Platform",
    description: TAGLINE,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // AuthKitProvider enables client-side WorkOS session refresh. We only mount it
  // in workos mode so dev-auth mode never loads WorkOS client code.
  const inner =
    process.env.AUTH_MODE === "workos" ? (
      <AuthKitProvider>{children}</AuthKitProvider>
    ) : (
      children
    );
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen antialiased">
        <MuiProviders>{inner}</MuiProviders>
      </body>
    </html>
  );
}
