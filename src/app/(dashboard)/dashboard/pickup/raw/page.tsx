import { redirect } from "next/navigation";

export default function LegacyRawPickupPage() {
  redirect("/dashboard/settlement/pickup");
}
