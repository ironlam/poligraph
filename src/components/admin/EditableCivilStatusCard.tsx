"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { PUBLICATION_STATUS_STYLES, PUBLICATION_STATUS_LABELS } from "@/config/labels";
import { formatDate, formatDateForInput } from "@/lib/utils";
import type { PublicationStatus } from "@/generated/prisma";

interface ExternalIdData {
  id: string;
  source: string;
  externalId: string;
  url: string | null;
}

interface EditableCivilStatusCardProps {
  politician: {
    id: string;
    slug: string;
    civility: string | null;
    firstName: string;
    lastName: string;
    fullName: string;
    birthDate: Date | null;
    deathDate: Date | null;
    birthPlace: string | null;
    biography: string | null;
    publicationStatus: PublicationStatus;
    photoUrl: string | null;
    photoSource: string | null;
    currentPartyId: string | null;
    externalIds: ExternalIdData[];
    _count: { affairs: number };
  };
}

interface FormState {
  civility: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  deathDate: string;
  birthPlace: string;
  biography: string;
}

export function EditableCivilStatusCard({ politician }: EditableCivilStatusCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState<FormState>({
    civility: politician.civility || "",
    firstName: politician.firstName,
    lastName: politician.lastName,
    birthDate: formatDateForInput(politician.birthDate),
    deathDate: formatDateForInput(politician.deathDate),
    birthPlace: politician.birthPlace || "",
    biography: politician.biography || "",
  });

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    setForm({
      civility: politician.civility || "",
      firstName: politician.firstName,
      lastName: politician.lastName,
      birthDate: formatDateForInput(politician.birthDate),
      deathDate: formatDateForInput(politician.deathDate),
      birthPlace: politician.birthPlace || "",
      biography: politician.biography || "",
    });
    setIsEditing(false);
    setStatus("idle");
    setErrorMessage("");
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setStatus("error");
      setErrorMessage("Prénom et nom sont requis");
      return;
    }

    setLoading(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/admin/politiques/${politician.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: politician.id,
          slug: politician.slug,
          civility: form.civility || null,
          firstName: form.firstName,
          lastName: form.lastName,
          birthDate: form.birthDate || null,
          birthPlace: form.birthPlace || null,
          deathDate: form.deathDate || null,
          biography: form.biography || null,
          // Pass through unchanged fields to avoid erasing them
          photoUrl: politician.photoUrl,
          photoSource: politician.photoSource,
          currentPartyId: politician.currentPartyId,
          externalIds: politician.externalIds.map((ext) => ({
            id: ext.id,
            source: ext.source,
            externalId: ext.externalId,
            url: ext.url,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erreur lors de la sauvegarde");
      }

      setStatus("saved");
      setIsEditing(false);
      router.refresh();
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Informations générales</CardTitle>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsEditing(true);
              setStatus("idle");
            }}
          >
            Éditer
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {status === "saved" && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700"
          >
            Modifications enregistrées
          </div>
        )}
        {status === "error" && errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-civility">Civilité</Label>
                <Select
                  id="edit-civility"
                  value={form.civility}
                  onChange={(e) => updateField("civility", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-firstName">
                  Prénom <span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="edit-firstName"
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div>
                <Label htmlFor="edit-lastName">
                  Nom <span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="edit-lastName"
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  required
                  aria-required="true"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-birthDate">Date de naissance</Label>
                <Input
                  id="edit-birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => updateField("birthDate", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="edit-deathDate">Date de décès</Label>
                <Input
                  id="edit-deathDate"
                  type="date"
                  value={form.deathDate}
                  onChange={(e) => updateField("deathDate", e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-birthPlace">Lieu de naissance</Label>
              <Input
                id="edit-birthPlace"
                value={form.birthPlace}
                onChange={(e) => updateField("birthPlace", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="edit-biography">Biographie</Label>
              <Textarea
                id="edit-biography"
                value={form.biography}
                onChange={(e) => updateField("biography", e.target.value)}
                rows={4}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={loading} size="sm">
                {loading ? "Enregistrement..." : "Sauvegarder"}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={loading} size="sm">
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Slug</span>
            <span className="font-mono">{politician.slug}</span>

            <span className="text-muted-foreground">Civilité</span>
            <span>{politician.civility || "—"}</span>

            <span className="text-muted-foreground">Prénom</span>
            <span>{politician.firstName}</span>

            <span className="text-muted-foreground">Nom</span>
            <span>{politician.lastName}</span>

            <span className="text-muted-foreground">Date de naissance</span>
            <span>{formatDate(politician.birthDate)}</span>

            <span className="text-muted-foreground">Date de décès</span>
            <span>{formatDate(politician.deathDate)}</span>

            <span className="text-muted-foreground">Lieu de naissance</span>
            <span>{politician.birthPlace || "—"}</span>

            <span className="text-muted-foreground">Biographie</span>
            <span className="line-clamp-2">{politician.biography || "—"}</span>

            <span className="text-muted-foreground">Statut</span>
            <span>
              <Badge
                variant="outline"
                className={PUBLICATION_STATUS_STYLES[politician.publicationStatus] || ""}
              >
                {PUBLICATION_STATUS_LABELS[politician.publicationStatus] ||
                  politician.publicationStatus}
              </Badge>
            </span>

            <span className="text-muted-foreground">Affaires</span>
            <span>
              {politician._count.affairs > 0 ? (
                <Badge variant="destructive">{politician._count.affairs}</Badge>
              ) : (
                "0"
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
