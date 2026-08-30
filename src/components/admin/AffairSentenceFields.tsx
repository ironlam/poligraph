"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AffairFormData, UpdateAffairField } from "./affair-form-data";

/**
 * The conviction block of the affair form.
 *
 * Split out of a 637-line component. The comments inside are load-bearing: #576 turns on the
 * difference between an empty field sending `null` (reset the column) and `undefined`
 * (omit the key), and on `?? ""` rather than `|| ""` so a sentence of 0 firm months stays
 * visible. Moved verbatim.
 */
interface AffairSentenceFieldsProps {
  formData: AffairFormData;
  updateField: UpdateAffairField;
}

export function AffairSentenceFields({ formData, updateField }: AffairSentenceFieldsProps) {
  return (
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
            Résumé textuel. Les champs détaillés ci-dessous sont prioritaires pour l&apos;affichage.
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

          <div>
            {/* Named in full so it is not a substring of the ineligibility label, which
                  would make both ambiguous to a screen reader. */}
            <Label htmlFor="prisonFirmMonths">Prison, part non assortie du sursis (mois)</Label>
            <Input
              id="prisonFirmMonths"
              type="number"
              min="0"
              // `?? ""` and not `|| ""`: 0 means "entirely suspended" and has to stay
              // visible, and clearing the field must send null, not undefined, or the
              // property is omitted from the JSON instead of resetting the column (#576).
              value={formData.prisonFirmMonths ?? ""}
              onChange={(e) =>
                updateField(
                  "prisonFirmMonths",
                  e.target.value === "" ? null : Number.parseInt(e.target.value, 10)
                )
              }
              placeholder="vide si non établie"
            />
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
            <Label htmlFor="ineligibilityFirmMonths">
              Inéligibilité, part non assortie du sursis (mois)
            </Label>
            <Input
              id="ineligibilityFirmMonths"
              type="number"
              min="0"
              value={formData.ineligibilityFirmMonths ?? ""}
              onChange={(e) =>
                updateField(
                  "ineligibilityFirmMonths",
                  e.target.value === "" ? null : Number.parseInt(e.target.value, 10)
                )
              }
              placeholder="vide si non établie"
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
  );
}
