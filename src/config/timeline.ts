import type { MandateType, AffairStatus } from "@/types";

// Couleurs pour les barres de mandats (hex pour SVG inline styles)
export const MANDATE_TYPE_COLORS: Record<MandateType, string> = {
  PRESIDENT_REPUBLIQUE: "#4338ca", // Indigo-700
  PREMIER_MINISTRE: "#6366f1", // Indigo-500
  MINISTRE: "#818cf8", // Indigo-400
  MINISTRE_DELEGUE: "#a5b4fc", // Indigo-300
  SECRETAIRE_ETAT: "#c7d2fe", // Indigo-200
  DEPUTE: "#2563eb", // Blue-600
  SENATEUR: "#0891b2", // Cyan-600
  DEPUTE_EUROPEEN: "#0d9488", // Teal-600
  PRESIDENT_REGION: "#059669", // Emerald-600
  VICE_PRESIDENT_REGION: "#34d399", // Emerald-400
  PRESIDENT_DEPARTEMENT: "#10b981", // Emerald-500
  VICE_PRESIDENT_DEPARTEMENT: "#6ee7b7", // Emerald-300
  MAIRE: "#22c55e", // Green-500
  ADJOINT_MAIRE: "#4ade80", // Green-400
  CONSEILLER_REGIONAL: "#84cc16", // Lime-500
  CONSEILLER_DEPARTEMENTAL: "#a3e635", // Lime-400
  CONSEILLER_MUNICIPAL: "#bef264", // Lime-300
  PRESIDENT_PARTI: "#ec4899", // Pink-500
  OTHER: "#9ca3af", // Gray-400
};

// Catégories de mandats pour regrouper sur la timeline
export const MANDATE_CATEGORY_ORDER: MandateType[][] = [
  // Exécutif national (ligne 0)
  ["PRESIDENT_REPUBLIQUE", "PREMIER_MINISTRE", "MINISTRE", "MINISTRE_DELEGUE", "SECRETAIRE_ETAT"],
  // Parlementaire (ligne 1)
  ["DEPUTE", "SENATEUR", "DEPUTE_EUROPEEN"],
  // Local (ligne 2)
  [
    "PRESIDENT_REGION",
    "VICE_PRESIDENT_REGION",
    "PRESIDENT_DEPARTEMENT",
    "VICE_PRESIDENT_DEPARTEMENT",
    "MAIRE",
    "ADJOINT_MAIRE",
    "CONSEILLER_REGIONAL",
    "CONSEILLER_DEPARTEMENTAL",
    "CONSEILLER_MUNICIPAL",
  ],
  // Parti (ligne 3)
  ["PRESIDENT_PARTI"],
];

export function getMandateRow(type: MandateType): number {
  for (let i = 0; i < MANDATE_CATEGORY_ORDER.length; i++) {
    if (MANDATE_CATEGORY_ORDER[i]!.includes(type)) {
      return i;
    }
  }
  return MANDATE_CATEGORY_ORDER.length; // Other
}

export const MANDATE_ROW_LABELS = ["Exécutif", "Parlement", "Local", "Parti", "Autre"];

// Couleurs pour les marqueurs d'affaires selon le statut
export const AFFAIR_STATUS_MARKER_COLORS: Record<AffairStatus, string> = {
  // En cours (orange)
  ENQUETE_PRELIMINAIRE: "#f97316",
  INSTRUCTION: "#f97316",
  MISE_EN_EXAMEN: "#ea580c",
  RENVOI_TRIBUNAL: "#ea580c",
  PROCES_EN_COURS: "#c2410c",
  APPEL_EN_COURS: "#f97316",
  // Condamnations (rouge)
  CONDAMNATION_PREMIERE_INSTANCE: "#dc2626",
  POURVOI_EN_CASSATION: "#dc2626",
  CONDAMNATION_DEFINITIVE: "#991b1b",
  // Relaxes/acquittements (vert)
  RELAXE: "#16a34a",
  ACQUITTEMENT: "#16a34a",
  // Terminées (gris)
  NON_LIEU: "#6b7280",
  PRESCRIPTION: "#6b7280",
  CLASSEMENT_SANS_SUITE: "#6b7280",
};

// Configuration de la timeline
export const TIMELINE_CONFIG = {
  // Dimensions
  height: {
    header: 30, // Espace pour les années
    rowHeight: 32, // Hauteur de chaque ligne de mandats
    barHeight: 24, // Hauteur des barres de mandats
    affairsRow: 40, // Hauteur de la zone des affaires
    padding: 16, // Padding vertical
  },
  // Marges
  margin: {
    left: 70, // Espace pour les labels de lignes
    right: 20,
  },
  // Styles
  style: {
    barRadius: 4, // Rayon des coins des barres
    markerSize: 12, // Taille des marqueurs d'affaires
    axisColor: "#e5e7eb",
    textColor: "#6b7280",
    hoverOpacity: 0.8,
  },
};
