import { ReportLink } from "@/components/feedback/ReportLink";

type Variant = "stats" | "profile" | "compare";

const MESSAGES: Record<Variant, { note: string; detail: string }> = {
  stats: {
    note: "Données en cours d'enrichissement",
    detail:
      "Ces statistiques reflètent les données actuellement documentées et ne prétendent pas à l'exhaustivité. Notre base est enrichie régulièrement à partir de sources publiques vérifiables.",
  },
  profile: {
    note: "Fiche en cours d'enrichissement",
    detail:
      "Certaines informations peuvent être incomplètes ou manquantes. Les données sont croisées entre plusieurs sources officielles et mises à jour régulièrement.",
  },
  compare: {
    note: "Comparaison sur données partielles",
    detail:
      "Cette comparaison porte sur les données actuellement référencées. Des écarts peuvent exister avec la réalité complète du parcours de chaque élu.",
  },
};

interface BetaDisclaimerProps {
  variant: Variant;
}

export function BetaDisclaimer({ variant }: BetaDisclaimerProps) {
  const { note, detail } = MESSAGES[variant];

  return (
    <aside
      role="note"
      className="relative border-l-2 border-primary/40 pl-4 py-2 text-sm text-muted-foreground"
    >
      <p className="font-medium text-foreground/80 mb-0.5">{note}</p>
      <p className="leading-relaxed">
        {detail}{" "}
        <ReportLink className="text-primary/80 hover:text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors">
          Signaler une erreur ou donner un avis
        </ReportLink>
      </p>
    </aside>
  );
}
