import { Suspense } from "react";
import StudyWorkspace from "../../study-workspace";

export default async function StudySetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <StudyWorkspace forcedSetId={decodeURIComponent(id)} standaloneSetView />
    </Suspense>
  );
}
