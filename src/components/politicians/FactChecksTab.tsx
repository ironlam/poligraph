// src/components/politicians/FactChecksTab.tsx
import Link from "next/link";
import { Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { FACTCHECK_RATING_LABELS, FACTCHECK_RATING_COLORS } from "@/config/labels";
import type { FactCheckRating } from "@/types";

interface FactCheckMention {
  id: string;
  isClaimant: boolean;
  factCheck: {
    id: string;
    slug: string | null;
    title: string;
    claimText: string;
    claimant: string | null;
    verdictRating: FactCheckRating;
    source: string;
    sourceUrl: string;
    publishedAt: Date;
  };
}

interface FactChecksTabProps {
  mentions: FactCheckMention[];
  politicianSlug: string;
}

function computeVerdictCounts(claims: FactCheckMention[]) {
  return claims.reduce(
    (acc, m) => {
      const r = m.factCheck.verdictRating;
      if (r === "TRUE" || r === "MOSTLY_TRUE") acc.vrai++;
      else if (r === "FALSE" || r === "MOSTLY_FALSE") acc.faux++;
      else if (r === "UNVERIFIABLE") acc.autre++;
      else acc.mitige++;
      return acc;
    },
    { vrai: 0, faux: 0, mitige: 0, autre: 0 }
  );
}

function VerdictBar({
  counts,
  total,
}: {
  counts: ReturnType<typeof computeVerdictCounts>;
  total: number;
}) {
  if (total === 0) return null;

  const segments = [
    {
      key: "faux",
      count: counts.faux,
      color: "bg-red-400",
      textColor: "text-red-600",
      label: "Faux",
    },
    {
      key: "mitige",
      count: counts.mitige,
      color: "bg-yellow-400",
      textColor: "text-yellow-600",
      label: "Mitige",
    },
    {
      key: "vrai",
      count: counts.vrai,
      color: "bg-green-400",
      textColor: "text-green-600",
      label: "Vrai",
    },
    {
      key: "autre",
      count: counts.autre,
      color: "bg-gray-300",
      textColor: "text-gray-500",
      label: "Autre",
    },
  ];

  return (
    <div className="mb-4">
      <div className="flex h-3 rounded-full overflow-hidden">
        {segments.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.key}
                className={s.color}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${s.label} : ${s.count}`}
              />
            )
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        {segments.map(
          (s) =>
            s.count > 0 && (
              <span key={s.key} className={s.textColor}>
                {s.label} : {s.count}
              </span>
            )
        )}
      </div>
    </div>
  );
}

function MentionRow({ mention }: { mention: FactCheckMention }) {
  return (
    <div className="border-b last:border-0 pb-3 last:pb-0 space-y-1">
      <div className="flex items-center gap-2">
        <Badge className={`shrink-0 ${FACTCHECK_RATING_COLORS[mention.factCheck.verdictRating]}`}>
          {FACTCHECK_RATING_LABELS[mention.factCheck.verdictRating]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {mention.factCheck.source} · {formatDate(mention.factCheck.publishedAt)}
        </span>
      </div>
      {mention.factCheck.slug ? (
        <Link
          href={`/factchecks/${mention.factCheck.slug}`}
          className="text-sm font-medium hover:underline block"
        >
          {mention.factCheck.title}
        </Link>
      ) : (
        <a
          href={mention.factCheck.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:underline block"
        >
          {mention.factCheck.title}
        </a>
      )}
      {mention.factCheck.claimText && (
        <p className="text-sm text-muted-foreground">
          {mention.factCheck.claimant && (
            <span className="font-medium">{mention.factCheck.claimant} : </span>
          )}
          &laquo;&nbsp;{mention.factCheck.claimText}&nbsp;&raquo;
        </p>
      )}
    </div>
  );
}

export function FactChecksTab({ mentions, politicianSlug }: FactChecksTabProps) {
  const directClaims = mentions.filter((m) => m.isClaimant);
  const otherMentions = mentions.filter((m) => !m.isClaimant);
  const verdictCounts = computeVerdictCounts(directClaims);
  const verdictTotal =
    verdictCounts.vrai + verdictCounts.mitige + verdictCounts.faux + verdictCounts.autre;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Fact-checks</h2>
          <p className="text-xs text-muted-foreground">
            Verdicts {"é"}mis par les organismes de fact-checking cit{"é"}s.
          </p>
        </div>
        <Link
          href={`/factchecks/politique/${politicianSlug}`}
          className="text-sm text-primary hover:underline"
        >
          Voir tout →
        </Link>
      </div>

      {/* Direct claims: prominent section */}
      {directClaims.length > 0 && (
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Quote className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">
                Ses d{"é"}clarations v{"é"}rifi{"é"}es ({directClaims.length})
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Propos directement attribu{"é"}s {"à"} ce politicien
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <VerdictBar counts={verdictCounts} total={verdictTotal} />
            <div className="space-y-3">
              {directClaims.map((mention) => (
                <MentionRow key={mention.id} mention={mention} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other mentions: collapsed by default */}
      {otherMentions.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
            <span className="transition-transform group-open:rotate-90">▸</span>
            Mentionn{"é"} dans {otherMentions.length} autre{otherMentions.length > 1 ? "s" : ""}{" "}
            fact-check{otherMentions.length > 1 ? "s" : ""}
          </summary>
          <Card className="mt-2">
            <CardContent className="pt-4">
              <div className="space-y-3">
                {otherMentions.map((mention) => (
                  <MentionRow key={mention.id} mention={mention} />
                ))}
              </div>
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  );
}
