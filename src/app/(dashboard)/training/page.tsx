import type { Metadata } from "next";
import { loadTrainingHub } from "@/lib/api/training";
import { TrainingHub } from "@/components/training/TrainingHub";

export const metadata: Metadata = { title: "Schulungen" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadTrainingHub();
  return (
    <TrainingHub
      myEmployeeId={data.myEmployeeId}
      canManage={data.canManage}
      modules={data.modules}
      progress={data.progress}
      assignmentsByModule={data.assignmentsByModule}
      employees={data.employees}
    />
  );
}
