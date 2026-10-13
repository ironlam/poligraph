import { BadgeCheck, FileText, Scale, User, Vote, type LucideIcon } from "lucide-react";

// Only sections the profile page actually renders: there is no press section on it yet.
const RUBRIQUES: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: User, title: "Mandats", detail: "Parcours et fonctions" },
  { icon: Vote, title: "Votes", detail: "Positions en séance" },
  { icon: FileText, title: "Déclarations", detail: "Patrimoine et intérêts, HATVP" },
  { icon: Scale, title: "Affaires", detail: "Sources de presse vérifiées" },
  { icon: BadgeCheck, title: "Fact-checks", detail: "Vérifications sourcées" },
];

/** Informative strip of what a profile holds. Not links: the profile is the destination. */
export function SurChaqueFiche() {
  return (
    <section
      aria-labelledby="sur-chaque-fiche"
      className="rounded-2xl border border-border bg-card p-5 sm:p-7"
    >
      <h2
        id="sur-chaque-fiche"
        className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
      >
        Sur chaque fiche
      </h2>
      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6">
        {RUBRIQUES.map(({ icon: Icon, title, detail }) => (
          <li key={title} className="flex flex-col gap-2">
            <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="font-bold">{title}</span>
            <span className="text-sm leading-snug text-muted-foreground">{detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
