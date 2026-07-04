import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Toaster } from "@/components/ui";
import DashboardView from "@/components/dashboard/DashboardView";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fprojects");
  return (
    <>
      <DashboardView user={user} />
      <Toaster />
    </>
  );
}
