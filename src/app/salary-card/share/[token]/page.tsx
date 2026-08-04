import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { SalaryRecapPublicCard } from "@/components/finance/salary-recap-public-card";
import { getAnySession, isTeamSession } from "@/lib/auth/session";
import {
  getPublicSalaryCardByToken,
} from "@/modules/salary/salary.publication-share.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Slip Gaji",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicSalaryCardPage({ params }: {
  params: Promise<{ token: string }>;
}) {
  noStore();
  const session = await getAnySession();
  if (session && isTeamSession(session)) redirect("/team");
  const { token } = await params;
  const publication = await getPublicSalaryCardByToken(token)
    .catch(() => notFound());
  return <SalaryRecapPublicCard publication={publication}/>;
}
