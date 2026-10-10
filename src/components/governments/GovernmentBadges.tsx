import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublishedGovernment } from "@/lib/governments/mapping";
import { formatDay, plural } from "./format";

type Tone = "neutral" | "success" | "warning";

const ICON: Record<Tone, ReactNode> = {
  neutral: <Info aria-hidden="true" />,
  success: <CheckCircle2 aria-hidden="true" />,
  warning: <AlertTriangle aria-hidden="true" />,
};

/** Status pill. The words carry the status; colour and icon only repeat it. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge
      variant={tone}
      className="whitespace-normal px-2.5 py-0.5 text-left text-xs font-bold leading-snug"
    >
      {ICON[tone]}
      <span>{children}</span>
    </Badge>
  );
}

/**
 * Status, completeness and verification of a government, kept as separate statements.
 * `detail` adds what the list view leaves out (complete composition, check date).
 * `showEnded={false}` drops the « Terminé » pill, noise when every card of a long list has it.
 */
export function GovernmentBadges({
  gov,
  detail = false,
  showEnded = true,
}: {
  gov: PublishedGovernment;
  detail?: boolean;
  showEnded?: boolean;
}) {
  const badges: ReactNode[] = [];

  if (gov.endedAt) {
    if (showEnded) {
      badges.push(
        <StatusBadge key="status" tone="neutral">
          Terminé
        </StatusBadge>
      );
    }
    if (detail && gov.compositionVerifiedAt) {
      badges.push(
        <StatusBadge key="verified" tone="success">
          Composition vérifiée au {formatDay(gov.compositionVerifiedAt)}
        </StatusBadge>
      );
    }
  } else if (gov.compositionVerifiedAt) {
    badges.push(
      <StatusBadge key="status" tone="success">
        En exercice, composition vérifiée au {formatDay(gov.compositionVerifiedAt)}
      </StatusBadge>
    );
  } else {
    badges.push(
      <StatusBadge key="status" tone="warning">
        Composition non établie
      </StatusBadge>
    );
  }

  if (gov.completeness === "PARTIAL") {
    badges.push(
      <StatusBadge key="completeness" tone="warning">
        {gov.pendingChanges
          ? `Composition partielle : ${plural(gov.pendingChanges, "changement", "changements")} à sourcer`
          : "Composition partielle"}
      </StatusBadge>
    );
  } else if (gov.hiddenCount > 0) {
    badges.push(
      <StatusBadge key="completeness" tone="warning">
        Composition partielle :{" "}
        {plural(gov.hiddenCount, "personne non affichée", "personnes non affichées")}
      </StatusBadge>
    );
  } else if (detail) {
    badges.push(
      <StatusBadge key="completeness" tone="success">
        Composition complète
      </StatusBadge>
    );
  }

  if (detail && gov.compositionCheckedAt) {
    badges.push(
      <StatusBadge key="checked" tone="neutral">
        Vérifiée le {formatDay(gov.compositionCheckedAt)}
      </StatusBadge>
    );
  }

  if (gov.hasDerivedDate) {
    badges.push(
      <StatusBadge key="derived" tone="warning">
        Dates estimées
      </StatusBadge>
    );
  }

  return <div className="flex flex-wrap items-center gap-2">{badges}</div>;
}
