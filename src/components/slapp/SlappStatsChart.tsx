"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

interface SlappStatsChartProps {
  byStatus: Record<string, number>;
}

const STATUS_LABELS: Record<string, string> = {
  ENQUETE_PRELIMINAIRE: "Enquête préliminaire",
  INSTRUCTION: "Instruction",
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: "Instruction clôturée, sans mise en examen",
  MISE_EN_EXAMEN: "Mise en examen",
  RENVOI_TRIBUNAL: "Renvoi au tribunal",
  PROCES_EN_COURS: "Procès en cours",
  CONDAMNATION_PREMIERE_INSTANCE: "Condamnation 1re instance",
  APPEL_EN_COURS: "Appel en cours",
  POURVOI_EN_CASSATION: "Condamnation, pourvoi en cassation",
  CONDAMNATION_DEFINITIVE: "Condamnation définitive",
  RELAXE: "Relaxe",
  ACQUITTEMENT: "Acquittement",
  NON_LIEU: "Non-lieu",
  PRESCRIPTION: "Prescription",
  CLASSEMENT_SANS_SUITE: "Classement sans suite",
};

export function SlappStatsChart({ byStatus }: SlappStatsChartProps) {
  const data = Object.entries(byStatus).map(([status, count]) => ({
    status: STATUS_LABELS[status] ?? status,
    count,
  }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Aucune donnée disponible pour le moment.</p>
    );
  }

  const ariaSummary = data.map((d) => `${d.status} : ${d.count} cas`).join(", ");

  return (
    <div role="img" aria-label={`Répartition des cas SLAPP par statut judiciaire. ${ariaSummary}.`}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="status"
            label={{
              value: "Statut judiciaire",
              position: "insideBottom",
              offset: -20,
            }}
          />
          <YAxis
            allowDecimals={false}
            label={{
              value: "Nombre de cas",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip />
          <Bar dataKey="count" fill="#b45309" name="Cas" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
