import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import type { MandateType } from "@/types";

// ---------------------------------------------------------------------------
// PoliticianBridge — inline card shown below a CandidateRow that has a linked
// national politician. This is the "Pont National-Local" feature.
// ---------------------------------------------------------------------------

interface PoliticianBridgeProps {
  politician: {
    slug: string;
    fullName: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    currentParty: { shortName: string; color: string | null } | null;
    mandates: Array<{ type: string }>;
  };
  participationRate?: number | null;
  affairsCount?: number;
}

export function PoliticianBridge({
  politician,
  participationRate,
  affairsCount,
}: PoliticianBridgeProps) {
  const mandateLabel =
    politician.mandates.length > 0
      ? (MANDATE_TYPE_LABELS[politician.mandates[0]!.type as MandateType] ??
        politician.mandates[0]!.type)
      : null;

  return (
    <div className="bg-accent/50 rounded-lg p-3 ml-8 my-1">
      {/* Top row: avatar + name + mandate badge */}
      <div className="flex items-center gap-2">
        <PoliticianAvatar
          photoUrl={politician.photoUrl}
          blobPhotoUrl={politician.blobPhotoUrl}
          fullName={politician.fullName}
          size="sm"
          className="w-8 h-8 text-xs"
        />

        <Link
          href={`/politiques/${politician.slug}`}
          prefetch={false}
          className="font-bold text-sm hover:text-primary transition-colors"
        >
          {politician.fullName}
        </Link>

        {mandateLabel && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {mandateLabel}
          </Badge>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {participationRate != null && (
          <span>
            Participation :{" "}
            <span className="font-medium text-foreground">{Math.round(participationRate)} %</span>
          </span>
        )}

        {affairsCount != null && affairsCount > 0 && (
          <span>
            {affairsCount} affaire{affairsCount > 1 ? "s" : ""}
          </span>
        )}

        {politician.currentParty && (
          <span className="inline-flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: politician.currentParty.color || "#9ca3af",
              }}
              aria-hidden="true"
            />
            {politician.currentParty.shortName}
          </span>
        )}
      </div>

      {/* Link to full profile */}
      <div className="mt-2">
        <Link
          href={`/politiques/${politician.slug}`}
          prefetch={false}
          className="text-xs text-primary/80 hover:text-primary transition-colors"
        >
          Voir la fiche complète &rarr;
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlerteCumul — banner shown at top of commune page when candidates hold
// national mandates.
// ---------------------------------------------------------------------------

interface AlerteCumulProps {
  count: number;
  mandateTypes: string[];
}

export function AlerteCumul({ count, mandateTypes }: AlerteCumulProps) {
  const formattedTypes = mandateTypes
    .map((t) => MANDATE_TYPE_LABELS[t as MandateType] ?? t)
    .join(", ");

  return (
    <div
      role="alert"
      className="rounded-lg border px-4 py-3 text-sm bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
    >
      <span aria-hidden="true" className="mr-1">
        &#9888;
      </span>
      {count} candidat{count > 1 ? "s" : ""} sur cette commune {count > 1 ? "exercent" : "exerce"}{" "}
      un mandat national ({formattedTypes}).
    </div>
  );
}
