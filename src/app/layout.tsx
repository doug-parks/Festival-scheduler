import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fest Planner — MDF 2026",
    template: "%s · Fest Planner",
  },
  description:
    "Pick the bands you're seeing at Maryland Deathfest 2026 in Baltimore. See where your friends overlap.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Toaster
          position="bottom-center"
          theme="dark"
          expand
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
