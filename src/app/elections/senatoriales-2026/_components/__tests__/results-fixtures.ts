import type {
  ElectedSenator,
  SenatorialesResultsSummary,
} from "@/lib/senatoriales/results-summary";

export const elected = (over: Partial<ElectedSenator> = {}): ElectedSenator => ({
  constituencyCode: "01",
  constituencyName: "Ain",
  name: "Véronique BAUDE",
  nuanceLabel: "Liste des Républicains",
  round: 1,
  politicianId: "p1",
  politicianSlug: "veronique-baude",
  status: "reelected",
  gender: "F",
  ...over,
});

export const summary = (
  over: Partial<SenatorialesResultsSummary> = {}
): SenatorialesResultsSummary => ({
  elected: [elected()],
  proclaimedConstituencies: 59,
  totalConstituencies: 64,
  seatsFilled: 161,
  reelected: 105,
  newcomers: 0,
  unresolved: 56,
  womenShare: 0.4,
  lastImportedAt: new Date("2026-09-27T19:00:00Z"),
  ...over,
});
