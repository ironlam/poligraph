"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DATA_SOURCE_LABELS,
  MANDATE_TYPE_LABELS,
  PUBLICATION_STATUS_LABELS,
} from "@/config/labels";
import { formatDate } from "@/lib/utils";
import type { DataSource, MandateType, PublicationStatus } from "@/types";

/** A namesake as `GET /api/admin/politiques/homonymes` serializes it. */
type Homonym = {
  id: string;
  publicId: string | null;
  fullName: string;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  publicationStatus: PublicationStatus;
  party: { name: string; shortName: string | null } | null;
  externalSources: DataSource[];
  mandates: Array<{
    type: MandateType;
    title: string;
    institution: string;
    departmentCode: string | null;
    isCurrent: boolean;
    commune: { name: string; departmentCode: string } | null;
  }>;
};

type Identity = {
  firstName: string;
  lastName: string;
  civility: string;
  birthDate: string;
  birthPlace: string;
};

const EMPTY: Identity = {
  firstName: "",
  lastName: "",
  civility: "",
  birthDate: "",
  birthPlace: "",
};

function mandateLine(mandate: Homonym["mandates"][number]): string {
  const place = mandate.commune
    ? `${mandate.commune.name} (${mandate.commune.departmentCode})`
    : mandate.departmentCode;
  const label = mandate.title || MANDATE_TYPE_LABELS[mandate.type];
  return [label, place, mandate.isCurrent ? "en cours" : "terminé"].filter(Boolean).join(" · ");
}

export function PoliticianCreateForm() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity>(EMPTY);
  // null until the namesakes of the name currently typed have been looked up.
  const [homonyms, setHomonyms] = useState<Homonym[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof Identity, value: string) {
    setIdentity((current) => ({ ...current, [field]: value }));
    // A list read for another name proves nothing about this one.
    if (field === "firstName" || field === "lastName") setHomonyms(null);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        firstName: identity.firstName,
        lastName: identity.lastName,
      });
      const res = await fetch(`/api/admin/politiques/homonymes?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Erreur ${res.status}`);
        return;
      }
      setHomonyms(json.homonyms ?? []);
    } catch {
      setError("La recherche n'a pas abouti. Vérifiez la connexion et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (homonyms === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/politiques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: identity.firstName,
          lastName: identity.lastName,
          civility: identity.civility || null,
          birthDate: identity.birthDate || null,
          birthPlace: identity.birthPlace || null,
          acknowledgedHomonymIds: homonyms.map((h) => h.id),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(json.homonyms)) {
        setHomonyms(json.homonyms);
        setError(json.error);
        return;
      }
      if (!res.ok) {
        setError(json.error ?? `Erreur ${res.status}`);
        return;
      }
      router.push(`/admin/politiques/${json.id}`);
    } catch {
      setError("La création n'a pas abouti. Vérifiez la connexion et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={search}>
        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName">Prénom *</Label>
                <Input
                  id="firstName"
                  value={identity.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName">Nom *</Label>
                <Input
                  id="lastName"
                  value={identity.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  maxLength={100}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="civility">Civilité</Label>
                <Select
                  id="civility"
                  value={identity.civility}
                  onChange={(e) => update("civility", e.target.value)}
                >
                  <option value="">Non renseignée</option>
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="birthDate">Date de naissance</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={identity.birthDate}
                  onChange={(e) => update("birthDate", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="birthPlace">Lieu de naissance</Label>
                <Input
                  id="birthPlace"
                  value={identity.birthPlace}
                  onChange={(e) => update("birthPlace", e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Laissez vide ce qui n&apos;est pas établi. La fiche est créée en brouillon, sans parti
              ni biographie.
            </p>
            <Button type="submit" disabled={busy} className="min-h-11">
              Rechercher les fiches du même nom
            </Button>
          </CardContent>
        </Card>
      </form>

      {homonyms !== null && (
        <Card>
          <CardHeader>
            <CardTitle>
              {homonyms.length === 0
                ? "Aucune fiche du même nom"
                : homonyms.length === 1
                  ? "1 fiche porte déjà ce nom"
                  : `${homonyms.length} fiches portent déjà ce nom`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {homonyms.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Vérifiez que la personne n&apos;a pas déjà sa fiche. Deux homonymes se distinguent
                  par la date de naissance, la commune ou le mandat.
                </p>
                <ul className="space-y-3">
                  {homonyms.map((h) => (
                    <li key={h.id} className="space-y-1 rounded-lg border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/politiques/${h.id}`}
                          prefetch={false}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center font-medium underline underline-offset-2"
                        >
                          {h.fullName}
                          <span className="sr-only"> (ouvre un nouvel onglet)</span>
                        </Link>
                        <Badge variant="outline">
                          {PUBLICATION_STATUS_LABELS[h.publicationStatus]}
                        </Badge>
                        {h.publicId && (
                          <span className="text-xs text-muted-foreground">{h.publicId}</span>
                        )}
                      </div>
                      <p className="text-sm">
                        {h.birthDate
                          ? `Naissance : ${formatDate(h.birthDate)}`
                          : "Date de naissance inconnue"}
                        {h.birthPlace && `, ${h.birthPlace}`}
                        {h.deathDate && ` · Décès : ${formatDate(h.deathDate)}`}
                        {h.party && ` · ${h.party.shortName ?? h.party.name}`}
                      </p>
                      {h.mandates.length > 0 ? (
                        <ul className="text-sm text-muted-foreground">
                          {h.mandates.map((mandate, index) => (
                            <li key={index}>{mandateLine(mandate)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">Aucun mandat enregistré</p>
                      )}
                      {h.externalSources.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Identifiants :{" "}
                          {h.externalSources.map((s) => DATA_SOURCE_LABELS[s] ?? s).join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Button type="button" onClick={create} disabled={busy} className="min-h-11">
              {homonyms.length === 0
                ? "Créer la fiche en brouillon"
                : "Aucune de ces personnes : créer une nouvelle fiche en brouillon"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
