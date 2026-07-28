// Pure helper: majority reading of a scrutin's expressed votes (pour vs contre).
// Abstention is intentionally excluded: it does not count toward the majority.
const CLOSE_THRESHOLD = 10;

export interface VoteMargin {
  label: string;
  isClose: boolean;
  hasExpressed: boolean;
  forPercent: number;
  againstPercent: number;
}

export function formatVoteMargin(votesFor: number, votesAgainst: number): VoteMargin {
  const expressed = votesFor + votesAgainst;
  if (expressed <= 0) {
    return {
      label: "Aucun suffrage exprimé",
      isClose: false,
      hasExpressed: false,
      forPercent: 0,
      againstPercent: 0,
    };
  }
  const margin = votesFor - votesAgainst;
  const isClose = Math.abs(margin) <= CLOSE_THRESHOLD;
  let base: string;
  if (margin > 0) base = `majorité +${margin}`;
  else if (margin < 0) base = `manque ${Math.abs(margin)} voix`;
  else base = "égalité";
  return {
    label: isClose ? `${base} · vote serré` : base,
    isClose,
    hasExpressed: true,
    forPercent: (votesFor / expressed) * 100,
    againstPercent: (votesAgainst / expressed) * 100,
  };
}
