import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import PreviewShell from "@/components/preview/PreviewShell";

export const metadata: Metadata = { title: "Preview" };

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // Middleware already guards this route; the session read keeps the page
  // dynamic and lets the client shell handle any 401 from the API.
  await getSessionUser();
  return <PreviewShell projectId={projectId} />;
}
