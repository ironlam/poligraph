"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_CATEGORY_LABELS,
  INVOLVEMENT_LABELS,
  SOURCE_TYPE_LABELS,
  PUBLICATION_STATUS_OPTIONS,
} from "@/config/labels";
import { LinkedAffairSelect } from "@/components/admin/LinkedAffairSelect";
import { formatAffairFormError } from "@/lib/admin/moderation-payload";
import type { AffairStatus, AffairCategory, Involvement, SourceType } from "@/types";
import type { PublicationStatus } from "@/generated/prisma";

interface Politician {
  id: string;
  fullName: string;
  slug: string;
}

interface Source {
  id?: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string;
  excerpt?: string;
  sourceType?: SourceType;
}

interface AffairFormData {
  id?: string;
  politicianId: string;
  title: string;
  description: string;
  status: AffairStatus;
  category: AffairCategory;
  involvement?: Involvement;
  publicationStatus?: PublicationStatus;
  factsDate?: string;
  startDate?: string;
  verdictDate?: string;
  sentence?: string;
  appeal: boolean;
  // Detailed sentence
  prisonMonths?: number;
  prisonSuspended?: boolean;
  fineAmount?: number;
  ineligibilityMonths?: number;
  communityService?: number;
  otherSentence?: string;
  // Jurisdiction
  court?: string;
  caseNumber?: string;
  // Judicial identifiers
  linkedAffairId?: string | null;
  sources: Source[];
}

interface AffairFormProps {
  politicians: Politician[];
  initialData?: AffairFormData;
}

const emptySource: Source = {
  url: "",
  title: "",
  publisher: "",
  publishedAt: "",
  excerpt: "",
  sourceType: "MANUAL" as SourceType,
};

export function AffairForm({ politicians, initialData }: AffairFormProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;

  const [formData, setFormData] = useState<AffairFormData>(
    initialData || {
      politicianId: "",
      title: "",
      description: "",
      status: "ENQUETE_PRELIMINAIRE" as AffairStatus,
      category: "AUTRE" as AffairCategory,
      involvement: "MENTIONED_ONLY" as Involvement,
      appeal: false,
      linkedAffairId: null,
      sources: [{ ...emptySource }],
    }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateField<K extends keyof AffairFormData>(field: K, value: AffairFormData[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function updateSource(index: number, field: keyof Source, value: string) {
    const newSources = [...formData.sources];
    newSources[index]! = { ...newSources[index]!, [field]: value };
    setFormData((prev) => ({ ...prev, sources: newSources }));
  }

  function addSource() {
    setFormData((prev) => ({
      ...prev,
      sources: [...prev.sources, { ...emptySource }],
    }));
  }

  function removeSource(index: number) {
    if (formData.sources.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      sources: prev.sources.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.politicianId) {
      setError("Veuillez sélectionner un politique");
      return;
    }
    if (!formData.title.trim()) {
      setError("Le titre est requis");
      return;
    }
    if (!formData.description.trim()) {
      setError("La description est requise");
      return;
    }
    if (formData.sources.length === 0) {
      setError("Au moins une source est requise");
      return;
    }

    // Validate sources
    for (const source of formData.sources) {
      if (!source.url || !source.title || !source.publisher || !source.publishedAt) {
        setError("Toutes les sources doivent avoir URL, titre, éditeur et date");
        return;
      }
    }

    setLoading(true);

    try {
      const url = isEditing ? `/api/admin/affaires/${initialData.id}` : "/api/admin/affaires";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        // Surfaces publish-guard reasons (422), Zod errors, and plain messages.
        throw new Error(formatAffairFormError(data));
      }

      router.push("/admin/affaires");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div role="alert" aria-live="assertive" className="bg-red-50 text-red-700 p-4 rounded-md">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="politicianId">Politique concerné *</Label>
            <Select
              id="politicianId"
              value={formData.politicianId}
              onChange={(e) => updateField("politicianId", e.target.value)}
              required
            >
              <option value="">Sélectionner un politique</option>
              {politicians.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="title">Titre de l&apos;affaire *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Ex: Affaire des emplois fictifs du MoDem"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Description détaillée de l'affaire..."
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="category">Catégorie *</Label>
              <Select
                id="category"
                value={formData.category}
                onChange={(e) => updateField("category", e.target.value as AffairCategory)}
                required
              >
                {Object.entries(AFFAIR_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Statut *</Label>
              <Select
                id="status"
                value={formData.status}
                onChange={(e) => updateField("status", e.target.value as AffairStatus)}
                required
              >
                {Object.entries(AFFAIR_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="involvement">Implication</Label>
              <Select
                id="involvement"
                value={formData.involvement || "DIRECT"}
                onChange={(e) => updateField("involvement", e.target.value as Involvement)}
              >
                {Object.entries(INVOLVEMENT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            {isEditing && (
              <div>
                <Label htmlFor="publicationStatus">Publication</Label>
                <Select
                  id="publicationStatus"
                  value={formData.publicationStatus || "DRAFT"}
                  onChange={(e) =>
                    updateField("publicationStatus", e.target.value as PublicationStatus)
                  }
                >
                  {PUBLICATION_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <LinkedAffairSelect
            value={formData.linkedAffairId ?? null}
            onChange={(id) => updateField("linkedAffairId", id)}
            excludeId={initialData?.id}
            currentInvolvement={formData.involvement}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="factsDate">Date des faits</Label>
              <Input
                id="factsDate"
                type="date"
                value={formData.factsDate || ""}
                onChange={(e) => updateField("factsDate", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="startDate">Date révélation</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate || ""}
                onChange={(e) => updateField("startDate", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="verdictDate">Date verdict</Label>
              <Input
                id="verdictDate"
                type="date"
                value={formData.verdictDate || ""}
                onChange={(e) => updateField("verdictDate", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Juridiction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="court">Tribunal</Label>
              <Input
                id="court"
                value={formData.court || ""}
                onChange={(e) => updateField("court", e.target.value)}
                placeholder="Ex: Tribunal correctionnel de Paris"
              />
            </div>
            <div>
              <Label htmlFor="caseNumber">N° d&apos;affaire</Label>
              <Input
                id="caseNumber"
                value={formData.caseNumber || ""}
                onChange={(e) => updateField("caseNumber", e.target.value)}
                placeholder="Ex: 2023/12345"
              />
            </div>
          </div>

          <hr className="my-4" />
          <p className="text-xs text-muted-foreground">
            Les identifiants d&apos;une décision (ECLI, n° de pourvoi) ne se saisissent plus ici :
            une même décision peut concerner plusieurs affaires. Ils se gèrent en rattachant une
            décision de justice, plus bas sur cette fiche.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condamnation (si applicable)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sentence">Résumé de la peine</Label>
            <Input
              id="sentence"
              value={formData.sentence || ""}
              onChange={(e) => updateField("sentence", e.target.value)}
              placeholder="Ex: 2 ans de prison avec sursis, 5 ans d'inéligibilité"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Résumé textuel. Les champs détaillés ci-dessous sont prioritaires pour
              l&apos;affichage.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="appeal"
              checked={formData.appeal}
              onChange={(e) => updateField("appeal", e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="appeal">Appel en cours</Label>
          </div>

          <hr className="my-4" />
          <h4 className="font-medium text-sm">Détails de la peine</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="prisonMonths">Prison (mois)</Label>
              <Input
                id="prisonMonths"
                type="number"
                min="0"
                value={formData.prisonMonths || ""}
                onChange={(e) =>
                  updateField("prisonMonths", e.target.value ? parseInt(e.target.value) : undefined)
                }
                placeholder="0"
              />
            </div>

            <div className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                id="prisonSuspended"
                checked={formData.prisonSuspended || false}
                onChange={(e) => updateField("prisonSuspended", e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="prisonSuspended">Avec sursis</Label>
            </div>

            <div>
              <Label htmlFor="fineAmount">Amende (EUR)</Label>
              <Input
                id="fineAmount"
                type="number"
                min="0"
                step="100"
                value={formData.fineAmount || ""}
                onChange={(e) =>
                  updateField("fineAmount", e.target.value ? parseFloat(e.target.value) : undefined)
                }
                placeholder="0"
              />
            </div>

            <div>
              <Label htmlFor="ineligibilityMonths">Inéligibilité (mois)</Label>
              <Input
                id="ineligibilityMonths"
                type="number"
                min="0"
                value={formData.ineligibilityMonths || ""}
                onChange={(e) =>
                  updateField(
                    "ineligibilityMonths",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                placeholder="0"
              />
            </div>

            <div>
              <Label htmlFor="communityService">TIG (heures)</Label>
              <Input
                id="communityService"
                type="number"
                min="0"
                value={formData.communityService || ""}
                onChange={(e) =>
                  updateField(
                    "communityService",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                placeholder="0"
              />
            </div>

            <div>
              <Label htmlFor="otherSentence">Autre peine</Label>
              <Input
                id="otherSentence"
                value={formData.otherSentence || ""}
                onChange={(e) => updateField("otherSentence", e.target.value)}
                placeholder="Ex: interdiction d'exercer"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Sources * <span className="font-normal text-sm text-muted-foreground">(minimum 1)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {formData.sources.map((source, index) => (
            <div key={index} className="border p-4 rounded-lg space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Source {index + 1}</span>
                {formData.sources.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSource(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Supprimer
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>URL de l&apos;article *</Label>
                  <Input
                    value={source.url}
                    onChange={(e) => updateSource(index, "url", e.target.value)}
                    placeholder="https://..."
                    type="url"
                    required
                  />
                </div>

                <div>
                  <Label>Titre de l&apos;article *</Label>
                  <Input
                    value={source.title}
                    onChange={(e) => updateSource(index, "title", e.target.value)}
                    placeholder="Titre de l'article"
                    required
                  />
                </div>

                <div>
                  <Label>Éditeur/Journal *</Label>
                  <Input
                    value={source.publisher}
                    onChange={(e) => updateSource(index, "publisher", e.target.value)}
                    placeholder="Ex: Le Monde, Mediapart, AFP"
                    required
                  />
                </div>

                <div>
                  <Label>Date de publication *</Label>
                  <Input
                    type="date"
                    value={source.publishedAt}
                    onChange={(e) => updateSource(index, "publishedAt", e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label>Type de source</Label>
                  <Select
                    value={source.sourceType || "MANUAL"}
                    onChange={(e) => updateSource(index, "sourceType", e.target.value)}
                  >
                    {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label>Extrait clé (optionnel)</Label>
                <Textarea
                  value={source.excerpt || ""}
                  onChange={(e) => updateSource(index, "excerpt", e.target.value)}
                  placeholder="Citation importante de l'article..."
                  rows={2}
                />
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addSource}>
            + Ajouter une source
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? "Enregistrement..." : isEditing ? "Mettre à jour" : "Créer l'affaire"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/affaires")}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
