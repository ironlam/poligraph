"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Scale } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import { getDepartmentLocative } from "@/config/department-prepositions";
import type { CommuneCollege } from "@/lib/senatoriales/college";
import type { DepartmentRenewal, SittingSenator } from "@/lib/data/senatoriales";
import {
  SOURCE_ELECTORAL_CODE,
  SOURCE_MAYOTTE_SEATS,
  SOURCE_SENAT,
  SOURCE_TABLEAU_5,
  SOURCE_TABLEAU_6,
  type BallotPhase,
} from "../_content";

interface CommuneStub {
  id: string;
  name: string;
  departmentCode: string;
  departmentName: string;
}

interface CommuneAnswer {
  commune: CommuneStub;
  college: CommuneCollege | null;
  inhabitantsPerDelegate: number | null;
  renewal: DepartmentRenewal;
  seatsAtStake: number | null;
  senators: SittingSenator[];
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "choose"; postalCode: string; communes: CommuneStub[] }
  | { kind: "answer"; answer: CommuneAnswer };

const API = "/api/elections/senatoriales-2026/commune";

function formatInt(value: number): string {
  return value.toLocaleString("fr-FR");
}

/**
 * The block's tense follows the resolved phase, not a date compared here.
 *
 * Once the ballot is held it says the department took part, and stops there: no
 * result is announced while nothing feeds one. A page that still reads "à pourvoir le
 * 27 septembre" on 28 September is not merely stale, it asserts something false.
 */
function renewedHeadline(phase: BallotPhase, seats: number | null, where: string): string {
  const count = seats !== null && seats > 0 ? seats : null;
  const seatWord = count !== null && count > 1 ? "sièges" : "siège";
  if (phase === "after") {
    return `Ce département faisait partie du renouvellement du 27 septembre`;
  }
  if (phase === "polling-day") {
    return count !== null
      ? `${count} ${seatWord} sont à pourvoir ${where} ce 27 septembre`
      : `Des sièges sont à pourvoir ${where} ce 27 septembre`;
  }
  return count !== null
    ? `${count} ${seatWord} à pourvoir ${where} le 27 septembre`
    : `Des sièges sont à pourvoir ${where} le 27 septembre`;
}

function renewedDetail(phase: BallotPhase, delegates: number, communeName: string): string {
  if (phase === "after") {
    return `Les ${formatInt(delegates)} grands électeurs de ${communeName} y ont pris part.`;
  }
  if (phase === "polling-day") {
    return `Les ${formatInt(delegates)} grands électeurs de ${communeName} votent ce 27 septembre.`;
  }
  return `Les ${formatInt(delegates)} grands électeurs de ${communeName} voteront ce jour-là.`;
}

/**
 * "Vos grands électeurs" : the only interactive block of the hub.
 *
 * Three things it must get right, each of which the obvious implementation gets wrong.
 *
 * A postal code is not a commune: 4,204 of them cover several communes and one covers
 * 46, so an ambiguous code offers a choice instead of quietly keeping the largest.
 * `33430` alone returns thirteen communes, including the design's own example.
 *
 * A code resolves to a commune, never to an arrondissement. `75011` gives Paris
 * because `Commune.postalCodes` carries all 21 Parisian codes on the 75056 row: an
 * arrondissement designates no senatorial delegate, the Conseil de Paris does.
 *
 * And a department outside the renewal still gets a real answer. Half of the visitors
 * are in that case, so the block shows their delegates and says they will vote at the
 * next renewal, rather than turning into a dead end.
 */
export function CommuneLookup({ phase }: { phase: BallotPhase }) {
  const inputId = useId();
  const errorId = useId();
  const [postalCode, setPostalCode] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function lookupPostalCode(code: string) {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`${API}?cp=${encodeURIComponent(code)}`);
      if (!response.ok) {
        setState({ kind: "error", message: "Code postal à cinq chiffres attendu." });
        return;
      }
      const data = (await response.json()) as { communes: CommuneStub[] };
      if (data.communes.length === 0) {
        setState({ kind: "error", message: `Aucune commune trouvée pour le code ${code}.` });
        return;
      }
      if (data.communes.length === 1) {
        await lookupCommune(data.communes[0]!.id);
        return;
      }
      setState({ kind: "choose", postalCode: code, communes: data.communes });
    } catch {
      setState({ kind: "error", message: "La recherche a échoué. Réessayez dans un instant." });
    }
  }

  async function lookupCommune(inseeCode: string) {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`${API}?insee=${encodeURIComponent(inseeCode)}`);
      if (!response.ok) {
        setState({ kind: "error", message: "Cette commune n'a pas pu être chargée." });
        return;
      }
      setState({ kind: "answer", answer: (await response.json()) as CommuneAnswer });
    } catch {
      setState({ kind: "error", message: "La recherche a échoué. Réessayez dans un instant." });
    }
  }

  return (
    <section aria-labelledby="commune-heading" className="space-y-4">
      <div className="space-y-2">
        <h2
          id="commune-heading"
          className="font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          Votre commune, vos grands électeurs
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          Combien de grands électeurs le barème attribue-t-il à votre commune ?
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void lookupPostalCode(postalCode.trim());
        }}
      >
        <div className="min-w-0">
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
            Code postal
          </label>
          <Input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="33000"
            value={postalCode}
            aria-describedby={state.kind === "error" ? errorId : undefined}
            aria-invalid={state.kind === "error" || undefined}
            onChange={(event) => setPostalCode(event.target.value.replace(/[^0-9]/g, ""))}
            className="h-11 w-32 tabular-nums"
          />
        </div>
        <Button type="submit" className="h-11 px-5" disabled={state.kind === "loading"}>
          {state.kind === "loading" ? "Recherche…" : "Voir"}
        </Button>
      </form>

      <div aria-live="polite" className="space-y-4">
        {state.kind === "error" && (
          <p id={errorId} className="text-sm text-destructive">
            {state.message}
          </p>
        )}

        {state.kind === "choose" && (
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium">
              Le code {state.postalCode} couvre {state.communes.length} communes. Laquelle est la
              vôtre ?
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {state.communes.map((commune) => (
                <li key={commune.id}>
                  <button
                    type="button"
                    onClick={() => void lookupCommune(commune.id)}
                    className="flex min-h-11 items-center rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    {commune.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.kind === "answer" && <CommuneAnswerPanel answer={state.answer} phase={phase} />}
      </div>
    </section>
  );
}

function CommuneAnswerPanel({ answer, phase }: { answer: CommuneAnswer; phase: BallotPhase }) {
  const { commune, college, inhabitantsPerDelegate, renewal, seatsAtStake, senators } = answer;
  const locative = getDepartmentLocative(commune.departmentCode);
  const where = locative ?? `dans le département ${commune.departmentName}`;
  const statutorySources =
    commune.departmentCode === "976"
      ? [SOURCE_TABLEAU_5, SOURCE_MAYOTTE_SEATS]
      : [SOURCE_TABLEAU_5, SOURCE_TABLEAU_6];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {commune.departmentName} ({commune.departmentCode})
        </p>
        <p className="font-display text-2xl font-extrabold tracking-tight">{commune.name}</p>

        {college === null ? (
          <MissingData className="mt-3" title="Nombre de délégués inconnu">
            Il manque la population municipale ou l{"'"}effectif du conseil pour appliquer le
            barème. Nous ne l{"'"}estimons pas.
          </MissingData>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {/* muted-foreground-strong, not muted-foreground: 12px text on the
                  tinted bg-muted/50 measures 4.4:1 in dark with the base token. */}
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground-strong">conseillers municipaux</dt>
                <dd className="font-display text-xl font-extrabold tabular-nums">
                  {formatInt(college.councilSeats)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground-strong">grands électeurs</dt>
                <dd className="font-display text-xl font-extrabold tabular-nums">
                  {formatInt(college.total)}
                </dd>
              </div>
            </dl>

            {inhabitantsPerDelegate !== null && (
              <p className="mt-3 text-sm text-muted-foreground">
                Poids par habitant :{" "}
                <span className="font-medium text-foreground tabular-nums">
                  1 grand électeur pour {formatInt(Math.round(inhabitantsPerDelegate))} habitants
                </span>
              </p>
            )}
          </>
        )}

        <div className="mt-3 rounded-lg border border-border p-3">
          {renewal === "renewed" && (
            <>
              <p className="font-semibold">{renewedHeadline(phase, seatsAtStake, where)}</p>
              {college !== null && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {renewedDetail(phase, college.total, commune.name)}
                </p>
              )}
            </>
          )}
          {renewal === "not-renewed" && (
            <>
              <p className="font-semibold">Aucun siège à pourvoir {where} cette année</p>
              {/* The 21 April decree convened only the councils of the renewed
                  departments (plus Guyane and Polynésie française) on 5 June, so a
                  série-1 commune designated nothing that day. The figure is therefore
                  what the barème gives on today's population and council, not a count
                  of people already appointed. */}
              <p className="mt-0.5 text-sm text-muted-foreground">
                Ce département relève de la série renouvelée en 2029.
                {college !== null
                  ? ` Avec sa population et l'effectif actuel du conseil, le barème donne ${formatInt(college.total)} grands électeurs pour ${commune.name} ; le collège appelé à voter en 2029 sera constitué pour ce renouvellement.`
                  : " Son collège sera constitué pour ce renouvellement."}
              </p>
            </>
          )}
          {renewal === "unknown" && (
            <MissingData title="Série de renouvellement inconnue">
              Le code de cette circonscription est absent de notre référentiel légal. Nous ne lui
              attribuons ni série ni nombre de sièges par approximation.
            </MissingData>
          )}
        </div>

        <Link
          href="/elections/senatoriales-2026/college-electoral"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          Voir le calcul du barème
        </Link>
      </div>

      <SenatorsList senators={senators} where={where} />

      <SourceLine
        sources={[...statutorySources, SOURCE_SENAT, SOURCE_ELECTORAL_CODE]}
        note={
          commune.departmentCode === "976"
            ? "Mayotte : 2 sièges selon LO473, renouvelés avec la série 1 selon L474 ; titulaires issus du Sénat ; barème appliqué à la population municipale et à l'effectif du conseil"
            : "Série et sièges issus des tableaux légaux ; titulaires issus du Sénat ; barème appliqué à la population municipale et à l'effectif du conseil"
        }
      />
    </div>
  );
}

function SenatorsList({ senators, where }: { senators: SittingSenator[]; where: string }) {
  if (senators.length === 0) {
    return (
      <MissingData title="Aucun sénateur rattaché à ce département">
        Les mandats sénatoriaux en cours sont repris de l{"'"}open data du Sénat. Si vous constatez
        une absence, signalez-la nous.
      </MissingData>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Vos sénateurs {where}</h3>
      <ul className="space-y-2">
        {senators.map((senator) => (
          <li key={senator.slug} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              {/* min-h-11 rather than a bare text link: the name is the card's only
                  target, and measured at 24px it fell short of the 44px rule. */}
              <Link
                href={`/politiques/${senator.slug}`}
                className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
              >
                {senator.fullName}
              </Link>
              {senator.series !== null && (
                <Badge variant="outline" className="text-xs">
                  {senator.series === 2 ? "Siège en jeu" : "Jusqu'en 2029"}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {senator.groupName ?? "Groupe non renseigné"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {senator.declarationYear !== null ? (
                <>Déclaration de patrimoine {senator.declarationYear}</>
              ) : (
                <>Aucune déclaration publiée par la HATVP à ce jour</>
              )}
            </p>
            {/* Discreet signal, never a filter, never a sort key, never an aggregate and
                never a counter. The earlier version rendered "N procédures en cours", which
                is a counter: it invites the reader to rank people by a number that says
                nothing about gravity or outcome. The data layer now exposes a boolean, so no
                cardinality reaches this component to be printed.

                The presumption of innocence is stated at every occurrence. No link of its
                own: the card already leads to the profile through the name, and a second link
                to the same place would compete with it while adding a target too small to
                hit. */}
            {senator.hasOngoingProceedings && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Procédure judiciaire en cours, présomption d{"'"}innocence. Détail sur la fiche.
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {/* One discreet line for an unavailable metric that applies to the whole section.
          Public cutover waits for production validation of source and identity coverage. */}
      <p className="text-xs text-muted-foreground">
        La participation aux scrutins publics n{"'"}est pas affichée pour les sénateurs pendant la
        validation de la complétude des listes officielles et des identités reliées. Elle ne mesure
        pas la présence physique.
      </p>
    </div>
  );
}
