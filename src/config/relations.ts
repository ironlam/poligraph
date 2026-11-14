import { RelationType } from "@/types/relations";

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  SAME_GOVERNMENT: "Même gouvernement",
  SHARED_COMPANY: "Entreprises en commun",
  SAME_DEPARTMENT: "Même département",
  PARTY_HISTORY: "Anciens collègues de parti",
};

export const RELATION_TYPE_COLORS: Record<RelationType, string> = {
  SAME_GOVERNMENT: "#8B5CF6",
  SHARED_COMPANY: "#F59E0B",
  SAME_DEPARTMENT: "#10B981",
  PARTY_HISTORY: "#6B7280",
};

export const RELATION_TYPE_DESCRIPTIONS: Record<RelationType, string> = {
  SAME_GOVERNMENT: "Ont siégé ensemble au gouvernement",
  SHARED_COMPANY: "Détiennent des participations dans les mêmes entreprises ou SCI",
  SAME_DEPARTMENT: "Élus dans le même département",
  PARTY_HISTORY: "Ont été membres du même parti dans le passé",
};

export const ALL_RELATION_TYPES: RelationType[] = [
  "SAME_GOVERNMENT",
  "SHARED_COMPANY",
  "SAME_DEPARTMENT",
  "PARTY_HISTORY",
];
