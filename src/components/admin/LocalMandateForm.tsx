"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { REGIONS } from "@/config/regions";
import {
  DEPARTMENT_MANDATE_TYPES,
  LOCAL_MANDATE_FORM_TYPES,
  MUNICIPAL_MANDATE_TYPES,
  REGION_MANDATE_TYPES,
} from "@/lib/security/schemas/mandate";

type FormType = (typeof LOCAL_MANDATE_FORM_TYPES)[number];

type Fields = {
  type: FormType;
  title: string;
  institution: string;
  communeId: string;
  departmentCode: string;
  regionCode: string;
  epciSiren: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  sourceUrl: string;
  officialUrl: string;
};

const EMPTY: Fields = {
  type: "MAIRE",
  title: "",
  institution: "",
  communeId: "",
  departmentCode: "",
  regionCode: "",
  epciSiren: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  sourceUrl: "",
  officialUrl: "",
};

/** How the API names a field, and how the form does. */
const FIELD_LABELS: Record<string, string> = {
  type: "Type",
  title: "Intitulé",
  institution: "Institution",
  communeId: "Code INSEE de la commune",
  departmentCode: "Code du département",
  regionCode: "Région",
  epciSiren: "SIREN",
  startDate: "Début",
  endDate: "Fin",
  isCurrent: "Mandat en cours",
  sourceUrl: "Adresse de la source",
  officialUrl: "Adresse officielle",
};

const DATE_PATTERN = "\\d{4}(-\\d{2}(-\\d{2})?)?";
const DATE_HINT = "2001, 2001-03 ou 2001-03-25";

const isOneOf = (list: readonly string[], value: string) => list.includes(value);

export function LocalMandateForm({ politicianId }: { politicianId: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  function update<K extends keyof Fields>(field: K, value: Fields[K]) {
    setFields((current) => ({
      ...current,
      [field]: value,
      // A sitting mayor is not entered here: switching to that type clears the box it disables.
      ...(field === "type" && value === "MAIRE" ? { isCurrent: false } : {}),
    }));
    setDone(false);
  }

  const municipal = isOneOf(MUNICIPAL_MANDATE_TYPES, fields.type);
  const departmental = isOneOf(DEPARTMENT_MANDATE_TYPES, fields.type);
  const regional = isOneOf(REGION_MANDATE_TYPES, fields.type);
  const intercommunal = fields.type === "PRESIDENT_INTERCOMMUNALITE";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    setDone(false);
    try {
      const res = await fetch(`/api/admin/politiques/${politicianId}/mandats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the territory of the chosen type is sent: a code typed for another type and left
        // in a hidden field must not reach the mandate.
        body: JSON.stringify({
          type: fields.type,
          title: fields.title,
          institution: fields.institution,
          ...(municipal && fields.communeId ? { communeId: fields.communeId } : {}),
          ...(departmental && fields.departmentCode
            ? { departmentCode: fields.departmentCode }
            : {}),
          ...(regional && fields.regionCode ? { regionCode: fields.regionCode } : {}),
          ...(intercommunal && fields.epciSiren ? { epciSiren: fields.epciSiren } : {}),
          startDate: fields.startDate,
          endDate: fields.isCurrent || !fields.endDate ? null : fields.endDate,
          isCurrent: fields.isCurrent,
          sourceUrl: fields.sourceUrl,
          ...(fields.officialUrl ? { officialUrl: fields.officialUrl } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues: string[] = Array.isArray(json.issues)
          ? json.issues.map(
              (i: { path: string[]; message: string }) =>
                `${FIELD_LABELS[i.path[0] ?? ""] ?? i.path.join(".")} : ${i.message}`
            )
          : [];
        setErrors(issues.length > 0 ? issues : [json.error ?? `Erreur ${res.status}`]);
        return;
      }
      setFields(EMPTY);
      setDone(true);
      router.refresh();
    } catch {
      setErrors(["L'enregistrement n'a pas abouti. Vérifiez la connexion et réessayez."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {errors.length > 0 && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-red-50 p-4 text-red-700">
          {errors.length === 1 ? (
            errors[0]
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {done && (
        <div role="status" aria-live="polite" className="rounded-md bg-green-50 p-4 text-green-700">
          Mandat ajouté.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="mandate-type">Type *</Label>
          <Select
            id="mandate-type"
            value={fields.type}
            onChange={(e) => update("type", e.target.value as FormType)}
          >
            {LOCAL_MANDATE_FORM_TYPES.map((type) => (
              <option key={type} value={type}>
                {MANDATE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>

        {municipal && (
          <div>
            <Label htmlFor="mandate-commune">Code INSEE de la commune *</Label>
            <Input
              id="mandate-commune"
              value={fields.communeId}
              onChange={(e) => update("communeId", e.target.value.trim().toUpperCase())}
              placeholder="29019"
              maxLength={5}
              required
            />
          </div>
        )}
        {departmental && (
          <div>
            <Label htmlFor="mandate-department">Code du département *</Label>
            <Input
              id="mandate-department"
              value={fields.departmentCode}
              onChange={(e) => update("departmentCode", e.target.value.trim().toUpperCase())}
              placeholder="29"
              maxLength={3}
              required
            />
          </div>
        )}
        {regional && (
          <div>
            <Label htmlFor="mandate-region">Région *</Label>
            <Select
              id="mandate-region"
              value={fields.regionCode}
              onChange={(e) => update("regionCode", e.target.value)}
              required
            >
              <option value="">Choisir une région</option>
              {REGIONS.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {intercommunal && (
          <div>
            <Label htmlFor="mandate-siren">SIREN de l&apos;intercommunalité</Label>
            <Input
              id="mandate-siren"
              value={fields.epciSiren}
              onChange={(e) => update("epciSiren", e.target.value.trim())}
              inputMode="numeric"
              pattern="\d{9}"
              maxLength={9}
              aria-describedby="mandate-siren-hint"
            />
            <p id="mandate-siren-hint" className="mt-1 text-xs text-muted-foreground">
              9 chiffres. Laissez vide s&apos;il n&apos;est pas établi.
            </p>
          </div>
        )}
      </div>

      {fields.type === "MAIRE" && (
        <p className="text-sm text-muted-foreground">
          Seul un mandat de maire terminé se saisit ici. Un maire en fonction vient du répertoire
          national des élus.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="mandate-title">Intitulé *</Label>
          <Input
            id="mandate-title"
            value={fields.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Maire de Brest"
            maxLength={500}
            required
          />
        </div>
        <div>
          <Label htmlFor="mandate-institution">Institution *</Label>
          <Input
            id="mandate-institution"
            value={fields.institution}
            onChange={(e) => update("institution", e.target.value)}
            placeholder="Mairie de Brest"
            maxLength={200}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="mandate-start">Début *</Label>
          <Input
            id="mandate-start"
            value={fields.startDate}
            onChange={(e) => update("startDate", e.target.value.trim())}
            placeholder={DATE_HINT}
            pattern={DATE_PATTERN}
            aria-describedby="mandate-dates-hint"
            required
          />
        </div>
        <div>
          <Label htmlFor="mandate-end">Fin</Label>
          <Input
            id="mandate-end"
            value={fields.isCurrent ? "" : fields.endDate}
            onChange={(e) => update("endDate", e.target.value.trim())}
            placeholder={DATE_HINT}
            pattern={DATE_PATTERN}
            aria-describedby="mandate-dates-hint"
            disabled={fields.isCurrent}
          />
        </div>
      </div>
      <p id="mandate-dates-hint" className="text-xs text-muted-foreground">
        Écrivez la date aussi précisément que la source la donne, pas plus : l&apos;année seule,
        l&apos;année et le mois, ou la date complète. Laissez la fin vide si elle n&apos;est pas
        connue.
      </p>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={fields.isCurrent}
          onChange={(e) => update("isCurrent", e.target.checked)}
          disabled={fields.type === "MAIRE"}
        />
        Mandat en cours
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="mandate-source">Adresse de la source *</Label>
          <Input
            id="mandate-source"
            type="url"
            value={fields.sourceUrl}
            onChange={(e) => update("sourceUrl", e.target.value.trim())}
            placeholder="https://"
            required
          />
        </div>
        <div>
          <Label htmlFor="mandate-official">Adresse officielle</Label>
          <Input
            id="mandate-official"
            type="url"
            value={fields.officialUrl}
            onChange={(e) => update("officialUrl", e.target.value.trim())}
            placeholder="https://"
          />
        </div>
      </div>

      <Button type="submit" disabled={busy} className="min-h-11">
        Ajouter le mandat
      </Button>
    </form>
  );
}
