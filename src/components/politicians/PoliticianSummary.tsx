import Link from "next/link";
import {
  Vote,
  Landmark,
  Scale,
  Gavel,
  Shield,
  Users,
  FileCheck,
  Wallet,
  FileText,
  ExternalLink,
} from "lucide-react";
import type { Signal, SignalIconKey, SignalTone } from "@/lib/politicians/signals";
import type { SourceLink } from "@/lib/politicians/external-sources";

const ICONS: Record<
  SignalIconKey,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  vote: Vote,
  mandate: Landmark,
  scale: Scale,
  gavel: Gavel,
  shield: Shield,
  users: Users,
  filecheck: FileCheck,
  wallet: Wallet,
  filetext: FileText,
};
const TONE: Record<SignalTone, string> = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  neutral: "text-foreground",
};

// Compact summary rendered at two responsive locations (mobile before the
// tabs, desktop in the right column). MUST NOT emit any fixed HTML id, since
// it is mounted twice; a fixed id would duplicate identifiers in the DOM.
export function PoliticianSummary({
  signals,
  sources,
  registres = [],
  relationsHref,
  lastUpdated,
}: {
  signals: Signal[];
  sources: SourceLink[];
  registres?: string[];
  relationsHref: string;
  lastUpdated: string;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">En bref</h2>
        <ul className="space-y-2 text-sm">
          {signals.map((s) => {
            const Icon = ICONS[s.iconKey];
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  prefetch={false}
                  scroll={false}
                  className="flex items-center justify-between gap-2 py-1 text-foreground hover:underline"
                >
                  <span className="flex items-center gap-1.5">
                    <Icon className={`size-4 ${TONE[s.tone]}`} aria-hidden={true} />
                    {s.label}
                  </span>
                  <span className={`font-semibold ${TONE[s.tone]}`}>{s.value} ›</span>
                </Link>
              </li>
            );
          })}
          <li className="border-t pt-2">
            <Link
              href={relationsHref}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Users className="size-4" aria-hidden={true} />
              Voir les relations
            </Link>
          </li>
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Sources &amp; vérifier</h2>
        <ul className="space-y-2">
          {sources.map((src) => (
            <li key={`${src.source}-${src.url}`}>
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/50"
              >
                <span>{src.label}</span>
                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden={true} />
                <span className="sr-only"> (ouvre un nouvel onglet)</span>
              </a>
            </li>
          ))}
        </ul>
        {registres.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Registres : {registres.join(", ")}</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Dernière mise à jour : {lastUpdated} ·{" "}
          <Link href="/methodologie" className="text-primary hover:underline">
            Méthodologie
          </Link>
        </p>
      </section>
    </div>
  );
}
