"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAdminMutation } from "@/hooks";
import { ensureContrast } from "@/lib/contrast";
import { formatDateForInput } from "@/lib/utils";
import { PARTY_ROLE_LABELS } from "@/config/labels";
import { AddAffiliationForm } from "@/components/admin/AddAffiliationForm";

export interface Party {
  id: string;
  name: string;
  shortName: string;
  color: string | null;
}

interface PartyMembership {
  id: string;
  partyId: string;
  role: string;
  startDate: Date | null;
  endDate: Date | null;
  party: Party;
}

interface EditablePartyCardProps {
  politicianId: string;
  currentParty: Party | null;
  partyHistory: PartyMembership[];
  allParties: Party[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_PARTY_FORM = {
  partyId: "",
  startDate: new Date().toISOString().split("T")[0] ?? "",
  role: "",
};
const EMPTY_MEMBERSHIP_FORM = { startDate: "", endDate: "", role: "" };

interface OverlapWarning {
  type: "OVERLAP";
  partyId: string;
  partyShortName: string;
  startDate: string | null;
  endDate: string | null;
}

export type AffiliationMode = "closed" | "succeeds" | "parallel";

const EMPTY_ADD_FORM = {
  partyId: "",
  startDate: "",
  endDate: "",
  role: "",
  openMode: "succeeds" as Exclude<AffiliationMode, "closed">,
};

function formatStartDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR");
}

function formatEndDate(date: Date | null): string {
  if (!date) return "En cours";
  return new Date(date).toLocaleDateString("fr-FR");
}

function renderPartyBadge(party: Party) {
  const color = party.color || "#6b7280";
  return (
    <Badge
      variant="outline"
      style={{
        backgroundColor: `${color}20`,
        color: ensureContrast(color, "#ffffff"),
        borderColor: `${color}30`,
      }}
    >
      {party.shortName || party.name}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EditablePartyCard({
  politicianId,
  currentParty,
  partyHistory,
  allParties,
}: EditablePartyCardProps) {
  const { loading, status, mutate, clearStatus } = useAdminMutation({ refresh: true });

  const [isChangingParty, setIsChangingParty] = useState(false);
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [confirmDeleteMembershipId, setConfirmDeleteMembershipId] = useState<string | null>(null);

  const [partyForm, setPartyForm] = useState({ ...EMPTY_PARTY_FORM });
  const [membershipForm, setMembershipForm] = useState({ ...EMPTY_MEMBERSHIP_FORM });

  const [isAddingAffiliation, setIsAddingAffiliation] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_ADD_FORM });
  // Kept out of `status`: useAdminMutation auto-clears status after 3 seconds, and an
  // overlap notice has to outlive the green banner.
  const [warnings, setWarnings] = useState<OverlapWarning[]>([]);

  // --- Section A: Change current party ---

  function handleCancelPartyChange() {
    setIsChangingParty(false);
    setPartyForm({ ...EMPTY_PARTY_FORM });
  }

  async function handleSubmitPartyChange() {
    const body: Record<string, string> = {
      partyId: partyForm.partyId,
      startDate: partyForm.startDate,
    };
    if (partyForm.role) body.role = partyForm.role;

    const result = await mutate(`/api/admin/politiques/${politicianId}/party`, {
      method: "POST",
      body: JSON.stringify(body),
      successMessage: "Parti mis à jour",
    });
    if (result) {
      setIsChangingParty(false);
      setPartyForm({ ...EMPTY_PARTY_FORM });
    }
  }

  async function handleRemoveParty() {
    await mutate(`/api/admin/politiques/${politicianId}/party`, {
      method: "DELETE",
      body: JSON.stringify({}),
      successMessage: "Affiliation retirée",
    });
  }

  // --- Section B: Membership history ---

  function startEditMembership(membership: PartyMembership) {
    setEditingMembershipId(membership.id);
    setMembershipForm({
      startDate: formatDateForInput(membership.startDate),
      endDate: formatDateForInput(membership.endDate),
      role: membership.role,
    });
  }

  function cancelEditMembership() {
    setEditingMembershipId(null);
    setMembershipForm({ ...EMPTY_MEMBERSHIP_FORM });
  }

  async function handleSaveMembership(membershipId: string) {
    const body: Record<string, string | null> = {};
    if (membershipForm.startDate) body.startDate = membershipForm.startDate;
    body.endDate = membershipForm.endDate || null;
    if (membershipForm.role) body.role = membershipForm.role;

    const result = await mutate(
      `/api/admin/politiques/${politicianId}/party-membership/${membershipId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        successMessage: "Affiliation mise à jour",
      }
    );
    if (result) {
      setEditingMembershipId(null);
      setMembershipForm({ ...EMPTY_MEMBERSHIP_FORM });
    }
  }

  async function handleDeleteMembership(membershipId: string) {
    await mutate(`/api/admin/politiques/${politicianId}/party-membership/${membershipId}`, {
      method: "DELETE",
      successMessage: "Affiliation supprimée",
    });
    setConfirmDeleteMembershipId(null);
  }

  const addMode: AffiliationMode = addForm.endDate ? "closed" : addForm.openMode;
  const canSubmitAdd =
    Boolean(addForm.partyId) && (addMode !== "succeeds" || Boolean(addForm.startDate));

  function cancelAddAffiliation() {
    setIsAddingAffiliation(false);
    setAddForm({ ...EMPTY_ADD_FORM });
  }

  async function handleAddAffiliation() {
    setWarnings([]);

    const body: Record<string, string> = { mode: addMode, partyId: addForm.partyId };
    if (addForm.startDate) body.startDate = addForm.startDate;
    if (addForm.endDate) body.endDate = addForm.endDate;
    if (addForm.role) body.role = addForm.role;

    const response = await mutate(`/api/admin/politiques/${politicianId}/party-membership`, {
      method: "POST",
      body: JSON.stringify(body),
      successMessage: "Affiliation ajoutée",
    });

    if (!response) return;

    const payload = (await response.json().catch(() => ({ warnings: [] }))) as {
      warnings?: OverlapWarning[];
    };
    setWarnings(payload.warnings ?? []);
    setIsAddingAffiliation(false);
    setAddForm({ ...EMPTY_ADD_FORM });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parti et affiliations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status messages */}
        {status && (
          <div
            role={status.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={
              status.type === "success"
                ? "rounded-md bg-green-50 p-3 text-sm text-green-700"
                : "rounded-md bg-red-50 p-3 text-sm text-red-700"
            }
          >
            {status.message}
          </div>
        )}

        {warnings.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"
          >
            <p className="font-medium">Chevauchements détectés</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((warning, index) => (
                <li key={index}>
                  {warning.partyShortName} (
                  {formatStartDate(warning.startDate ? new Date(warning.startDate) : null)} à{" "}
                  {formatEndDate(warning.endDate ? new Date(warning.endDate) : null)})
                </li>
              ))}
            </ul>
            <p className="mt-1">
              L&apos;affiliation a bien été enregistrée. Vérifiez les dates si ce n&apos;est pas
              voulu.
            </p>
          </div>
        )}

        {/* Section A: Parti actuel */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Parti actuel
          </h2>

          {!isChangingParty ? (
            <div className="flex items-center gap-3">
              {currentParty ? (
                renderPartyBadge(currentParty)
              ) : (
                <span className="text-sm text-muted-foreground">Aucun parti</span>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsChangingParty(true);
                    clearStatus();
                  }}
                >
                  Changer
                </Button>
                {currentParty && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmRemoveOpen(true)}
                    disabled={loading}
                  >
                    Retirer
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <Label htmlFor="party-select">Parti</Label>
                <Select
                  id="party-select"
                  value={partyForm.partyId}
                  onChange={(e) => setPartyForm((prev) => ({ ...prev, partyId: e.target.value }))}
                >
                  <option value="">— Sélectionner un parti —</option>
                  {allParties.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.shortName} — {party.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="party-start-date">Date de début</Label>
                  <Input
                    id="party-start-date"
                    type="date"
                    value={partyForm.startDate}
                    onChange={(e) =>
                      setPartyForm((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="party-role">Rôle (optionnel)</Label>
                  <Select
                    id="party-role"
                    value={partyForm.role}
                    onChange={(e) => setPartyForm((prev) => ({ ...prev, role: e.target.value }))}
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

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleSubmitPartyChange}
                  disabled={loading || !partyForm.partyId}
                >
                  {loading ? "Enregistrement..." : "Confirmer"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelPartyChange}
                  disabled={loading}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Confirm dialog for removing current party */}
        <ConfirmDialog
          open={confirmRemoveOpen}
          onOpenChange={setConfirmRemoveOpen}
          title="Retirer le parti"
          description="Voulez-vous vraiment retirer l'affiliation actuelle ?"
          variant="destructive"
          onConfirm={() => {
            setConfirmRemoveOpen(false);
            handleRemoveParty();
          }}
        />

        {/* Section B: Historique des affiliations */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Historique des affiliations
            </h2>
            {!isAddingAffiliation && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAddingAffiliation(true);
                  setWarnings([]);
                  clearStatus();
                }}
              >
                Ajouter une affiliation
              </Button>
            )}
          </div>

          {isAddingAffiliation && (
            <AddAffiliationForm
              addForm={addForm}
              setAddForm={setAddForm}
              allParties={allParties}
              currentParty={currentParty}
              loading={loading}
              canSubmitAdd={canSubmitAdd}
              onSubmit={handleAddAffiliation}
              onCancel={cancelAddAffiliation}
            />
          )}

          {partyHistory.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucun historique d&apos;affiliation.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Parti</th>
                    <th className="pb-2 pr-3 font-medium">Rôle</th>
                    <th className="pb-2 pr-3 font-medium">Début</th>
                    <th className="pb-2 pr-3 font-medium">Fin</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {partyHistory.map((membership) => (
                    <MembershipRow
                      key={membership.id}
                      membership={membership}
                      isEditing={editingMembershipId === membership.id}
                      form={membershipForm}
                      onFormChange={(updates) =>
                        setMembershipForm((prev) => ({ ...prev, ...updates }))
                      }
                      loading={loading}
                      onEdit={() => startEditMembership(membership)}
                      onSave={() => handleSaveMembership(membership.id)}
                      onCancel={cancelEditMembership}
                      onDelete={() => setConfirmDeleteMembershipId(membership.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Confirm dialog for deleting a membership */}
        <ConfirmDialog
          open={confirmDeleteMembershipId !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteMembershipId(null);
          }}
          title="Supprimer l'affiliation"
          description="Voulez-vous vraiment supprimer cette affiliation de l'historique ?"
          variant="destructive"
          onConfirm={() => {
            if (confirmDeleteMembershipId) {
              handleDeleteMembership(confirmDeleteMembershipId);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: membership table row (edit + display modes)
// ---------------------------------------------------------------------------

function MembershipRow({
  membership,
  isEditing,
  form,
  onFormChange,
  loading,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  membership: PartyMembership;
  isEditing: boolean;
  form: { startDate: string; endDate: string; role: string };
  onFormChange: (updates: Partial<{ startDate: string; endDate: string; role: string }>) => void;
  loading: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const roleLabel =
    PARTY_ROLE_LABELS[membership.role as keyof typeof PARTY_ROLE_LABELS] || membership.role;

  if (isEditing) {
    return (
      <tr className="border-b">
        <td className="py-2 pr-3">{renderPartyBadge(membership.party)}</td>
        <td className="py-2 pr-3">
          <Select
            value={form.role}
            onChange={(e) => onFormChange({ role: e.target.value })}
            aria-label={`Rôle dans ${membership.party.shortName || membership.party.name}`}
            className="h-8 text-xs"
          >
            {Object.entries(PARTY_ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </td>
        <td className="py-2 pr-3">
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => onFormChange({ startDate: e.target.value })}
            aria-label="Date de début"
            className="h-8 text-xs"
          />
        </td>
        <td className="py-2 pr-3">
          <Input
            type="date"
            value={form.endDate}
            onChange={(e) => onFormChange({ endDate: e.target.value })}
            aria-label="Date de fin"
            className="h-8 text-xs"
          />
        </td>
        <td className="py-2">
          <div className="flex gap-1">
            <Button size="sm" onClick={onSave} disabled={loading} className="h-7 text-xs">
              {loading ? "..." : "Sauvegarder"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={loading}
              className="h-7 text-xs"
            >
              Annuler
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b">
      <td className="py-2 pr-3">{renderPartyBadge(membership.party)}</td>
      <td className="py-2 pr-3">
        <Badge variant="outline">{roleLabel}</Badge>
      </td>
      <td className="py-2 pr-3">{formatStartDate(membership.startDate)}</td>
      <td className="py-2 pr-3">{formatEndDate(membership.endDate)}</td>
      <td className="py-2">
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 text-xs">
            Éditer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-7 text-xs text-destructive hover:text-destructive"
          >
            Supprimer
          </Button>
        </div>
      </td>
    </tr>
  );
}
