import type { CandidacyStatus } from "@/generated/prisma";
import { formatDate } from "@/lib/utils";

/** The fields of a tracked candidacy the directory summary reads. */
export type SummarizableCandidacy = {
  candidateName: string;
  status: CandidacyStatus;
  recordedAt?: Date | null;
  statusChangedAt?: Date | null;
  lastMeasurePublishedAt?: Date | null;
};

export type CandidacyFieldSummary = {
  /** Announced or official runs, in the field's order (alphabetical by surname). */
  announced: string[];
  /** Persons credible sources expect to run, without an announcement of their own. */
  expected: string[];
  /** Runs announced then withdrawn or ruled out. */
  withdrawnCount: number;
  /** Last change to the field: a candidacy recorded, a status changed or a measure published. */
  lastUpdatedAt: Date | null;
};

export function summarizeCandidacyField(
  candidacies: readonly SummarizableCandidacy[]
): CandidacyFieldSummary {
  const announced: string[] = [];
  const expected: string[] = [];
  let withdrawnCount = 0;
  let lastUpdatedAt: Date | null = null;

  for (const candidacy of candidacies) {
    if (candidacy.status === "DECLARE" || candidacy.status === "OFFICIAL") {
      announced.push(candidacy.candidateName);
    } else if (candidacy.status === "PRESSENTI") {
      expected.push(candidacy.candidateName);
    } else if (candidacy.status === "RETIRE") {
      withdrawnCount += 1;
    }
    for (const date of [
      candidacy.recordedAt,
      candidacy.statusChangedAt,
      candidacy.lastMeasurePublishedAt,
    ]) {
      if (date && (lastUpdatedAt === null || date > lastUpdatedAt)) lastUpdatedAt = date;
    }
  }

  return { announced, expected, withdrawnCount, lastUpdatedAt };
}

/** "32 personnalités ont annoncé leur candidature", agreed with the count. */
function announcedClause(count: number): string {
  return count > 1
    ? `${count} personnalités ont annoncé leur candidature`
    : `${count} personnalité a annoncé sa candidature`;
}

function expectedClause(count: number): string {
  return count > 1 ? `${count} autres sont pressenties` : `${count} autre est pressentie`;
}

/** Search title, under 60 characters. Null when no run is announced: the page keeps its default. */
export function candidacyFieldTitle(summary: CandidacyFieldSummary): string | null {
  const count = summary.announced.length;
  if (count === 0) return null;
  return `Candidats présidentielle 2027 : ${count} ${count > 1 ? "déclarés" : "déclaré"} (liste à jour)`;
}

export function candidacyFieldDescription(summary: CandidacyFieldSummary): string | null {
  const count = summary.announced.length;
  if (count === 0) return null;
  const date = summary.lastUpdatedAt ? `Au ${formatDate(summary.lastUpdatedAt)}, ` : "";
  const clause = announcedClause(count);
  const opening = date ? clause : clause.charAt(0).toUpperCase() + clause.slice(1);
  const expected =
    summary.expected.length > 0 ? `, ${expectedClause(summary.expected.length)}` : "";
  return `${date}${opening} à la présidentielle 2027${expected}. Pour chacune : la source du statut, le parti et, quand il est publié, le programme.`;
}

/** The sentence under the heading: the answer to "how many", before the list. */
export function candidacyFieldLead(summary: CandidacyFieldSummary): string | null {
  const count = summary.announced.length;
  if (count === 0) return null;
  const clause = announcedClause(count);
  const sentences = [
    `${clause.charAt(0).toUpperCase()}${clause.slice(1)} à la présidentielle 2027.`,
  ];
  const others: string[] = [];
  if (summary.expected.length > 0) others.push(expectedClause(summary.expected.length));
  if (summary.withdrawnCount > 0) {
    others.push(
      summary.withdrawnCount > 1
        ? `${summary.withdrawnCount} candidatures ont été retirées ou écartées`
        : "1 candidature a été retirée ou écartée"
    );
  }
  if (others.length > 0) {
    const text = others.join(" et ");
    sentences.push(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
  }
  return sentences.join(" ");
}

export type FaqEntry = { question: string; answer: string };

/** Short questions about the field, answered from the field itself. */
export function candidacyFieldFaq(summary: CandidacyFieldSummary): FaqEntry[] {
  const count = summary.announced.length;
  if (count === 0) return [];
  const date = summary.lastUpdatedAt ? `Au ${formatDate(summary.lastUpdatedAt)}, ` : "";
  const clause = announcedClause(count);
  const howMany = `${date}${date ? clause : clause.charAt(0).toUpperCase() + clause.slice(1)}${
    summary.expected.length > 0 ? ` et ${expectedClause(summary.expected.length)}` : ""
  }. Ce n'est pas encore le nombre de candidats officiels : pour figurer sur la liste, il faut réunir au moins 500 présentations d'élus (les parrainages), que le Conseil constitutionnel contrôle.`;

  const who = [
    `Ont annoncé leur candidature, par ordre alphabétique : ${summary.announced.join(", ")}.`,
    ...(summary.expected.length > 0
      ? [
          `${summary.expected.length > 1 ? "Sont pressenties" : "Est pressentie"} : ${summary.expected.join(", ")}.`,
        ]
      : []),
  ].join(" ");

  return [
    { question: "Combien de candidats à la présidentielle 2027 ?", answer: howMany },
    { question: "Qui est candidat à la présidentielle 2027 ?", answer: who },
    {
      question: "Quand la liste officielle des candidats sera-t-elle publiée ?",
      answer:
        "Le Conseil constitutionnel arrête la liste officielle après la clôture des parrainages, qui doivent lui parvenir au plus tard le sixième vendredi avant le premier tour, à 18 heures. En 2022, la liste avait été arrêtée le 7 mars, pour un premier tour le 10 avril.",
    },
  ];
}
