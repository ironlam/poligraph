"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SOURCE_TYPE_LABELS } from "@/config/labels";
import type { AffairFormData, Source } from "./affair-form-data";

/**
 * The sources block of the affair form: at least one press reference per affair.
 *
 * Split out of a 637-line component. Every affair needs a source before it can be published
 * (`assertPublishable`), so this block is not optional decoration.
 */
interface AffairSourceFieldsProps {
  formData: AffairFormData;
  updateSource: (index: number, field: keyof Source, value: string) => void;
  addSource: () => void;
  removeSource: (index: number) => void;
}

export function AffairSourceFields({
  formData,
  updateSource,
  addSource,
  removeSource,
}: AffairSourceFieldsProps) {
  return (
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
  );
}
