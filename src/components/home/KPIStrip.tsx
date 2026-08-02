import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { HomepageKPIs } from "@/lib/data/homepage";

interface CounterCardProps {
  count: number;
  label: string;
  href: string;
  color: string;
}

function CounterCard({ count, label, href, color }: CounterCardProps) {
  return (
    <Link href={href} prefetch={false}>
      <Card
        className="relative border-l-4 transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5"
        style={{ borderLeftColor: color }}
      >
        <CardContent className="p-4">
          <ArrowRight
            className="absolute top-3 right-3 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="text-2xl md:text-3xl font-display font-extrabold tracking-tight">
            {count.toLocaleString("fr-FR")}
          </div>
          <div className="text-sm font-medium mt-1 leading-tight">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface Segment {
  label: string;
  count: number;
  bar: string;
  dot: string;
}

/**
 * Distribution of documented affairs by outcome. Shown as a proportional bar so
 * the "une mise en cause ne vaut pas condamnation" nuance reads at a glance:
 * convictions are one segment among ongoing procedures and closed-without-conviction,
 * never a lone red figure.
 */
function CertaintyBar({ kpis }: { kpis: HomepageKPIs }) {
  const segments: Segment[] = [
    {
      label: "Condamnations définitives",
      count: kpis.condamnationsCount,
      bar: "bg-red-600 dark:bg-red-500",
      dot: "bg-red-600 dark:bg-red-500",
    },
    {
      label: "Procédures en cours",
      count: kpis.proceduresEnCoursCount,
      bar: "bg-amber-500 dark:bg-amber-400",
      dot: "bg-amber-500 dark:bg-amber-400",
    },
    {
      label: "Classées sans condamnation",
      count: kpis.closesSansCondamnationCount,
      bar: "bg-emerald-600 dark:bg-emerald-500",
      dot: "bg-emerald-600 dark:bg-emerald-500",
    },
  ];

  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  const shown = segments.filter((s) => s.count > 0);
  const summary = shown.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-medium">Affaires judiciaires documentées</div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {total.toLocaleString("fr-FR")}
          </div>
        </div>

        <div
          role="img"
          aria-label={`Répartition des affaires documentées : ${summary}.`}
          className="mt-3 flex h-3 w-full overflow-hidden rounded-full"
        >
          {shown.map((s) => (
            <span
              key={s.label}
              className={s.bar}
              style={{ width: `${(s.count / total) * 100}%` }}
            />
          ))}
        </div>

        <ul className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-5">
          {shown.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold tabular-nums">{s.count.toLocaleString("fr-FR")}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-muted-foreground">
          Une mise en cause ne vaut pas condamnation : la présomption d{"'"}innocence s{"'"}
          applique.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-5">
          <Link
            href="/affaires"
            prefetch={false}
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            Voir les affaires documentées
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
          <Link
            href="/affaires/condamnations?view=stats"
            prefetch={false}
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            Condamnations par parti
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function KPIStrip({ kpis }: { kpis: HomepageKPIs }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-display font-bold">Poligraph en chiffres</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CounterCard
          count={kpis.politiciansCount}
          label="Politiques suivis"
          href="/politiques"
          color="#002654"
        />
        <CounterCard
          count={kpis.votesCount}
          label="Votes analysés"
          href="/parlement/votes"
          color="#002654"
        />
        <CounterCard
          count={kpis.factchecksCount}
          label="Fact-checks vérifiés"
          href="/factchecks"
          color="#6B7280"
        />
      </div>
      <CertaintyBar kpis={kpis} />
    </section>
  );
}
