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

export const metadata: Metadata = {
  title: "FSE Warehouse",
  description: "Multi-tenant warehouse management platform",
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
