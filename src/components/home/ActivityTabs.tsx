"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Vote, FileText, Newspaper, ChevronRight, ShieldCheck, Scale } from "lucide-react";
import {
  FACTCHECK_RATING_LABELS,
  FACTCHECK_RATING_COLORS,
  AFFAIR_STATUS_LABELS,
} from "@/config/labels";
import type { FactCheckRating, AffairStatus } from "@/types";

interface FactCheckItem {
  id: string;
  slug: string | null;
  title: string;
  source: string;
  sourceUrl: string;
  verdictRating: string;
  publishedAt: Date;
  politician: { fullName: string; slug: string } | null;
}

interface VoteItem {
  id: string;
  slug: string | null;
  title: string;
  date: Date;
  result: string;
  chamber: string;
}

interface DossierItem {
  id: string;
  slug: string | null;
  title: string;
  shortTitle: string | null;
  status: string;
  filingDate: Date | null;
}

interface ArticleItem {
  id: string;
  title: string;
  source: string;
  publishedAt: Date;
  url: string;
}

interface AffairItem {
  id: string;
  slug: string | null;
  title: string;
  status: string;
  date: Date | null;
  politician: { fullName: string; slug: string };
}

interface ActivityTabsProps {
  factChecks: FactCheckItem[];
  votes: VoteItem[];
  dossiers: DossierItem[];
  articles: ArticleItem[];
  affairs: AffairItem[];
}

type TabType = "factchecks" | "votes" | "dossiers" | "presse" | "affaires";

export function ActivityTabs({
  factChecks,
  votes,
  dossiers,
  articles,
  affairs,
}: ActivityTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("factchecks");

  const tabs: { id: TabType; label: string; icon: typeof Vote; count: number }[] = [
    { id: "factchecks", label: "Fact-checks", icon: ShieldCheck, count: factChecks.length },
    { id: "affaires", label: "Affaires", icon: Scale, count: affairs.length },
    { id: "votes", label: "Votes", icon: Vote, count: votes.length },
    { id: "dossiers", label: "Dossiers", icon: FileText, count: dossiers.length },
    { id: "presse", label: "Presse", icon: Newspaper, count: articles.length },
  ];

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
              Dernières activités
            </h2>
            <p className="text-muted-foreground">Actualités parlementaires et médiatiques</p>
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          className="flex gap-0.5 sm:gap-1 p-1 bg-muted/50 rounded-lg w-fit mb-6 overflow-x-auto max-w-full"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                aria-selected={activeTab === tab.id}
                role="tab"
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className="text-xs text-muted-foreground">({tab.count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          aria-label={tabs.find((t) => t.id === activeTab)?.label}
          className="bg-card border rounded-xl overflow-hidden"
        >
          {activeTab === "factchecks" && <FactChecksContent factChecks={factChecks} />}
          {activeTab === "affaires" && <AffairesContent affairs={affairs} />}
          {activeTab === "votes" && <VotesContent votes={votes} />}
          {activeTab === "dossiers" && <DossiersContent dossiers={dossiers} />}
          {activeTab === "presse" && <PresseContent articles={articles} />}
        </div>
      </div>
    </section>
  );
}

function FactChecksContent({ factChecks }: { factChecks: FactCheckItem[] }) {
  if (factChecks.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Aucun fact-check récent</div>;
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {factChecks.map((fc) => (
          <li key={fc.id}>
            <Link
              href={`/factchecks/${fc.slug || fc.id}`}
              prefetch={false}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-medium group-hover:text-primary transition-colors">{fc.title}</p>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span>{formatDate(fc.publishedAt)}</span>
                  <span>•</span>
                  <span>{fc.source}</span>
                  {fc.politician && (
                    <>
                      <span>•</span>
                      <span>{fc.politician.fullName}</span>
                    </>
                  )}
                </div>
              </div>
              <Badge
                className={`shrink-0 ${FACTCHECK_RATING_COLORS[fc.verdictRating as FactCheckRating] || "bg-gray-100 text-gray-800"}`}
              >
                {FACTCHECK_RATING_LABELS[fc.verdictRating as FactCheckRating] || fc.verdictRating}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
      <div className="p-4 border-t bg-muted/30">
        <Button variant="ghost" asChild className="w-full sm:w-auto">
          <Link href="/factchecks" className="flex items-center gap-2">
            Voir tous les fact-checks
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </>
  );
}

function AffairesContent({ affairs }: { affairs: AffairItem[] }) {
  if (affairs.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Aucune affaire récente</div>;
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {affairs.map((affair) => (
          <li key={affair.id}>
            <Link
              href={`/affaires/${affair.slug || affair.id}`}
              prefetch={false}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-medium group-hover:text-primary transition-colors">
                  {affair.title}
                </p>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  {affair.date && <span>{formatDate(affair.date)}</span>}
                  {affair.date && <span>•</span>}
                  <span>{affair.politician.fullName}</span>
                </div>
              </div>
              <Badge variant="outline">
                {AFFAIR_STATUS_LABELS[affair.status as AffairStatus] || affair.status}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
      <div className="p-4 border-t bg-muted/30">
        <Button variant="ghost" asChild className="w-full sm:w-auto">
          <Link href="/affaires" className="flex items-center gap-2">
            Voir toutes les affaires
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </>
  );
}

function VotesContent({ votes }: { votes: VoteItem[] }) {
  if (votes.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Aucun vote récent</div>;
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {votes.map((vote) => (
          <li key={vote.id}>
            <Link
              href={`/parlement/votes/${vote.slug || vote.id}`}
              prefetch={false}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-medium group-hover:text-primary transition-colors">
                  {vote.title}
                </p>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span>{formatDate(vote.date)}</span>
                  <span>•</span>
                  <span>{vote.chamber === "AN" ? "Assemblée" : "Sénat"}</span>
                </div>
              </div>
              <Badge
                variant={
                  vote.result === "ADOPTE"
                    ? "default"
                    : vote.result === "REJETE"
                      ? "destructive"
                      : "secondary"
                }
                className={
                  vote.result === "ADOPTE"
                    ? "bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20"
                    : ""
                }
              >
                {vote.result === "ADOPTE"
                  ? "Adopté"
                  : vote.result === "REJETE"
                    ? "Rejeté"
                    : vote.result}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
      <div className="p-4 border-t bg-muted/30">
        <Button variant="ghost" asChild className="w-full sm:w-auto">
          <Link href="/parlement/votes" className="flex items-center gap-2">
            Voir tous les votes
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </>
  );
}

function DossiersContent({ dossiers }: { dossiers: DossierItem[] }) {
  if (dossiers.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Aucun dossier en cours</div>;
  }

  const statusLabels: Record<string, string> = {
    EN_COURS: "En cours",
    ADOPTE: "Adopté",
    REJETE: "Rejeté",
    RETIRE: "Retiré",
  };

  return (
    <>
      <ul className="divide-y divide-border">
        {dossiers.map((dossier) => (
          <li key={dossier.id}>
            <Link
              href={`/parlement/dossiers/${dossier.slug || dossier.id}`}
              prefetch={false}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-medium group-hover:text-primary transition-colors">
                  {dossier.shortTitle || dossier.title}
                </p>
                {dossier.filingDate && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Déposé le {formatDate(dossier.filingDate)}
                  </p>
                )}
              </div>
              <Badge
                variant={
                  [
                    "DEPOSE",
                    "EN_COMMISSION",
                    "EN_COURS",
                    "REJETE_NAVETTE",
                    "CONSEIL_CONSTITUTIONNEL",
                  ].includes(dossier.status)
                    ? "default"
                    : "secondary"
                }
              >
                {statusLabels[dossier.status] || dossier.status}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
      <div className="p-4 border-t bg-muted/30">
        <Button variant="ghost" asChild className="w-full sm:w-auto">
          <Link href="/parlement/dossiers" className="flex items-center gap-2">
            Voir tous les dossiers
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </>
  );
}

function PresseContent({ articles }: { articles: ArticleItem[] }) {
  if (articles.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Aucun article récent</div>;
  }

  const sourceLabels: Record<string, string> = {
    LEMONDE: "Le Monde",
    POLITICO: "Politico",
    MEDIAPART: "Mediapart",
  };

  return (
    <>
      <ul className="divide-y divide-border">
        {articles.map((article) => (
          <li key={article.id}>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-medium group-hover:text-primary transition-colors">
                  {article.title}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDate(article.publishedAt)}
                </p>
              </div>
              <Badge variant="outline">{sourceLabels[article.source] || article.source}</Badge>
            </a>
          </li>
        ))}
      </ul>
      <div className="p-4 border-t bg-muted/30">
        <Button variant="ghost" asChild className="w-full sm:w-auto">
          <Link href="/presse" className="flex items-center gap-2">
            Voir tous les articles
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </>
  );
}
