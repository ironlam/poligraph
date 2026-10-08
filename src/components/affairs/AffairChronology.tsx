import { ExternalLink } from "lucide-react";
import type { AffairEvent, AffairStatus, Involvement } from "@/generated/prisma";
import {
  AFFAIR_EVENT_TYPE_LABELS,
  EVENT_OUTCOME_LABELS,
  EVENT_SOURCE_KIND_LABELS,
} from "@/config/labels";
import { isAccusedInvolvement } from "@/config/certainty";
import { describeEventDate, formatEventDate, isUpcoming } from "@/lib/affairs/events/dates";
import { buildPhaseTrail, PHASE_LABELS } from "@/lib/affairs/events/phases";
import { sortEvents } from "@/lib/affairs/events/order";
import { ChronologyFold } from "./ChronologyFold";

export type PublicAffairEvent = Pick<
  AffairEvent,
  | "id"
  | "status"
  | "incidental"
  | "type"
  | "date"
  | "datePrecision"
  | "dateEnd"
  | "occurrence"
  | "outcome"
  | "title"
  | "court"
  | "description"
  | "sourceUrl"
  | "sourceTitle"
  | "sourceKind"
>;

interface AffairChronologyProps {
  events: PublicAffairEvent[];
  status: AffairStatus;
  today: Date;
  /** Hors implication directe, l'issue d'une décision ne concerne pas la personne : masquée. */
  involvement: Involvement;
}

type Marker = "held" | "scheduled" | "revelation";

function markerOf(e: PublicAffairEvent): Marker {
  if (e.occurrence === "SCHEDULED") return "scheduled";
  if (e.type === "REVELATION") return "revelation";
  return "held";
}

const MARKER_CLASSES: Record<Marker, string> = {
  held: "rounded-full bg-primary",
  scheduled: "rounded-full border-2 border-dashed border-muted-foreground bg-background",
  revelation: "rounded-[3px] border-2 border-muted-foreground bg-secondary",
};

/** Lien de source : uniquement http(s), libellé « Source officielle » ou « Presse » + titre ou hôte. */
function SourceLink({ event }: { event: PublicAffairEvent }) {
  if (!event.sourceUrl) return null;
  let url: URL;
  try {
    url = new URL(event.sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const kind = event.sourceKind ? EVENT_SOURCE_KIND_LABELS[event.sourceKind] : "Source";
  const name = event.sourceTitle?.trim() || url.hostname;
  return (
    <a
      href={url.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline sm:min-h-0"
    >
      <span>
        <span className="font-medium">{kind}</span> : {name}
      </span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">(nouvel onglet)</span>
    </a>
  );
}

function PhaseBar({ trail }: { trail: ReturnType<typeof buildPhaseTrail> }) {
  if (trail.length === 0) return null;
  return (
    <ol aria-label="Phases de la procédure" className="flex flex-wrap items-center gap-2">
      {trail.map(({ phase, current }, i) => (
        <li
          key={`${phase}-${i}`}
          aria-current={current ? "step" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${
            current
              ? "border-primary bg-primary font-semibold text-primary-foreground"
              : "bg-muted/50 text-muted-foreground"
          }`}
        >
          {PHASE_LABELS[phase]}
        </li>
      ))}
    </ol>
  );
}

function NextStep({ event }: { event: PublicAffairEvent }) {
  return (
    <section
      aria-label="Prochaine étape annoncée"
      className="rounded-lg border border-dashed border-primary/60 bg-primary/5 p-4"
    >
      <p className="text-sm">
        <strong>Prochaine étape annoncée :</strong> {event.title}, {formatEventDate(event)}
      </p>
      {event.court && <p className="mt-1 text-sm text-muted-foreground">{event.court}</p>}
      <div className="mt-1">
        <SourceLink event={event} />
      </div>
    </section>
  );
}

function StepItem({
  event,
  today,
  showOutcome,
}: {
  event: PublicAffairEvent;
  today: Date;
  showOutcome: boolean;
}) {
  const marker = markerOf(event);
  const { text: dateText, unconfirmed } = describeEventDate(event, today);
  return (
    <li data-event-id={event.id} className="relative pl-6">
      <span
        aria-hidden="true"
        data-marker={marker}
        className={`absolute -left-[9px] top-1 h-4 w-4 ${MARKER_CLASSES[marker]}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-sm font-semibold tabular-nums ${unconfirmed ? "text-muted-foreground" : ""}`}
        >
          {dateText}
        </span>
        <span className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium">
          {AFFAIR_EVENT_TYPE_LABELS[event.type]}
        </span>
        {marker === "scheduled" && (
          <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Étape annoncée
          </span>
        )}
        {showOutcome && event.outcome && (
          <span className="rounded-md border bg-muted px-2 py-0.5 text-xs font-semibold">
            {EVENT_OUTCOME_LABELS[event.outcome]}
          </span>
        )}
      </div>
      <h3 className="mt-1 font-medium">{event.title}</h3>
      {event.incidental && (
        <p className="text-xs text-muted-foreground">Recours sur un acte de procédure</p>
      )}
      {event.court && <p className="text-sm text-muted-foreground">{event.court}</p>}
      {event.description && (
        <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
      )}
      <SourceLink event={event} />
    </li>
  );
}

/**
 * Chronologie publique d'une affaire : barre de phases, prochaine étape annoncée, rail des étapes.
 * Les étapes non publiées sont écartées ici aussi (un instantané antérieur au filtre des loaders
 * peut encore en porter).
 */
export function AffairChronology({ events, status, today, involvement }: AffairChronologyProps) {
  const published = sortEvents(events.filter((e) => e.status === "PUBLISHED"));
  if (published.length === 0) return null;

  const trail = buildPhaseTrail(published, status);
  const next = published.find((e) => isUpcoming(e, today));
  const showOutcome = isAccusedInvolvement(involvement);

  return (
    <div className="space-y-5">
      <PhaseBar trail={trail} />
      {next && <NextStep event={next} />}
      <ChronologyFold
        className="ml-2 space-y-5 border-l-2 border-border"
        items={published.map((e) => (
          <StepItem key={e.id} event={e} today={today} showOutcome={showOutcome} />
        ))}
      />
    </div>
  );
}
