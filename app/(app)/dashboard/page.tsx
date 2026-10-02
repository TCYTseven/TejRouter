import { redirect } from "next/navigation";

/** The old dashboard repeated the landing page; Compare is the app's home now. */
export default function DashboardPage() {
  redirect("/playground");
}
