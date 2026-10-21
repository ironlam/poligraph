export const FEEDBACK_CATEGORIES = ["FACTUAL_ERROR", "BUG", "IDEA", "OTHER"] as const;
export type FeedbackCategoryKey = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategoryKey, string> = {
  FACTUAL_ERROR: "Erreur dans une information",
  BUG: "Problème d'affichage ou de fonctionnement",
  IDEA: "Idée d'amélioration",
  OTHER: "Autre",
};

export const FEEDBACK_STATUS_LABELS = {
  NEW: "À traiter",
  DONE: "Traité",
  REJECTED: "Classé sans suite",
} as const;

export const FEEDBACK_MESSAGE_MIN = 10;
export const FEEDBACK_MESSAGE_MAX = 2000;
