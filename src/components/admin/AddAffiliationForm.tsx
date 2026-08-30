"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PARTY_ROLE_LABELS } from "@/config/labels";
import type { AffiliationMode, Party } from "./EditablePartyCard";

/**
 * The form that adds one party affiliation to a politician's history.
 *
 * Split out of a 499-line card. It decides nothing: the mode, whether the form can be submitted,
 * and the overlap warnings are all computed by the caller, which owns the record.
 */
export interface AddAffiliationFormValues {
  partyId: string;
  startDate: string;
  endDate: string;
  role: string;
  openMode: Exclude<AffiliationMode, "closed">;
}

interface AddAffiliationFormProps {
  addForm: AddAffiliationFormValues;
  setAddForm: React.Dispatch<React.SetStateAction<AddAffiliationFormValues>>;
  allParties: Party[];
  currentParty: Party | null;
  loading: boolean;
  canSubmitAdd: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function AddAffiliationForm({
  addForm,
  setAddForm,
  allParties,
  currentParty,
  loading,
  canSubmitAdd,
  onSubmit: handleAddAffiliation,
  onCancel: cancelAddAffiliation,
}: AddAffiliationFormProps) {
  return (
    <div className="mb-4 space-y-3 rounded-lg border p-4">
      <div>
        <Label htmlFor="add-party">Parti de l&apos;affiliation</Label>
        <Select
          id="add-party"
          value={addForm.partyId}
          onChange={(e) => setAddForm((prev) => ({ ...prev, partyId: e.target.value }))}
        >
          <option value="">— Sélectionner un parti —</option>
          {allParties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.shortName} — {party.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="add-start">Date de début de l&apos;affiliation</Label>
          <Input
            id="add-start"
            type="date"
            value={addForm.startDate}
            onChange={(e) => setAddForm((prev) => ({ ...prev, startDate: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="add-end">Date de fin de l&apos;affiliation</Label>
          <Input
            id="add-end"
            type="date"
            value={addForm.endDate}
            onChange={(e) => setAddForm((prev) => ({ ...prev, endDate: e.target.value }))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Laisser vide si l&apos;affiliation est toujours en cours.
          </p>
        </div>
        <div>
          <Label htmlFor="add-role">Rôle dans l&apos;affiliation</Label>
          <Select
            id="add-role"
            value={addForm.role}
            onChange={(e) => setAddForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            <option value="">— Aucun —</option>
            {Object.entries(PARTY_ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!addForm.endDate && (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Affiliation en cours
          </legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="add-open-mode"
              value="succeeds"
              checked={addForm.openMode === "succeeds"}
              onChange={() => setAddForm((prev) => ({ ...prev, openMode: "succeeds" }))}
              className="mt-1"
            />
            <span>
              Ce parti devient le parti actuel
              {currentParty && (
                <span className="block text-xs text-muted-foreground">
                  L&apos;affiliation à {currentParty.shortName || currentParty.name} sera clôturée
                  {addForm.startDate
                    ? ` le ${new Date(addForm.startDate).toLocaleDateString("fr-FR")}`
                    : ""}
                  .
                </span>
              )}
            </span>
          </label>
          {currentParty && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="add-open-mode"
                value="parallel"
                checked={addForm.openMode === "parallel"}
                onChange={() => setAddForm((prev) => ({ ...prev, openMode: "parallel" }))}
                className="mt-1"
              />
              <span>
                Affiliation en parallèle
                <span className="block text-xs text-muted-foreground">
                  Le parti actuel reste {currentParty.shortName || currentParty.name}, rien
                  n&apos;est clôturé.
                </span>
              </span>
            </label>
          )}
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleAddAffiliation} disabled={loading || !canSubmitAdd}>
          {loading ? "Enregistrement..." : "Ajouter"}
        </Button>
        <Button variant="outline" size="sm" onClick={cancelAddAffiliation} disabled={loading}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
