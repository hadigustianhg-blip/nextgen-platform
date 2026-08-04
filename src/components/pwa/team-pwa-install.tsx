"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function isIosSafari() {
  const userAgent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
}

export function TeamPwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) return;
    queueMicrotask(() => setShowIosHelp(isIosSafari()));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const installed = () => { setPrompt(null); setShowIosHelp(false); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (dismissed || (!prompt && !showIosHelp)) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }

  return (
    <aside className="fixed inset-x-3 bottom-[calc(5.1rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-[22px] border border-blue-100 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]" aria-label="Instal NEXTGEN Team">
      <button type="button" onClick={() => setDismissed(true)} aria-label="Tutup petunjuk instalasi" className="absolute right-2 top-2 grid size-11 place-items-center rounded-xl text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><X size={18} /></button>
      <div className="flex gap-3 pr-9">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">{prompt ? <Download size={21} /> : <Share size={21} />}</span>
        <div>
          <p className="text-sm font-extrabold text-slate-950">Pasang NEXTGEN Team</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{prompt ? "Akses lebih cepat dari layar utama HP Anda." : "Tekan tombol Share lalu pilih Add to Home Screen."}</p>
        </div>
      </div>
      {prompt && <button type="button" onClick={() => void install()} className="mt-3 min-h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-bold text-white active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Install Aplikasi</button>}
    </aside>
  );
}
