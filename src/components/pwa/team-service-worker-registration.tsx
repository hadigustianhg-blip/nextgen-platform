"use client";

import { useEffect } from "react";

export function TeamServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/team/" }).catch(() => undefined);
  }, []);
  return null;
}
