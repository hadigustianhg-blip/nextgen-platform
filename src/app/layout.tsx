import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEXTGEN Operations System", template: "%s | NEXTGEN" },
  description: "Platform operasional multi-outlet NEXTGEN.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/brand/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/brand/app-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/brand/app-icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/brand/favicon.png",
    apple: [{ url: "/brand/app-icon-192.png", sizes: "192x192" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
