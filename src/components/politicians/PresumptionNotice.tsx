import { Info } from "lucide-react";
import { buildPresumptionNote } from "@/lib/politicians/presumption";

export function PresumptionNotice({
  proceduresEnCours,
  condamnationsNonDefinitives,
}: {
  proceduresEnCours: number;
  condamnationsNonDefinitives: number;
}) {
  const note = buildPresumptionNote({ proceduresEnCours, condamnationsNonDefinitives });
  if (!note) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden={true} />
      <p>{note}</p>
    </div>
  );
}
