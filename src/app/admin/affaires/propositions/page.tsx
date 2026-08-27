"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import type { OfficialDecisionVerificationStatus } from "@/lib/affairs/official-decision-verification";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

// Affaires v2, lot 1: review queue for importer-proposed affair changes.
// Every automated write to an existing affair lands here first.

type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "AUTO_APPLIED" | "CONFLICT";
type ProposalRisk = "LOW" | "MEDIUM" | "HIGH";

interface AffairSnapshot {
  publicId: string | null;
  slug: string;
  title: string;
  politicianSlug: string | null;
  politicianName: string | null;
}

interface ProposalRow {
  id: string;
  importer: string;
  extractorVersion: string;
  proposedPatch: Record<string, unknown>;
  payloadKind: "PATCH" | "ADD_EVENT" | "INVALID";
  acceptanceEligible: boolean;
  validationIssues: string[];
  eventPreview: {
    date: string;
    type: string;
    title: string;
    description: string | null;
    sourceUrl: string;
    sourceTitle: string;
    identityKey: string;
    publisher: string;
  } | null;
  observedValues: Record<string, unknown>;
  affairSnapshot: AffairSnapshot;
  source: string;
  sourceUrl: string | null;
  sourceLink: {
    rawUrl: string | null;
    safeUrl: string | null;
  };
  officialId: string | null;
  sourceContentHash: string | null;
  sourceExcerpt: string | null;
  confidence: number;
  riskLevel: ProposalRisk;
  rationale: string;
  status: ProposalStatus;
  conflictDetail: Record<string, { expected: string; actual: string }> | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  officialEvidence: {
    required: boolean;
    acceptable: boolean;
    canonicalUrl: string | null;
    requestedUrl: string | null;
    status: OfficialDecisionVerificationStatus | null;
    checkedAt: string | null;
    matchedIdentifiers: string[];
    issues: string[];
  };
  /** Null once the affair has been deleted; fall back to affairSnapshot. */
  affair: {
    id: string;
    title: string;
    slug: string;
    publicationStatus: string;
    politician: { fullName: string; slug: string };
  } | null;
}

interface ListResponse {
  rows: ProposalRow[];
  total: number;
  page: number;
  totalPages: number;
  counts: Partial<Record<ProposalStatus, number>>;
}

const TABS: { key: ProposalStatus; label: string }[] = [
  { key: "PENDING", label: "En attente" },
  { key: "CONFLICT", label: "Conflits" },
  { key: "APPROVED", label: "Acceptées" },
  { key: "REJECTED", label: "Rejetées" },
  { key: "AUTO_APPLIED", label: "Auto-appliquées" },
];

const RISK_LABELS: Record<ProposalRisk, string> = {
  HIGH: "Risque élevé",
  MEDIUM: "Risque moyen",
  LOW: "Risque faible",
};

const RISK_VARIANTS: Record<ProposalRisk, "destructive" | "secondary" | "outline"> = {
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

const VERIFICATION_LABELS: Record<OfficialDecisionVerificationStatus, string> = {
  VALID: "Décision vérifiée en direct",
  REDIRECTED: "Redirection concordante, régénération requise",
  INDEX_VERIFIED: "Référence d’index déclarée, vérification humaine requise",
  BROKEN: "Lien indisponible",
  MISMATCH: "Le lien renvoie vers une autre décision",
  BLOCKED: "Vérification automatique impossible",
  UNCHECKED: "Preuve incomplète ou non vérifiée",
};

const IDENTIFIER_LABELS: Record<string, string> = {
  officialId: "identifiant officiel",
  pourvoi: "pourvoi",
  ecli: "ECLI",
  decisionDate: "date",
};

const VERIFICATION_ISSUE_LABELS: Record<string, string> = {
  decision_officielle_candidate_absente: "métadonnées de décision absentes",
  url_decision_absente: "URL de décision absente",
  source_url_et_decision_candidate_differentes: "URL source différente de l'URL candidate",
  identifiant_officiel_attendu_absent: "identifiant officiel absent",
  date_decision_attendue_absente: "date attendue absente",
  pourvoi_ou_ecli_attendu_absent: "pourvoi ou ECLI absent",
  url_et_identifiant_officiel_differents: "identifiant incompatible avec l'URL",
  pourvoi_absent_ou_different: "pourvoi absent ou différent",
  ecli_absent_ou_different: "ECLI absent ou différent",
  date_decision_absente_ou_differente: "date absente ou différente",
  redirection_vers_autre_decision: "redirection vers une autre décision",
  preuve_indexee_expiree_ou_date_invalide: "preuve indexée expirée",
  reference_indexee_declaree_concordante:
    "référence d’index déclarée concordante, provenance non indépendante",
  url_officielle_confirmee_par_index_exact:
    "ancienne référence d’index déclarée, provenance non indépendante",
};

function verificationIssueLabel(issue: string): string {
  if (/^http_[0-9]{3}$/.test(issue)) return `réponse HTTP ${issue.slice(5)}`;
  if (issue.startsWith("url_administration_non_cliquable:")) {
    return `URL non cliquable : ${issue.slice("url_administration_non_cliquable:".length).replaceAll("_", " ")}`;
  }
  return VERIFICATION_ISSUE_LABELS[issue] ?? issue.replaceAll("_", " ");
}

const FIELD_LABELS: Record<string, string> = {
  status: "Statut procédural",
  involvement: "Implication",
  category: "Catégorie",
  severity: "Gravité",
  factsDate: "Date des faits",
  startDate: "Date de révélation",
  verdictDate: "Date de décision",
  court: "Juridiction",
  chamber: "Chambre",
  caseNumber: "N° de dossier",
  sentence: "Peine (résumé)",
  prisonMonths: "Prison (mois)",
  prisonFirmMonths: "Prison, part non assortie du sursis (mois)",
  fineAmount: "Amende (€)",
  ineligibilityMonths: "Inéligibilité (mois)",
  ineligibilityFirmMonths: "Inéligibilité, part non assortie du sursis (mois)",
  communityService: "TIG (heures)",
  otherSentence: "Autre peine",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Mirrors EMPTY_VALUE from services/affairs/proposals, shown in conflict details. */
const EMPTY_MARKER = "∅";

function formatConflictValue(value: string): string {
  return value === EMPTY_MARKER ? "vide" : value;
}

/** Values arrive as JSON, so dates are ISO strings and arrays stay arrays. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "non renseigné";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "non renseigné";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "string" && ISO_DATE.test(value)) {
    return new Date(value).toLocaleDateString("fr-FR");
  }
  return String(value);
}

export default function PropositionsPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [tab, setTab] = useState<ProposalStatus>(
    initialStatus === "CONFLICT" ? "CONFLICT" : "PENDING"
  );
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; message: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/affaires/propositions?status=${tab}&page=${page}`);
      if (!res.ok) throw new Error("Chargement impossible");
      setData((await res.json()) as ListResponse);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      });
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "accept" | "reject") {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/affaires/propositions/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(notes[id] ? { reviewNotes: notes[id] } : {}),
      });
      const payload = (await res.json()) as {
        error?: string;
        conflictDetail?: Record<string, { expected: string; actual: string }>;
        verification?: { issues?: string[] };
      };
      if (!res.ok) {
        setFeedback({
          kind: "error",
          message:
            res.status === 409 && payload.conflictDetail
              ? "La valeur en base a changé depuis la proposition. Elle passe en conflit."
              : [payload.error, ...(payload.verification?.issues ?? []).map(verificationIssueLabel)]
                  .filter(Boolean)
                  .join(" : ") || "Action refusée",
        });
      } else {
        setFeedback({
          kind: "success",
          message: action === "accept" ? "Proposition appliquée." : "Proposition rejetée.",
        });
      }
      await load();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Propositions de modification"
        description="Chaque changement arrive avec sa source, son extrait justificatif et la valeur actuelle, pour être accepté ou rejeté explicitement."
      />

      <nav aria-label="Filtrer par état" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = data?.counts?.[t.key];
          const active = tab === t.key;
          return (
            <Button
              key={t.key}
              variant={active ? "default" : "outline"}
              size="sm"
              className="min-h-11"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
            >
              {t.label}
              {typeof count === "number" && (
                <span className="ml-2 text-xs opacity-80">{count}</span>
              )}
            </Button>
          );
        })}
      </nav>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={
            feedback.kind === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
              : "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
          }
        >
          {feedback.message}
        </div>
      )}

      {loading && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Chargement…
        </p>
      )}

      {!loading && data?.rows.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune proposition dans cet état.</p>
      )}

      <ul className="space-y-4">
        {data?.rows.map((row) => {
          const fields = Object.keys(row.proposedPatch);
          const evidence = row.officialEvidence;
          const evidenceDescriptionId = `preuve-officielle-${row.id}`;
          const sourceHref = evidence.required ? evidence.canonicalUrl : row.sourceLink.safeUrl;
          const rawSourceUrl = evidence.required ? evidence.requestedUrl : row.sourceLink.rawUrl;
          return (
            <li key={row.id}>
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {row.affair ? (
                        <Link
                          href={`/admin/affaires/${row.affair.id}/edit`}
                          className="inline-flex min-h-11 items-center font-semibold hover:underline"
                        >
                          {row.affair.title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{row.affairSnapshot.title}</span>
                      )}
                      <p className="text-muted-foreground text-sm">
                        {row.affair
                          ? `${row.affair.politician.fullName} · ${row.affair.publicationStatus}`
                          : `${row.affairSnapshot.politicianName ?? "personnalité inconnue"} · affaire supprimée${
                              row.affairSnapshot.publicId ? ` (${row.affairSnapshot.publicId})` : ""
                            }`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={RISK_VARIANTS[row.riskLevel]}>
                        {RISK_LABELS[row.riskLevel]}
                      </Badge>
                      <Badge variant="outline">confiance {row.confidence}</Badge>
                      <Badge variant="outline">
                        {row.importer}@{row.extractorVersion}
                      </Badge>
                      {row.payloadKind === "ADD_EVENT" && (
                        <Badge variant="destructive">Nouvel événement</Badge>
                      )}
                      {evidence.required && (
                        <Badge variant={evidence.acceptable ? "outline" : "destructive"}>
                          {evidence.status
                            ? VERIFICATION_LABELS[evidence.status]
                            : "Décision non vérifiée"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {row.payloadKind === "INVALID" ? (
                    <p className="text-muted-foreground text-sm">
                      Le contenu imbriqué ne peut pas être présenté de façon sûre.
                    </p>
                  ) : row.payloadKind === "ADD_EVENT" && row.eventPreview ? (
                    <div className="border-border bg-muted/30 rounded-md border p-4 text-sm">
                      <p className="font-semibold">Ajout proposé à la chronologie</p>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]">
                        <dt className="text-muted-foreground">Date</dt>
                        <dd>{formatValue(row.eventPreview.date)}</dd>
                        <dt className="text-muted-foreground">Type</dt>
                        <dd>{row.eventPreview.type}</dd>
                        <dt className="text-muted-foreground">Titre public</dt>
                        <dd>{row.eventPreview.title}</dd>
                        <dt className="text-muted-foreground">Source</dt>
                        <dd>{row.eventPreview.sourceTitle}</dd>
                        <dt className="text-muted-foreground">Éditeur</dt>
                        <dd>{row.eventPreview.publisher}</dd>
                        <dt className="text-muted-foreground">URL</dt>
                        <dd className="break-all">{row.eventPreview.sourceUrl}</dd>
                        <dt className="text-muted-foreground">Identité technique</dt>
                        <dd className="font-mono text-xs break-all">
                          {row.eventPreview.identityKey}
                        </dd>
                      </dl>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <caption className="sr-only">
                          Valeurs actuelles et valeurs proposées pour {row.affairSnapshot.title}
                        </caption>
                        <thead>
                          <tr className="text-muted-foreground text-left text-xs uppercase">
                            <th scope="col" className="py-2 pr-4 font-medium">
                              Champ
                            </th>
                            <th scope="col" className="py-2 pr-4 font-medium">
                              Actuel
                            </th>
                            <th scope="col" className="py-2 font-medium">
                              Proposé
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((field) => (
                            <tr key={field} className="border-border/60 border-t">
                              <th scope="row" className="py-2 pr-4 text-left font-normal">
                                {FIELD_LABELS[field] ?? field}
                              </th>
                              <td className="text-muted-foreground py-2 pr-4">
                                {formatValue(row.observedValues[field])}
                              </td>
                              <td className="py-2 font-medium">
                                {formatValue(row.proposedPatch[field])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {row.conflictDetail && (
                    <div className="border-destructive/40 bg-destructive/10 flex gap-2 rounded-md border px-3 py-2 text-sm">
                      <AlertTriangle
                        className="text-destructive mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-medium">Conflit détecté</p>
                        <ul className="mt-1 space-y-0.5">
                          {Object.entries(row.conflictDetail).map(([field, detail]) => (
                            <li key={field}>
                              {FIELD_LABELS[field] ?? field} : attendu «&nbsp;
                              {formatConflictValue(detail.expected)}&nbsp;», trouvé «&nbsp;
                              {formatConflictValue(detail.actual)}&nbsp;»
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {row.validationIssues.length > 0 && (
                    <div
                      id={`validation-${row.id}`}
                      className="border-destructive/40 bg-destructive/10 flex gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <ShieldAlert
                        className="text-destructive mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-medium">Proposition non applicable</p>
                        <ul className="mt-1 list-disc pl-4">
                          {row.validationIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {evidence.required && (
                    <div
                      id={evidenceDescriptionId}
                      className={
                        evidence.acceptable
                          ? "flex gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
                          : "border-destructive/40 bg-destructive/10 flex gap-2 rounded-md border px-3 py-2 text-sm"
                      }
                    >
                      {evidence.acceptable ? (
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldAlert
                          className="text-destructive mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <div className="space-y-1">
                        <p className="font-medium">
                          {evidence.status
                            ? VERIFICATION_LABELS[evidence.status]
                            : "Décision officielle non vérifiée"}
                        </p>
                        {evidence.matchedIdentifiers.length > 0 && (
                          <p>
                            Concordances :{" "}
                            {evidence.matchedIdentifiers
                              .map((identifier) => IDENTIFIER_LABELS[identifier] ?? identifier)
                              .join(", ")}
                          </p>
                        )}
                        {evidence.checkedAt && (
                          <p className="text-muted-foreground">
                            Contrôle du {new Date(evidence.checkedAt).toLocaleString("fr-FR")}
                          </p>
                        )}
                        {evidence.issues.length > 0 && (
                          <ul className="list-disc pl-4">
                            {evidence.issues.map((issue) => (
                              <li key={issue}>{verificationIssueLabel(issue)}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-muted-foreground">Justification : </span>
                      {row.rationale}
                    </p>
                    {row.sourceExcerpt && (
                      <blockquote className="border-border text-muted-foreground border-l-2 pl-3 italic">
                        {row.sourceExcerpt}
                      </blockquote>
                    )}
                    <p className="flex flex-wrap items-center gap-3">
                      {sourceHref ? (
                        <a
                          href={sourceHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ouvrir la source ${row.source} dans un nouvel onglet`}
                          className="inline-flex min-h-11 items-center gap-1 hover:underline"
                        >
                          {row.source}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">(nouvel onglet)</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground flex flex-col gap-1">
                          <span>{row.source}</span>
                          {rawSourceUrl && <span className="break-all">{rawSourceUrl}</span>}
                        </span>
                      )}
                      {row.officialId && (
                        <span className="text-muted-foreground">{row.officialId}</span>
                      )}
                      <span className="text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString("fr-FR")}
                      </span>
                    </p>
                  </div>

                  {row.status === "PENDING" ? (
                    <div className="space-y-2">
                      <label htmlFor={`note-${row.id}`} className="text-muted-foreground text-sm">
                        Note de revue (optionnelle)
                      </label>
                      <Textarea
                        id={`note-${row.id}`}
                        rows={2}
                        value={notes[row.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          className="min-h-11"
                          onClick={() => void review(row.id, "accept")}
                          disabled={
                            busyId === row.id ||
                            !row.acceptanceEligible ||
                            (evidence.required && !evidence.acceptable)
                          }
                          aria-describedby={
                            !row.acceptanceEligible
                              ? `validation-${row.id}`
                              : evidence.required
                                ? evidenceDescriptionId
                                : undefined
                          }
                          title={
                            !row.acceptanceEligible
                              ? "Acceptation bloquée car la proposition ou sa provenance est invalide"
                              : evidence.required && !evidence.acceptable
                                ? "Acceptation bloquée tant que la décision officielle n'est pas vérifiée"
                                : undefined
                          }
                        >
                          Accepter et appliquer
                        </Button>
                        <Button
                          className="min-h-11"
                          variant="outline"
                          onClick={() => void review(row.id, "reject")}
                          disabled={busyId === row.id}
                        >
                          Rejeter
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {row.reviewedBy && row.reviewedAt
                        ? `${row.status} par ${row.reviewedBy} le ${new Date(row.reviewedAt).toLocaleString("fr-FR")}`
                        : row.status}
                      {row.reviewNotes ? ` - ${row.reviewNotes}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {data && data.totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {data.page} sur {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
