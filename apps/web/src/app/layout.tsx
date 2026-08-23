import type { Metadata } from "next";
import { getConfiguredSiteOrigin } from "../lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getConfiguredSiteOrigin(),
  title: {
    default: "DevStride | Practice with purpose",
    template: "%s | DevStride",
  },
  description: "Practice engineering conversations, interviews, and problem-solving with AI guidance that adapts to your goals.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "DevStride | Practice with purpose",
    description: "A focused practice environment for software engineers to learn, communicate, prepare, and grow.",
    type: "website",
    siteName: "DevStride",
  },
  twitter: {
    card: "summary",
    title: "DevStride | Practice with purpose",
    description: "Practice engineering conversations, interviews, and problem-solving with AI guidance.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
