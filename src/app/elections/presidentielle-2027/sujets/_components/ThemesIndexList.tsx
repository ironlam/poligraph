import Link from "next/link";
import type { ThemesIndexData } from "@/lib/data/themes-index";
import { THEME_CATEGORY_COLORS } from "@/config/labels";

interface ThemesIndexListProps {
  data: ThemesIndexData;
}

export function ThemesIndexList({ data }: ThemesIndexListProps) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {data.themes.map((entry) => {
        const n = entry.documentedMeasureCount;
        const countLabel =
          n === 0
            ? "Aucune mesure documentée"
            : `${n} mesure${n > 1 ? "s" : ""} documentée${n > 1 ? "s" : ""}`;

        return (
          <li key={entry.theme}>
            <Link
              href={`/elections/presidentielle-2027/sujets/${entry.slug}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full border shrink-0 ${THEME_CATEGORY_COLORS[entry.theme]}`}
                aria-hidden="true"
              />
              <span className="font-medium">{entry.label}</span>
              <span className="ml-auto text-sm text-muted-foreground">{countLabel}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
