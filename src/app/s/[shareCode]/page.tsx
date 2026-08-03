import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { SalaryRecapPublicCard } from "@/components/finance/salary-recap-public-card";
import {
  getPublicSalaryCardByShareCode,
} from "@/modules/salary/salary.publication-share.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Slip Gaji",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ShortSalaryCardPage({ params }: {
  params: Promise<{ shareCode: string }>;
}) {
  noStore();
  const { shareCode } = await params;
  const publication = await getPublicSalaryCardByShareCode(shareCode)
    .catch(() => null);
  if (!publication) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Link Slip Gaji sudah tidak berlaku.</h1>
        <p className="mt-2 text-sm text-slate-600">
          Silakan hubungi admin outlet untuk memperoleh tautan terbaru.
        </p>
      </section>
    </main>;
  }
  return <SalaryRecapPublicCard publication={publication}/>;
}
