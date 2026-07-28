import { redirect } from "next/navigation";

export default function LegacyMasterPickupPage() {
  redirect("/dashboard/settlement/pickup");
}
