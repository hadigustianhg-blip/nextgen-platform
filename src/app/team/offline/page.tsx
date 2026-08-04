import { WifiOff } from "lucide-react";
import Link from "next/link";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Offline" };

export default async function TeamOfflinePage() {
  await requireTeamContext();
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-7 text-center shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
      <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-slate-100 text-slate-600"><WifiOff size={30} /></span>
      <h1 className="mt-5 text-2xl font-black text-slate-950">Anda sedang offline</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Hubungkan kembali internet untuk menggunakan Attendance dan data Team.</p>
      <Link href="/team" className="mt-5 flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">Coba Lagi</Link>
    </section>
  );
}
