import { DEBATE_PARSER_VERSION } from "@/services/sync/debate-transcript-parse";
import { describe, it, expect, beforeEach, vi } from "vitest";

const scrutinFindUnique = vi.fn();
const transcriptFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findUnique: (...a: unknown[]) => scrutinFindUnique(...a) },
    debateTranscript: { findMany: (...a: unknown[]) => transcriptFindMany(...a) },
  },
}));

import {
  extractAuthorSurname,
  resolveDebateContextForScrutin,
} from "@/services/scrutin-substance/debate-context-resolver";

describe("extractAuthorSurname", () => {
  it("cleans AN HTML entities and the civility prefix, keeps the first surname", () => {
    expect(extractAuthorSurname("Mme&#160;Lechon,  M.&#160;Allisio, M.&#160;Amblard")).toBe(
      "Lechon"
    );
    expect(extractAuthorSurname("M. de Fleurian")).toBe("de Fleurian");
    expect(extractAuthorSurname("Mme Pannier-Runacher")).toBe("Pannier-Runacher");
  });

  it("returns null for empty / too-short names", () => {
    expect(extractAuthorSurname(null)).toBeNull();
    expect(extractAuthorSurname("")).toBeNull();
    expect(extractAuthorSurname("M. Li")).toBeNull();
  });
});

describe("resolveDebateContextForScrutin — same-day candidate scope (diagnostic only)", () => {
  beforeEach(() => {
    scrutinFindUnique.mockReset();
    transcriptFindMany.mockReset();
  });

  it("finds a HIGH across several same-day candidates but flags scope=same-day (NOT a definitive linkage)", async () => {
    scrutinFindUnique.mockResolvedValue({
      chamber: "AN",
      legislature: 17,
      officialSeanceRef: null,
      votingDate: new Date("2026-05-30"),
      amendmentLinks: [
        { amendment: { number: "2084", authorName: "Mme Lechon", article: "APRÈS L'ARTICLE 22" } },
      ],
    });
    // Two debates the SAME DAY: a different one, and the one that mentions 2084.
    transcriptFindMany.mockResolvedValue([
      { seanceRef: "SEANCE-A", content: "Sur un autre texte, l'amendement no 12 est rejeté." },
      {
        seanceRef: "SEANCE-B",
        content:
          "La parole est à Mme Léchon pour soutenir l'amendement no 2084 sur la transparence des coopératives.",
      },
    ]);

    const r = await resolveDebateContextForScrutin("s1");

    expect(r.confidence).toBe("HIGH");
    expect(r.matchedAmendmentNumber).toBe("2084");
    expect(r.transcriptSeanceRef).toBe("SEANCE-B");
    // The whole point of this PR: the candidate scope stays same-day, and there
    // were several candidates that day → this is NOT a dossier/session
    // disambiguated linkage, only a diagnostic candidate.
    expect(r.candidateScope).toBe("same-day");
    expect(r.candidateTranscriptCount).toBe(2);
    expect(r.usableForGeneration).toBe(false); // Date-only matches can never generate.
  });

  it("counts how many same-day transcripts mention the amendment (uniquely localizable when exactly 1)", async () => {
    scrutinFindUnique.mockResolvedValue({
      chamber: "AN",
      legislature: 17,
      officialSeanceRef: null,
      votingDate: new Date("2026-05-30"),
      amendmentLinks: [{ amendment: { number: "2084", authorName: "Mme Lechon", article: "22" } }],
    });
    // Three same-day séances, only the afternoon one cites 2084.
    transcriptFindMany.mockResolvedValue([
      { seanceRef: "SEANCE-MATIN", content: "Discussion générale, aucun numéro ici." },
      {
        seanceRef: "SEANCE-APREM",
        content: "La parole est à Mme Léchon pour l'amendement no 2084.",
      },
      { seanceRef: "SEANCE-SOIR", content: "Débat sur l'amendement no 999, sans rapport." },
    ]);

    const r = await resolveDebateContextForScrutin("s1");

    expect(r.confidence).toBe("HIGH");
    expect(r.candidateTranscriptCount).toBe(3);
    expect(r.transcriptsMentioningAmendment).toBe(1);
    expect(r.transcriptSeanceRef).toBe("SEANCE-APREM");
  });

  it("keeps scope=same-day and reports NONE when no same-day candidate mentions the amendment", async () => {
    scrutinFindUnique.mockResolvedValue({
      chamber: "AN",
      legislature: 17,
      officialSeanceRef: null,
      votingDate: new Date("2026-05-30"),
      amendmentLinks: [{ amendment: { number: "2084", authorName: "Mme Lechon", article: "22" } }],
    });
    transcriptFindMany.mockResolvedValue([
      {
        seanceRef: "SEANCE-A",
        content: "Discussion générale, aucun numéro d'amendement cité ici.",
      },
      { seanceRef: "SEANCE-B", content: "Débat sur l'amendement no 999, sans rapport." },
    ]);

    const r = await resolveDebateContextForScrutin("s1");

    expect(r.confidence).toBe("NONE");
    expect(r.usableForGeneration).toBe(false);
    expect(r.candidateScope).toBe("same-day");
    expect(r.candidateTranscriptCount).toBe(2);
    expect(r.hasCandidateTranscript).toBe(true);
  });
});

describe("official séance and examined text", () => {
  const paragraph = (id: string, text: string, role: string | null = null) => ({
    id,
    text,
    role,
    speaker: "Mme Test",
    actorRef: "PA1",
    article: "22",
    amendments: ["2084"],
    subAmendments: [],
    textNumber: "123",
  });
  const transcript = {
    seanceRef: "RUANR5L17S2026IDS1",
    content: "",
    parserVersion: DEBATE_PARSER_VERSION,
    sourceHash: "hash",
    sourceUrl: "https://www.assemblee-nationale.fr/source",
    paragraphs: [
      paragraph("p1", "La parole est à Mme Test pour soutenir l'amendement no 2084.", "president"),
      paragraph(
        "p2",
        "La publication des revenus des coopératives permettrait davantage de transparence."
      ),
      paragraph("p3", "(L'amendement no 2084 est adopté.)"),
    ],
  };
  const vote = {
    chamber: "AN",
    legislature: 17,
    votingDate: new Date("2026-05-31"),
    officialSeanceRef: transcript.seanceRef,
    amendmentLinks: [
      {
        role: "PRINCIPAL",
        amendment: {
          number: "2084",
          authorName: "Mme Test",
          article: "22",
          chamber: "AN",
          legislature: 17,
          texteRef: "PRJLANR5L17B0123",
        },
      },
    ],
  };
  beforeEach(() => {
    scrutinFindUnique.mockReset();
    transcriptFindMany.mockReset();
    scrutinFindUnique.mockResolvedValue(vote);
    transcriptFindMany.mockResolvedValue([transcript]);
  });
  it("uses the official meeting even for a vote after midnight, never a same-day join", async () => {
    const r = await resolveDebateContextForScrutin("s1");
    expect(r.usableForGeneration).toBe(true);
    expect(r.candidateScope).toBe("official-seance");
    expect(transcriptFindMany.mock.calls[0]![0].where).toEqual({ seanceRef: transcript.seanceRef });
    expect(transcriptFindMany.mock.calls[0]![0].select.content).toBe(false);
  });
  it("does not mistake an AN debate for a Senate amendment with the same number", async () => {
    scrutinFindUnique.mockResolvedValue({ ...vote, chamber: "SENAT" });
    expect((await resolveDebateContextForScrutin("s1")).usableForGeneration).toBe(false);
    expect(transcriptFindMany).not.toHaveBeenCalled();
  });
  it.each([null, "PRJLANR5L17B0999"])(
    "refuses missing or conflicting examined text %s",
    async (texteRef) => {
      scrutinFindUnique.mockResolvedValue({
        ...vote,
        amendmentLinks: [
          {
            ...vote.amendmentLinks[0],
            amendment: { ...vote.amendmentLinks[0]!.amendment, texteRef },
          },
        ],
      });
      expect((await resolveDebateContextForScrutin("s1")).usableForGeneration).toBe(false);
    }
  );
  it("refuses duplicate meeting records and legacy parsing", async () => {
    transcriptFindMany.mockResolvedValueOnce([transcript, transcript]);
    expect((await resolveDebateContextForScrutin("s1")).usableForGeneration).toBe(false);
    transcriptFindMany.mockResolvedValueOnce([{ ...transcript, parserVersion: null }]);
    expect((await resolveDebateContextForScrutin("s1")).usableForGeneration).toBe(false);
  });
  it("reuses the structured meeting for several votes in the same run", async () => {
    const cache = new Map();
    await resolveDebateContextForScrutin("s1", cache);
    await resolveDebateContextForScrutin("s2", cache);
    expect(transcriptFindMany).toHaveBeenCalledTimes(1);
  });
});
