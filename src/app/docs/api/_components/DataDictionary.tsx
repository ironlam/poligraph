import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_CATEGORY_LABELS,
  AFFAIR_SEVERITY_LABELS,
  INVOLVEMENT_LABELS,
  POLITICAL_POSITION_LABELS,
  MANDATE_TYPE_LABELS,
  FACTCHECK_RATING_LABELS,
} from "@/config/labels";

interface DictionaryTableProps {
  title: string;
  description?: string;
  labels: Record<string, string>;
}

function DictionaryTable({ title, description, labels }: DictionaryTableProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left font-mono font-semibold px-4 py-2 w-1/3">Code</th>
              <th className="text-left font-semibold px-4 py-2">Libellé</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(labels).map(([code, label]) => (
              <tr key={code} className="border-b last:border-0">
                <td className="font-mono text-xs px-4 py-2">{code}</td>
                <td className="px-4 py-2">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Data dictionary auto-generated from src/config/labels.ts at build time.
 * Keeping this in sync with the actual DB enums is free because TypeScript
 * enforces the Record<EnumValue, string> constraint at the source.
 */
export function DataDictionary() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <DictionaryTable
        title="Statuts judiciaires (statusCode)"
        description="État de l'affaire dans le processus judiciaire."
        labels={AFFAIR_STATUS_LABELS}
      />
      <DictionaryTable
        title="Catégories d'affaires (categoryCode)"
        description="Type d'infraction principal."
        labels={AFFAIR_CATEGORY_LABELS}
      />
      <DictionaryTable
        title="Gravité Sapin II (severityCode)"
        description="Hiérarchie inspirée de la loi Sapin II. Voir /sources pour la méthodologie."
        labels={AFFAIR_SEVERITY_LABELS}
      />
      <DictionaryTable
        title="Implication (involvementCode)"
        description="Rôle du politique dans l'affaire. Par défaut l'API filtre sur DIRECT."
        labels={INVOLVEMENT_LABELS}
      />
      <DictionaryTable
        title="Verdict fact-check (verdictRatingCode)"
        description="Note normalisée Google Fact Check Tools."
        labels={FACTCHECK_RATING_LABELS}
      />
      <DictionaryTable
        title="Position politique (parti)"
        description="Classification du parti sur l'axe gauche-droite."
        labels={POLITICAL_POSITION_LABELS}
      />
      <DictionaryTable
        title="Types de mandat (mandateType)"
        description="Tous les types d'élus indexés."
        labels={MANDATE_TYPE_LABELS}
      />
    </div>
  );
}
