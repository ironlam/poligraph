"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
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
  LEGACY_EVENT_TYPES,
} from "@/config/labels";
import { ALLOWED_OUTCOMES, DECISION_EVENT_TYPES } from "@/lib/affairs/events/guard";
import { EVENT_TYPE_PHASE, PHASE_LABELS, type Phase } from "@/lib/affairs/events/phases";
import type { SerializedAffairEvent } from "@/components/admin/AffairEventsCard";

export const FIELD_CLASS = "min-h-11 w-full rounded-md border bg-background px-3 text-sm";

const INCIDENTAL_TYPES: readonly AffairEventType[] = [
  "APPEL",
  "ARRET_APPEL",
  "POURVOI_CASSATION",
  "ARRET_CASSATION",
];

const CORROBORATED_OUTCOMES: readonly EventOutcome[] = ["CONDAMNATION", "RELAXE_PARTIELLE"];

export const CORROBORATION_HINT = "Deux médias indépendants, pas deux reprises de la même dépêche.";

const SOURCE_KINDS = Object.keys(EVENT_SOURCE_KIND_LABELS) as EventSourceKind[];

/** Types saisissables, groupés par phase : les types anciens passent par l'issue d'une décision. */
const TYPE_GROUPS: { label: string; types: AffairEventType[] }[] = (() => {
  const types = (Object.keys(AFFAIR_EVENT_TYPE_LABELS) as AffairEventType[]).filter(
    (t) => !LEGACY_EVENT_TYPES.includes(t)
  );
  const phases = Object.keys(PHASE_LABELS) as Phase[];
  return [
    { label: "Faits et révélation", types: types.filter((t) => EVENT_TYPE_PHASE[t] === null) },
    ...phases.map((p) => ({
      label: PHASE_LABELS[p],
      types: types.filter((t) => EVENT_TYPE_PHASE[t] === p),
    })),
    { label: "Autres étapes", types: types.filter((t) => EVENT_TYPE_PHASE[t] === "INHERIT") },
  ];
})();

export function isDecision(type: AffairEventType | ""): type is keyof typeof ALLOWED_OUTCOMES {
  return type !== "" && DECISION_EVENT_TYPES.has(type);
}

export function needsCorroboration(
  type: AffairEventType | "",
  outcome: EventOutcome | "",
  sourceKind: EventSourceKind | ""
): boolean {
  return (
    isDecision(type) &&
    sourceKind === "PRESS" &&
    outcome !== "" &&
    CORROBORATED_OUTCOMES.includes(outcome)
  );
}

const PRECISION_LENGTH: Record<DatePrecision, number> = { DAY: 10, MONTH: 7, YEAR: 4 };

/** Coupe une valeur saisie à la longueur de la précision, ou la vide si elle est trop courte. */
function fitToPrecision(value: string, precision: DatePrecision): string {
  const len = PRECISION_LENGTH[precision];
  return value.length >= len ? value.slice(0, len) : "";
}

function DateField({
  id,
  label,
  precision,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  precision: DatePrecision;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const inputLabel = { DAY: "Jour", MONTH: "Mois", YEAR: "Année" }[precision];
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label === "Date" ? inputLabel : `${label} (${inputLabel.toLowerCase()})`}
      </label>
      {precision === "YEAR" ? (
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          placeholder="AAAA"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD_CLASS}
        />
      ) : (
        <input
          id={id}
          type={precision === "DAY" ? "date" : "month"}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD_CLASS}
        />
      )}
    </div>
  );
}

function initialState(e?: SerializedAffairEvent) {
  const precision = e?.datePrecision ?? "DAY";
  return {
    type: (e?.type ?? "") as AffairEventType | "",
    precision,
    date: e ? fitToPrecision(e.date, precision) : "",
    dateEnd: e?.dateEnd ? fitToPrecision(e.dateEnd, precision) : "",
    occurrence: (e?.occurrence ?? "HELD") as EventOccurrence,
    outcome: (e?.outcome ?? "") as EventOutcome | "",
    title: e?.title ?? "",
    court: e?.court ?? "",
    description: e?.description ?? "",
    sourceUrl: e?.sourceUrl ?? "",
    sourceTitle: e?.sourceTitle ?? "",
    sourceKind: (e?.sourceKind ?? "") as EventSourceKind | "",
    incidental: e?.incidental ?? false,
    corroborationUrl: e?.corroborationUrl ?? "",
  };
}

/**
 * Ajout ou édition d'un brouillon d'étape. `onSubmit` reçoit le corps attendu par les routes
 * admin et renvoie vrai en cas de succès.
 */
export function AffairEventForm({
  idPrefix,
  event,
  pending,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  event?: SerializedAffairEvent;
  pending: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState(() => initialState(event));
  const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const showOutcome = isDecision(s.type) && s.occurrence === "HELD";
  const showIncidental = s.type !== "" && INCIDENTAL_TYPES.includes(s.type);
  const showCorroboration = showOutcome && needsCorroboration(s.type, s.outcome, s.sourceKind);
  const id = (name: string) => `${idPrefix}-${name}`;

  function changePrecision(precision: DatePrecision) {
    setS((prev) => ({
      ...prev,
      precision,
      date: fitToPrecision(prev.date, precision),
      dateEnd: fitToPrecision(prev.dateEnd, precision),
    }));
  }

  return (
    <form
      className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (s.type === "") return;
        onSubmit({
          type: s.type,
          date: s.date,
          dateEnd: s.type === "FAITS" && s.dateEnd ? s.dateEnd : null,
          occurrence: s.occurrence,
          outcome: showOutcome && s.outcome ? s.outcome : null,
          title: s.title,
          court: s.court,
          description: s.description,
          sourceUrl: s.sourceUrl,
          sourceTitle: s.sourceTitle,
          sourceKind: s.sourceKind || null,
          incidental: showIncidental ? s.incidental : false,
          corroborationUrl: showCorroboration && s.corroborationUrl ? s.corroborationUrl : null,
        });
      }}
    >
      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={id("type")} className="text-sm font-medium">
          Type
        </label>
        <select
          id={id("type")}
          required
          value={s.type}
          onChange={(e) => set("type", e.target.value as AffairEventType)}
          className={FIELD_CLASS}
        >
          <option value="" disabled>
            Choisir un type
          </option>
          {TYPE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => (
                <option key={t} value={t}>
                  {AFFAIR_EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor={id("precision")} className="text-sm font-medium">
          Précision de la date
        </label>
        <select
          id={id("precision")}
          value={s.precision}
          onChange={(e) => changePrecision(e.target.value as DatePrecision)}
          className={FIELD_CLASS}
        >
          <option value="DAY">Jour</option>
          <option value="MONTH">Mois</option>
          <option value="YEAR">Année</option>
        </select>
      </div>
      <DateField
        id={id("date")}
        label="Date"
        precision={s.precision}
        value={s.date}
        onChange={(v) => set("date", v)}
        required
      />
      {s.type === "FAITS" && (
        <DateField
          id={id("date-end")}
          label="Fin de période, facultative"
          precision={s.precision}
          value={s.dateEnd}
          onChange={(v) => set("dateEnd", v)}
        />
      )}

      <fieldset className="space-y-1 sm:col-span-2">
        <legend className="text-sm font-medium">Tenue ou annoncée</legend>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["HELD", "Tenue"],
              ["SCHEDULED", "Annoncée"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={id("occurrence")}
                value={value}
                checked={s.occurrence === value}
                onChange={() => set("occurrence", value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={id("title")} className="text-sm font-medium">
          Titre
        </label>
        <input
          id={id("title")}
          required
          maxLength={120}
          value={s.title}
          onChange={(e) => set("title", e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={id("court")} className="text-sm font-medium">
          Juridiction, facultative
        </label>
        <input
          id={id("court")}
          maxLength={120}
          value={s.court}
          onChange={(e) => set("court", e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      {showOutcome && (
        <div className="space-y-1">
          <label htmlFor={id("outcome")} className="text-sm font-medium">
            Issue
          </label>
          <select
            id={id("outcome")}
            value={s.outcome}
            onChange={(e) => set("outcome", e.target.value as EventOutcome)}
            className={FIELD_CLASS}
          >
            <option value="">Non renseignée</option>
            {ALLOWED_OUTCOMES[s.type as keyof typeof ALLOWED_OUTCOMES].map((o) => (
              <option key={o} value={o}>
                {EVENT_OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
      )}
      {showIncidental && (
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={s.incidental}
            onChange={(e) => set("incidental", e.target.checked)}
          />
          Recours sur un acte de procédure (n{"'"}ouvre pas la phase d{"'"}appel ou de cassation)
        </label>
      )}

      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={id("source-url")} className="text-sm font-medium">
          Source (URL)
        </label>
        <input
          id={id("source-url")}
          type="url"
          value={s.sourceUrl}
          onChange={(e) => set("sourceUrl", e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={id("source-title")} className="text-sm font-medium">
          Titre de la source
        </label>
        <input
          id={id("source-title")}
          maxLength={200}
          value={s.sourceTitle}
          onChange={(e) => set("sourceTitle", e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={id("source-kind")} className="text-sm font-medium">
          Nature de la source
        </label>
        <select
          id={id("source-kind")}
          value={s.sourceKind}
          onChange={(e) => set("sourceKind", e.target.value as EventSourceKind)}
          className={FIELD_CLASS}
        >
          <option value="">Non renseignée</option>
          {SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {EVENT_SOURCE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {showCorroboration && (
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={id("corroboration")} className="text-sm font-medium">
            Seconde source (URL)
          </label>
          <input
            id={id("corroboration")}
            type="url"
            aria-describedby={id("corroboration-hint")}
            value={s.corroborationUrl}
            onChange={(e) => set("corroborationUrl", e.target.value)}
            className={FIELD_CLASS}
          />
          <p id={id("corroboration-hint")} className="text-xs text-muted-foreground">
            {CORROBORATION_HINT}
          </p>
        </div>
      )}

      <div className="space-y-1 sm:col-span-2">
        <label htmlFor={id("description")} className="text-sm font-medium">
          Description, facultative
        </label>
        <textarea
          id={id("description")}
          maxLength={1000}
          rows={3}
          value={s.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={pending}>
          Enregistrer le brouillon
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
