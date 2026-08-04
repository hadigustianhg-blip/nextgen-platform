import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "NEXTGEN Team" };

export default async function TeamComingSoonPage() {
  const team = await requireTeamContext();

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">NEXTGEN Team</p>
        <h1 className="mt-3 text-2xl font-extrabold text-slate-950">{team.employeeName}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-left text-sm">
          <div><dt className="text-slate-500">Outlet</dt><dd className="font-bold text-slate-900">{team.outletCode}</dd></div>
          <div><dt className="text-slate-500">Status akun</dt><dd className="font-bold text-emerald-700">Aktif</dd></div>
        </dl>
        <h2 className="mt-5 text-lg font-bold text-slate-950">Aplikasi Team sedang dipersiapkan.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">Akun Anda sudah siap. Fitur operasional Team/Kurir akan tersedia pada fase berikutnya.</p>
        <form action="/api/auth/logout" method="post" className="mt-6">
          <button className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">Keluar</button>
        </form>
      </section>
    </main>
  );
}
