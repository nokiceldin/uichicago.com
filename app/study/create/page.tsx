import { Suspense } from "react";
import StudyWorkspace from "../study-workspace";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export const dynamic = "force-dynamic";

export default async function StudyCreatePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/study/create");
  }

  return (
    <Suspense fallback={null}>
      <StudyWorkspace />
    </Suspense>
  );
}
