import { Suspense } from "react";
import StudyWorkspace from "../study-workspace";

export const dynamic = "force-dynamic";

export default function StudyCreatePage() {
  return (
    <Suspense fallback={null}>
      <StudyWorkspace />
    </Suspense>
  );
}
