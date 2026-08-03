import { redirect } from "next/navigation";
import { getAnySession, isTeamSession } from "@/lib/auth/session";

export const metadata = { title: "NEXTGEN Team" };

export default async function TeamComingSoonPage() {
  const session = await getAnySession();
  if (!session) redirect("/login");
  if (!isTeamSession(session)) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">NEXTGEN Team</p>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-950">Aplikasi Team sedang dipersiapkan.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Akun Anda sudah siap. Fitur operasional Team/Kurir akan tersedia pada fase berikutnya.</p>
        <form action="/api/auth/logout" method="post" className="mt-6">
          <button className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Keluar</button>
        </form>
      </section>
    </main>
  );
}
