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
  PUBLICATION_STATUS_OPTIONS,
} from "@/config/labels";
import { LinkedAffairSelect } from "@/components/admin/LinkedAffairSelect";
import { PoliticianPicker } from "@/components/admin/PoliticianPicker";
import { AffairSentenceFields } from "@/components/admin/AffairSentenceFields";
import { AffairSourceFields } from "@/components/admin/AffairSourceFields";
import { involvementRequiresNote } from "@/lib/affairs/involvement-note";
import { formatAffairFormError } from "@/lib/admin/moderation-payload";
import type { AffairStatus, AffairCategory, Involvement, SourceType } from "@/types";
import type { PublicationStatus } from "@/generated/prisma";
import type { AffairFormData, Source } from "@/components/admin/affair-form-data";

interface AffairFormProps {
  initialData?: AffairFormData;
  initialPoliticianId?: string;
}

const emptySource: Source = {
  url: "",
  title: "",
  publisher: "",
  publishedAt: "",
  excerpt: "",
  sourceType: "MANUAL" as SourceType,
};

export function AffairForm({ initialData, initialPoliticianId }: AffairFormProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;
  const isPublished = initialData?.publicationStatus === "PUBLISHED";

  const [formData, setFormData] = useState<AffairFormData>(
    initialData || {
      politicianId: initialPoliticianId ?? "",
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
      setError("Veuillez sélectionner une personnalité politique");
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
            <PoliticianPicker
              value={formData.politicianId || null}
              onChange={(value) => updateField("politicianId", value ?? "")}
              readOnly={isPublished}
              label="Personnalité politique concernée *"
              description={
                isPublished
                  ? "La réattribution d’une affaire publiée est une opération éditoriale dédiée."
                  : undefined
              }
            />
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

          {formData.involvement && formData.involvement !== "DIRECT" && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                Personne non mise en cause : énoncer son rôle et, s&apos;il y a lieu, qui est
                réellement visé.{" "}
                {formData.involvement && involvementRequiresNote(formData.involvement) ? (
                  <strong className="text-foreground">
                    La note d&apos;implication est obligatoire à la publication.
                  </strong>
                ) : (
                  <span>La note est facultative pour ce rôle.</span>
                )}
              </p>
              <div>
                <Label htmlFor="involvementNote">
                  Note d&apos;implication (rôle sourcé, factuel)
                </Label>
                <Textarea
                  id="involvementNote"
                  value={formData.involvementNote || ""}
                  onChange={(e) => updateField("involvementNote", e.target.value)}
                  rows={2}
                  maxLength={280}
                  placeholder="Ex. Président de la commission d'enquête visée ; a reçu et rejeté les sollicitations."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {(formData.involvementNote || "").length}/280 — la nature du lien, pas une
                  qualification juridique nouvelle.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="subjectLabel">Sujet réellement visé (si autre)</Label>
                  <Input
                    id="subjectLabel"
                    value={formData.subjectLabel || ""}
                    onChange={(e) => updateField("subjectLabel", e.target.value)}
                    placeholder="Ex. Lagardère News"
                  />
                </div>
                <div>
                  <Label htmlFor="subjectKind">Type de sujet</Label>
                  <Select
                    id="subjectKind"
                    value={formData.subjectKind || ""}
                    onChange={(e) =>
                      updateField(
                        "subjectKind",
                        (e.target.value || undefined) as AffairFormData["subjectKind"]
                      )
                    }
                  >
                    <option value="">—</option>
                    <option value="PERSON">Personne</option>
                    <option value="ORGANISATION">Personne morale (hors périmètre)</option>
                    <option value="UNKNOWN">Inconnu</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="subjectNote">Note sur le sujet visé</Label>
                <Input
                  id="subjectNote"
                  value={formData.subjectNote || ""}
                  onChange={(e) => updateField("subjectNote", e.target.value)}
                  placeholder="Ex. Groupe de presse, propriété de Vincent Bolloré"
                />
              </div>
            </div>
          )}

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

      <AffairSentenceFields formData={formData} updateField={updateField} />

      <AffairSourceFields
        formData={formData}
        updateSource={updateSource}
        addSource={addSource}
        removeSource={removeSource}
      />

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
