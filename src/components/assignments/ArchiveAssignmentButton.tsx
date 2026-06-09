"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveAssignmentAction } from "@/app/actions/assignments";
import { routes } from "@/lib/constants/routes";

export function ArchiveAssignmentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleArchive() {
    start(async () => {
      const result = await archiveAssignmentAction(id);
      if (!result.ok) {
        toast.error(result.error);
        setConfirming(false);
        return;
      }
      toast.success("Auftrag archiviert.");
      router.replace(routes.assignments);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600">Wirklich archivieren?</span>
        <button
          type="button"
          onClick={handleArchive}
          disabled={pending}
          className="rounded-md bg-warning-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-warning-600 disabled:opacity-60"
        >
          {pending ? "…" : "Ja"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md border border-warning-300 px-4 py-2 text-sm font-medium text-warning-700 hover:bg-warning-50"
    >
      Archivieren
    </button>
  );
}
