import Link from "next/link";
import { AFFAIR_STATUS_COLORS } from "@/config/labels";
import { cn } from "@/lib/utils";
import type { MemberAffairs } from "@/lib/governments/affairs";
import { plural } from "./format";

/**
 * A member's affairs, shown on the members list only while the « Affaires judiciaires » filter
 * is active. Three separate pills, never one total: a definitive conviction, a conviction still
 * open to appeal and a pending proceeding do not weigh the same. Colours are the fiche's own
 * status colours; the words carry the meaning.
 */
export function MemberAffairsSummary({
  affairs,
  slug,
}: {
  affairs: MemberAffairs | undefined;
  slug: string;
}) {
  if (!affairs) return null;
  const items = [
    {
      key: "definitive",
      count: affairs.definitive,
      label: plural(affairs.definitive, "condamnation définitive", "condamnations définitives"),
      color: AFFAIR_STATUS_COLORS.CONDAMNATION_DEFINITIVE,
    },
    {
      key: "nonDefinitive",
      count: affairs.nonDefinitive,
      label: plural(
        affairs.nonDefinitive,
        "condamnation non définitive",
        "condamnations non définitives"
      ),
      color: AFFAIR_STATUS_COLORS.CONDAMNATION_PREMIERE_INSTANCE,
    },
    {
      key: "ongoing",
      count: affairs.ongoing,
      label: plural(affairs.ongoing, "procédure en cours", "procédures en cours"),
      color: AFFAIR_STATUS_COLORS.MISE_EN_EXAMEN,
    },
  ].filter((item) => item.count > 0);
  if (items.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <span
          key={item.key}
          className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", item.color)}
        >
          {item.label}
        </span>
      ))}
      <Link
        href={`/politiques/${slug}#affaires`}
        className="inline-flex min-h-11 items-center text-[13px] font-bold text-primary underline-offset-4 hover:underline"
      >
        Voir les affaires
      </Link>
    </div>
  );
}
