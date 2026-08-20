"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShieldAlert } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AffairPicker } from "@/components/admin/AffairPicker";
import { PoliticianPicker, type PoliticianPickerResult } from "@/components/admin/PoliticianPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Context = {
  affair: {
    id: string;
    title: string;
    slug: string;
    oldSlugs: string[];
    publicationStatus: string;
    status: string;
    involvement: string;
    involvementNote: string | null;
    subjectLabel: string | null;
    partyAtTime: { shortName: string | null; name: string } | null;
    politicianId: string;
    updatedAt: string;
    sources: Array<{ id: string; url: string; title: string; publisher: string }>;
    pressArticles: Array<{ id: string; articleId: string; role: string }>;
    courtDecisions: Array<{ courtDecisionId: string }>;
    affairPoliticianDecisions: Array<{
      id: string;
      chosenPoliticianId: string | null;
      judgment: string;
      reviewedAt: string | null;
    }>;
    politician: {
      id: string;
      fullName: string;
      slug: string;
      currentParty: { shortName: string | null; name: string } | null;
    };
  };
  snapshot: {
    affairId: string;
    politicianId: string;
    slug: string;
    publicationStatus: string;
    updatedAt: string;
    stateToken: string;
  };
};
type Preview = Context & {
  proposedPolitician: PoliticianPickerResult;
  impact: {
    oldSlug: string;
    newSlug: string;
    oldSlugs: string[];
    publicationStatus: string;
    unchanged: string[];
    warnings: string[];
  };
};

export function AffairPoliticianWorkbench() {
  const [affairId, setAffairId] = useState<string | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [politicianId, setPoliticianId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [justification, setJustification] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadAffair(id: string | null) {
    setAffairId(id);
    setContext(null);
    setPreview(null);
    setPoliticianId(null);
    setError(null);
    setSuccess(null);
    if (!id) return;
    const response = await fetch(
      `/api/admin/relationships/affairs-politicians?affairId=${encodeURIComponent(id)}`
    );
    if (!response.ok) {
      setError("Impossible de charger le contexte de l’affaire.");
      return;
    }
    setContext((await response.json()) as Context);
  }

  async function buildPreview() {
    if (!affairId || !politicianId) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/relationships/affairs-politicians/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ affairId, politicianId }),
    });
    const payload = (await response.json().catch(() => ({}))) as Preview & { error?: string };
    if (!response.ok) setError(payload.error ?? "Impossible de construire l’aperçu.");
    else setPreview(payload);
    setBusy(false);
  }

  async function apply() {
    if (!preview || !affairId || !politicianId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/admin/relationships/affairs-politicians", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affairId,
        politicianId,
        justification,
        confirmation,
        expected: preview.snapshot,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setError(payload.error ?? "La réattribution a été refusée.");
    else {
      setSuccess(
        "La réattribution a été enregistrée et l’affaire est disponible pour une nouvelle revue."
      );
      await loadAffair(affairId);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Affaires ↔ personnalités"
        description="Réattribuer une affaire depuis un aperçu audité et contrôlé par le serveur."
        help="L’ancien écran de revue automatique reste accessible dans la file de matching."
        action={
          <Link
            href="/admin/affair-matching/review"
            className="min-h-11 inline-flex items-center rounded-md border px-4 py-2 text-sm"
          >
            Ouvrir la file automatique
          </Link>
        }
      />
      <AffairPicker
        value={affairId}
        onChange={(id) => void loadAffair(id)}
        description="Sélectionnez une affaire pour voir son identité actuelle et ses relations."
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-md border border-emerald-500/40 p-3 text-sm text-emerald-700"
        >
          {success}
        </p>
      )}
      {context && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Relation actuelle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <h2 className="font-semibold">{context.affair.title}</h2>
              <p>Slug : {context.affair.slug}</p>
              <p>
                Statut : {context.affair.publicationStatus} · Procédure : {context.affair.status}
              </p>
              <p>
                Personnalité : {context.affair.politician.fullName} ·{" "}
                {context.affair.politician.currentParty?.shortName ||
                  context.affair.politician.currentParty?.name ||
                  "Sans parti"}
              </p>
              <p>
                Parti au moment des faits :{" "}
                {context.affair.partyAtTime?.shortName ||
                  context.affair.partyAtTime?.name ||
                  "Non renseigné"}
              </p>
              <p>
                Sources : {context.affair.sources.length} · Articles liés :{" "}
                {context.affair.pressArticles.length} · Décisions :{" "}
                {context.affair.courtDecisions.length}
              </p>
              <p>Slugs historiques : {context.affair.oldSlugs.join(", ") || "aucun"}</p>
              <p className="text-xs text-muted-foreground">
                Mise à jour : {new Date(context.affair.updatedAt).toLocaleString("fr-FR")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Nouvelle personnalité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PoliticianPicker
                value={politicianId}
                onChange={setPoliticianId}
                description="La sélection ne modifie aucune donnée avant l’aperçu."
              />
              <Button
                type="button"
                disabled={!politicianId || busy}
                onClick={() => void buildPreview()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Construire
                l’aperçu serveur
              </Button>
            </CardContent>
          </Card>
          {preview && (
            <Card className="lg:col-span-2 border-primary/40">
              <CardHeader>
                <CardTitle>Aperçu avant confirmation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="font-medium">Avant</p>
                    <p>{preview.affair.politician.fullName}</p>
                    <p>{preview.impact.oldSlug}</p>
                  </div>
                  <div>
                    <p className="font-medium">Après</p>
                    <p>{preview.proposedPolitician.fullName}</p>
                    <p>{preview.impact.newSlug}</p>
                  </div>
                </div>
                <p>
                  Publication après opération : <strong>{preview.impact.publicationStatus}</strong>
                </p>
                <p>
                  Ancien slug conservé : oui. Relations inchangées :{" "}
                  {preview.impact.unchanged.join(", ")}.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {preview.impact.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                {preview.affair.publicationStatus === "PUBLISHED" && (
                  <p className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-900">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Cette réattribution dépubliera temporairement l’affaire. Elle devra être relue
                    puis republiée avec les contrôles habituels.
                  </p>
                )}
                <label className="block font-medium" htmlFor="reassignment-justification">
                  Justification, 20 caractères minimum, 30 pour une affaire publiée
                </label>
                <textarea
                  id="reassignment-justification"
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  className="min-h-24 w-full rounded-md border bg-background p-3"
                />
                {preview.affair.publicationStatus === "PUBLISHED" && (
                  <>
                    <label className="block font-medium" htmlFor="reassignment-confirmation">
                      Recopiez exactement le titre de l’affaire
                    </label>
                    <input
                      id="reassignment-confirmation"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      className="min-h-11 w-full rounded-md border bg-background px-3"
                    />
                  </>
                )}
                <Button
                  type="button"
                  disabled={
                    busy ||
                    justification.trim().length <
                      (preview.affair.publicationStatus === "PUBLISHED" ? 30 : 20) ||
                    (preview.affair.publicationStatus === "PUBLISHED" &&
                      confirmation !== preview.affair.title)
                  }
                  onClick={() => void apply()}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Confirmer
                  la réattribution
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
