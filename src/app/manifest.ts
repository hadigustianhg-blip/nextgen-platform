import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEXTGEN Team",
    short_name: "NEXTGEN Team",
    description: "Aplikasi operasional Team NEXTGEN",
    start_url: "/team",
    scope: "/team",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f7fb",
    theme_color: "#0f2b5b",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
