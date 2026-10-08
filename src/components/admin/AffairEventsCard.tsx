"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AffairEventStatus,
  AffairEventType,
  DatePrecision,
  EventOccurrence,
  EventOutcome,
  EventSourceKind,
} from "@/generated/prisma";
import {
  AFFAIR_EVENT_TYPE_LABELS,
  EVENT_OUTCOME_LABELS,
  EVENT_SOURCE_KIND_LABELS,
} from "@/config/labels";
import { ALLOWED_OUTCOMES, checkEventPublishable } from "@/lib/affairs/events/guard";
import { formatEventDate } from "@/lib/affairs/events/dates";
import {
  AffairEventForm,
  CORROBORATION_HINT,
  FIELD_CLASS,
  isDecision,
  needsCorroboration,
} from "@/components/admin/AffairEventForm";

/** Étape telle que la page la passe au client : dates en chaînes ISO. */
export type SerializedAffairEvent = {
  id: string;
  type: AffairEventType;
  status: AffairEventStatus;
  date: string;
  datePrecision: DatePrecision;
  dateEnd: string | null;
  occurrence: EventOccurrence;
  outcome: EventOutcome | null;
  title: string;
  court: string | null;
  description: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceKind: EventSourceKind | null;
  incidental: boolean;
  corroborationUrl: string | null;
  retractionReason: string | null;
};

// Same bound as RETRACTION_REASON_MAX in the service, which imports the database client.
const RETRACTION_REASON_MAX = 280;

const STATUS_BADGES: Record<
  AffairEventStatus,
  { label: string; variant: "secondary" | "default" | "outline" }
> = {
  DRAFT: { label: "Brouillon", variant: "secondary" },
  PUBLISHED: { label: "Publiée", variant: "default" },
  RETRACTED: { label: "Retirée", variant: "outline" },
};

type Failure = { error: string; reasons: string[] };

function guardGaps(e: SerializedAffairEvent): string[] {
  return checkEventPublishable({
    ...e,
    date: new Date(e.date),
    dateEnd: e.dateEnd ? new Date(e.dateEnd) : null,
  });
}

/** Lien seulement pour une URL http(s) : une ancienne étape peut porter n'importe quoi. */
function SourceLink({ url, children }: { url: string; children: React.ReactNode }) {
  if (!/^https?:\/\//i.test(url)) return <span>{children}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
      {children}
    </a>
  );
}

type Panel = "edit" | "retract" | "confirm" | null;

function EventRow({
  event,
  affairId,
  pending,
  send,
}: {
  event: SerializedAffairEvent;
  affairId: string;
  pending: boolean;
  send: (url: string, method: string, body?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState({
    sourceUrl: "",
    sourceTitle: "",
    sourceKind: "" as EventSourceKind | "",
    outcome: "" as EventOutcome | "",
    corroborationUrl: "",
  });
  const url = `/api/admin/affaires/${affairId}/etapes/${event.id}`;
  const id = (name: string) => `etape-${event.id}-${name}`;
  const badge = STATUS_BADGES[event.status];
  const gaps = event.status === "DRAFT" ? guardGaps(event) : [];
  const decision = isDecision(event.type);
  const confirmCorroboration = needsCorroboration(event.type, confirm.outcome, confirm.sourceKind);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  async function act(method: string, body?: Record<string, unknown>) {
    if (await send(url, method, body)) setPanel(null);
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-muted-foreground">
          {formatEventDate({
            date: new Date(event.date),
            datePrecision: event.datePrecision,
            dateEnd: event.dateEnd ? new Date(event.dateEnd) : null,
          })}
        </span>
        <span className="text-sm font-medium">{AFFAIR_EVENT_TYPE_LABELS[event.type]}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {event.occurrence === "SCHEDULED" && <Badge variant="outline">Annoncée</Badge>}
        {event.outcome && <Badge variant="outline">{EVENT_OUTCOME_LABELS[event.outcome]}</Badge>}
        {event.incidental && (
          <span className="text-xs text-muted-foreground">recours sur un acte de procédure</span>
        )}
      </div>
      <p className="text-sm">{event.title}</p>
      {event.sourceUrl ? (
        <p className="text-xs text-muted-foreground">
          <SourceLink url={event.sourceUrl}>{event.sourceTitle || event.sourceUrl}</SourceLink>
          {event.sourceKind && ` (${EVENT_SOURCE_KIND_LABELS[event.sourceKind]})`}
          {event.corroborationUrl && (
            <>
              {", seconde source : "}
              <SourceLink url={event.corroborationUrl}>{event.corroborationUrl}</SourceLink>
            </>
          )}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Source non renseignée</p>
      )}
      {event.status === "RETRACTED" && event.retractionReason && (
        <p className="text-xs text-muted-foreground">Motif du retrait : {event.retractionReason}</p>
      )}
      {gaps.length > 0 && (
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <p>À compléter avant publication :</p>
          <ul className="list-disc pl-5">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {event.status === "DRAFT" && (
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-expanded={panel === "edit"}
              onClick={() => toggle("edit")}
            >
              Modifier
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              onClick={() => act("POST", { action: "PUBLISH" })}
            >
              Publier
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Supprimer ce brouillon d'étape ?")) void act("DELETE");
              }}
            >
              Supprimer
            </Button>
          </>
        )}
        {event.status === "PUBLISHED" && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={panel === "retract"}
            onClick={() => toggle("retract")}
          >
            Retirer…
          </Button>
        )}
        {event.status === "PUBLISHED" && event.occurrence === "SCHEDULED" && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={panel === "confirm"}
            onClick={() => toggle("confirm")}
          >
            Confirmer la tenue…
          </Button>
        )}
      </div>

      {panel === "edit" && (
        <AffairEventForm
          idPrefix={id("form")}
          event={event}
          pending={pending}
          onSubmit={(body) => void act("PATCH", body)}
          onCancel={() => setPanel(null)}
        />
      )}

      {panel === "retract" && (
        <form
          className="space-y-2 rounded-md border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            void act("POST", { action: "RETRACT", reason: reason.trim() });
          }}
        >
          <label htmlFor={id("reason")} className="text-sm font-medium">
            Raison du retrait ({RETRACTION_REASON_MAX} caractères au plus)
          </label>
          <textarea
            id={id("reason")}
            required
            maxLength={RETRACTION_REASON_MAX}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" variant="destructive" className="min-h-11" disabled={pending}>
            Confirmer le retrait
          </Button>
        </form>
      )}

      {panel === "confirm" && (
        <form
          className="grid gap-3 rounded-md border p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act("POST", {
              action: "CONFIRM",
              sourceUrl: confirm.sourceUrl,
              sourceTitle: confirm.sourceTitle || null,
              sourceKind: confirm.sourceKind,
              outcome: decision && confirm.outcome ? confirm.outcome : null,
              corroborationUrl:
                confirmCorroboration && confirm.corroborationUrl ? confirm.corroborationUrl : null,
            });
          }}
        >
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor={id("confirm-url")} className="text-sm font-medium">
              Nouvelle source (URL)
            </label>
            <input
              id={id("confirm-url")}
              type="url"
              required
              value={confirm.sourceUrl}
              onChange={(e) => setConfirm({ ...confirm, sourceUrl: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={id("confirm-title")} className="text-sm font-medium">
              Titre de la source
            </label>
            <input
              id={id("confirm-title")}
              maxLength={200}
              value={confirm.sourceTitle}
              onChange={(e) => setConfirm({ ...confirm, sourceTitle: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={id("confirm-kind")} className="text-sm font-medium">
              Nature de la source
            </label>
            <select
              id={id("confirm-kind")}
              required
              value={confirm.sourceKind}
              onChange={(e) =>
                setConfirm({ ...confirm, sourceKind: e.target.value as EventSourceKind })
              }
              className={FIELD_CLASS}
            >
              <option value="" disabled>
                Choisir
              </option>
              {(Object.keys(EVENT_SOURCE_KIND_LABELS) as EventSourceKind[]).map((k) => (
                <option key={k} value={k}>
                  {EVENT_SOURCE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          {decision && (
            <div className="space-y-1">
              <label htmlFor={id("confirm-outcome")} className="text-sm font-medium">
                Issue
              </label>
              <select
                id={id("confirm-outcome")}
                required
                value={confirm.outcome}
                onChange={(e) =>
                  setConfirm({ ...confirm, outcome: e.target.value as EventOutcome })
                }
                className={FIELD_CLASS}
              >
                <option value="" disabled>
                  Choisir
                </option>
                {ALLOWED_OUTCOMES[event.type as keyof typeof ALLOWED_OUTCOMES].map((o) => (
                  <option key={o} value={o}>
                    {EVENT_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {confirmCorroboration && (
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor={id("confirm-corroboration")} className="text-sm font-medium">
                Seconde source (URL)
              </label>
              <input
                id={id("confirm-corroboration")}
                type="url"
                value={confirm.corroborationUrl}
                onChange={(e) => setConfirm({ ...confirm, corroborationUrl: e.target.value })}
                className={FIELD_CLASS}
              />
              <p className="text-xs text-muted-foreground">{CORROBORATION_HINT}</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-11" disabled={pending}>
              Confirmer
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function AffairEventsCard({
  affairId,
  events,
}: {
  affairId: string;
  events: SerializedAffairEvent[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function send(url: string, method: string, body?: Record<string, unknown>) {
    setPending(true);
    setFailure(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
          reasons?: string[];
        } | null;
        setFailure({
          error: payload?.error ?? "L'enregistrement a échoué.",
          reasons: payload?.reasons ?? [],
        });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setFailure({ error: "L'enregistrement a échoué.", reasons: [] });
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Étapes de la procédure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.length ? (
          <ul className="divide-y">
            {events.map((e) => (
              <EventRow key={e.id} event={e} affairId={affairId} pending={pending} send={send} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune étape saisie.</p>
        )}

        {failure && (
          <div role="alert" className="text-sm font-medium text-destructive">
            <p>Erreur : {failure.error}</p>
            {failure.reasons.length > 0 && (
              <ul className="list-disc pl-5">
                {failure.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {adding ? (
          <AffairEventForm
            idPrefix={`etape-nouvelle-${affairId}`}
            pending={pending}
            onSubmit={async (body) => {
              if (await send(`/api/admin/affaires/${affairId}/etapes`, "POST", body)) {
                setAdding(false);
              }
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setAdding(true)}
          >
            Ajouter une étape
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
