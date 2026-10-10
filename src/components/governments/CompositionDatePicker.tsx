import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Date of the composition, as a plain GET form: works without JavaScript and keeps the date in
 * the URL (`?date=YYYY-MM-DD`). Bounds come from the consultable period.
 */
export function CompositionDatePicker({
  action,
  date,
  min,
  max,
  label,
}: {
  action: string;
  date: string;
  min: string;
  max: string;
  label: string;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="composition-date" className="font-display text-[17px] font-bold">
          {label}
        </label>
        <div className="relative">
          <CalendarDays
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="composition-date"
            type="date"
            name="date"
            defaultValue={date}
            min={min}
            max={max}
            required
            className="h-11 min-w-[220px] rounded-[10px] border border-input bg-background pl-9 pr-3 text-sm"
          />
        </div>
      </div>
      <Button type="submit" variant="outline" className="min-h-11">
        Afficher
      </Button>
    </form>
  );
}
