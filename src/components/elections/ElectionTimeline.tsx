import { ElectionCard } from "./ElectionCard";
import { ELECTION_TYPE_ICONS } from "@/config/labels";
import type { Election } from "@/types";

interface ElectionTimelineProps {
  elections: Election[];
}

function ElectionEntry({ election }: { election: Election }) {
  return (
    <div className="relative flex items-start">
      <div className="absolute left-2 w-4 h-4 rounded-full border-2 border-primary bg-background flex items-center justify-center mt-1">
        <span className="text-[8px]" aria-hidden="true">
          {ELECTION_TYPE_ICONS[election.type]}
        </span>
      </div>
      <div className="pl-12 w-full">
        <ElectionCard
          slug={election.slug}
          type={election.type}
          title={election.title}
          shortTitle={election.shortTitle}
          round1Date={election.round1Date}
          round2Date={election.round2Date}
          scope={election.scope}
          totalSeats={election.totalSeats}
          suffrage={election.suffrage}
          status={election.status}
          dateConfirmed={election.dateConfirmed}
          description={election.description}
        />
      </div>
    </div>
  );
}

/** Ids of the elections that open a new year block, in iteration order. */
function yearStartIds(elections: Election[]): Set<string> {
  const ids = new Set<string>();
  const seenYears = new Set<number>();
  for (const election of elections) {
    const year = election.round1Date!.getFullYear();
    if (!seenYears.has(year)) {
      seenYears.add(year);
      ids.add(election.id);
    }
  }
  return ids;
}

interface TimelineSectionProps {
  title: string;
  elections: Election[];
  /** Elections carrying no round date, grouped at the end of the section. */
  undated?: Election[];
  undatedLabel?: string;
}

function TimelineSection({
  title,
  elections,
  undated = [],
  undatedLabel = "Dates à confirmer",
}: TimelineSectionProps) {
  const yearStarts = yearStartIds(elections);

  return (
    <section>
      <h2 className="text-lg font-display font-bold tracking-tight mb-4">{title}</h2>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" aria-hidden="true" />

        <ol className="space-y-6">
          {elections.map((election) => (
            <li key={election.id}>
              {yearStarts.has(election.id) && (
                <div className="relative flex items-center mb-4">
                  <div className="absolute left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary-foreground">
                      {String(election.round1Date!.getFullYear()).slice(-2)}
                    </span>
                  </div>
                  <span className="pl-12 text-sm font-semibold text-muted-foreground">
                    {election.round1Date!.getFullYear()}
                  </span>
                </div>
              )}
              <ElectionEntry election={election} />
            </li>
          ))}

          {undated.length > 0 && (
            <li>
              <div className="relative flex items-center mb-4">
                <div className="absolute left-1.5 w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-[10px] font-bold text-muted-foreground">?</span>
                </div>
                <span className="pl-12 text-sm font-semibold text-muted-foreground">
                  {undatedLabel}
                </span>
              </div>
              <div className="space-y-4">
                {undated.map((election) => (
                  <ElectionEntry key={election.id} election={election} />
                ))}
              </div>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}

export function ElectionTimeline({ elections }: ElectionTimelineProps) {
  // The page is a calendar: upcoming scrutins come first, chronologically.
  // Past ones follow, most recent first — nobody scrolls to 2014 on purpose.
  const upcoming = elections.filter((e) => e.status !== "COMPLETED" && e.round1Date !== null);
  const undated = elections.filter((e) => e.status !== "COMPLETED" && e.round1Date === null);
  const past = elections
    .filter((e) => e.status === "COMPLETED" && e.round1Date !== null)
    .sort((a, b) => b.round1Date!.getTime() - a.round1Date!.getTime());

  // A completed election with no date at all has nowhere sensible to go on a
  // timeline; keep it visible at the end rather than dropping it silently.
  const pastUndated = elections.filter((e) => e.status === "COMPLETED" && e.round1Date === null);

  // Heading wording note: "À venir" is taken — it is the UPCOMING badge printed
  // on every card just below, and repeating it drains the word of meaning.
  return (
    <div className="space-y-10">
      {(upcoming.length > 0 || undated.length > 0) && (
        <TimelineSection title="Prochaines élections" elections={upcoming} undated={undated} />
      )}
      {(past.length > 0 || pastUndated.length > 0) && (
        <TimelineSection
          title="Élections passées"
          elections={past}
          undated={pastUndated}
          undatedLabel="Dates inconnues"
        />
      )}
    </div>
  );
}
