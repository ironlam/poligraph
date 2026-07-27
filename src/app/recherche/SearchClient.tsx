"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Loader2,
  Users,
  Building2,
  Scale,
  Vote,
  ArrowRight,
  X,
  CheckCircle2,
  FileText,
  MapPin,
} from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import {
  MANDATE_TYPE_LABELS,
  CHAMBER_SHORT_LABELS,
  AFFAIR_STATUS_LABELS,
  DOSSIER_STATUS_LABELS,
} from "@/config/labels";
import { formatDateShort } from "@/lib/utils";
import type { MandateType, Chamber, AffairStatus, DossierStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoliticianResult {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  party: string | null;
  partyColor: string | null;
  mandate: MandateType | null;
}

interface PartyResult {
  slug: string;
  name: string;
  shortName: string;
  color: string | null;
  memberCount: number;
}

interface AffairResult {
  slug: string;
  title: string;
  status: AffairStatus;
  politicianName: string;
  politicianSlug: string;
}

interface ScrutinResult {
  slug: string | null;
  id: string;
  title: string;
  votingDate: string;
  chamber: Chamber;
}

interface FactCheckResult {
  slug: string;
  title: string;
  source: string;
  verdictRating: string | null;
  publishedAt: string;
  politicianName: string | null;
}

interface DossierResult {
  slug: string;
  title: string;
  shortTitle: string | null;
  status: DossierStatus;
  filingDate: string | null;
}

interface CommuneResult {
  id: string;
  name: string;
  departmentName: string;
  population: number | null;
}

interface SearchResults {
  politicians: PoliticianResult[];
  parties: PartyResult[];
  affairs: AffairResult[];
  scrutins: ScrutinResult[];
  factchecks: FactCheckResult[];
  dossiers: DossierResult[];
  communes: CommuneResult[];
}

type TabKey =
  | "all"
  | "politicians"
  | "parties"
  | "affairs"
  | "scrutins"
  | "factchecks"
  | "dossiers"
  | "communes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "politicians", label: "Représentants" },
  { key: "parties", label: "Partis" },
  { key: "affairs", label: "Affaires" },
  { key: "scrutins", label: "Votes" },
  { key: "factchecks", label: "Fact-checks" },
  { key: "dossiers", label: "Dossiers" },
  { key: "communes", label: "Communes" },
];

// ---------------------------------------------------------------------------
// Data-driven section config — one entry per result type
// ---------------------------------------------------------------------------

interface SectionConfig {
  key: Exclude<TabKey, "all">;
  icon: typeof Search;
  label: string;
  accent?: "amber";
  footerHref?: (q: string) => string;
  footerLabel?: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: "politicians",
    icon: Users,
    label: "Représentants",
    footerHref: (q) => `/politiques?search=${encodeURIComponent(q)}`,
    footerLabel: "tous les représentants",
  },
  {
    key: "parties",
    icon: Building2,
    label: "Partis",
    footerHref: (q) => `/partis?search=${encodeURIComponent(q)}`,
    footerLabel: "tous les partis",
  },
  {
    key: "affairs",
    icon: Scale,
    label: "Affaires judiciaires",
    accent: "amber",
    footerHref: (q) => `/affaires?search=${encodeURIComponent(q)}`,
    footerLabel: "toutes les affaires",
  },
  {
    key: "scrutins",
    icon: Vote,
    label: "Votes",
    footerHref: (q) => `/votes?search=${encodeURIComponent(q)}`,
    footerLabel: "tous les votes",
  },
  {
    key: "factchecks",
    icon: CheckCircle2,
    label: "Fact-checks",
    footerHref: (q) => `/factchecks?search=${encodeURIComponent(q)}`,
    footerLabel: "tous les fact-checks",
  },
  { key: "dossiers", icon: FileText, label: "Dossiers législatifs" },
  { key: "communes", icon: MapPin, label: "Communes" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ROW_COMPONENTS: Record<string, React.ComponentType<{ result: any }>> = {
  politicians: PoliticianRow,
  parties: PartyRow,
  affairs: AffairRow,
  scrutins: ScrutinRow,
  factchecks: FactCheckRow,
  dossiers: DossierRow,
  communes: CommuneRow,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SearchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cmd+K on this page → focus + select input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/global?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: SearchResults) => {
          setResults(data);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Debounced URL sync
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const qs = params.toString();
      router.replace(`/recherche${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, router]);

  // Counts per category (memoized to avoid recalculating on every render)
  const counts = useMemo(() => {
    if (!results) return null;
    const c: Record<string, number> = {};
    for (const key of Object.keys(results) as (keyof SearchResults)[]) {
      c[key] = results[key].length;
    }
    c.all = Object.values(c).reduce((sum, n) => sum + n, 0);
    return c as Record<TabKey, number>;
  }, [results]);

  const hasResults = counts !== null && counts.all > 0;
  const noResults = results !== null && counts !== null && counts.all === 0 && query.length >= 2;

  function clearSearch() {
    setQuery("");
    setResults(null);
    setActiveTab("all");
    inputRef.current?.focus();
  }

  return (
    <div className="min-h-[60vh]">
      {/* ── Search input ──────────────────────────────────────── */}
      <div className="relative max-w-2xl mx-auto mb-8">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          {loading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un représentant, parti, vote, fact-check, commune..."
          className="w-full h-14 pl-12 pr-12 text-lg bg-background border-2 border-border rounded-2xl focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-muted-foreground/50"
          aria-label="Recherche globale"
          autoComplete="off"
        />
        {query && (
          <button
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={clearSearch}
            aria-label="Effacer la recherche"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ── Category tabs ─────────────────────────────────────── */}
      {hasResults && (
        <div className="max-w-2xl mx-auto mb-8">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {TABS.map((tab) => {
              const count = counts[tab.key];
              if (tab.key !== "all" && count === 0) return null;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
                    isActive
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-1 ${isActive ? "opacity-70" : "opacity-50"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto">
        {results && counts && counts.all > 0 && (
          <div className="space-y-10">
            {SECTIONS.map((section) => {
              const items = results[section.key] as { slug?: string; id?: string }[];
              if (!showSection(section.key, activeTab) || items.length === 0) return null;
              const RowComponent = ROW_COMPONENTS[section.key]!;
              return (
                <section key={section.key}>
                  <SectionHeader
                    icon={section.icon}
                    label={section.label}
                    count={counts[section.key]}
                    accent={section.accent}
                  />
                  <div className="divide-y divide-border/50">
                    {items.map((item) => (
                      <RowComponent key={item.slug || item.id} result={item} />
                    ))}
                  </div>
                  {activeTab === "all" && section.footerHref && section.footerLabel && (
                    <SectionFooter href={section.footerHref(query)} label={section.footerLabel} />
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* No results */}
        {noResults && (
          <div className="text-center py-20">
            <Search className="h-10 w-10 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">Aucun résultat pour «&nbsp;{query}&nbsp;»</p>
            <p className="text-sm text-muted-foreground/60 mt-2">
              Vérifiez l&apos;orthographe ou essayez un terme plus général
            </p>
          </div>
        )}

        {/* Empty state */}
        {!results && !loading && query.length < 2 && (
          <div className="text-center py-20 text-muted-foreground/50">
            <Search className="h-12 w-12 mx-auto mb-5 opacity-30" />
            <p className="text-lg font-medium text-muted-foreground/70">
              Recherchez parmi les représentants, partis, votes, fact-checks, dossiers et communes
            </p>
            <p className="text-sm mt-3 text-muted-foreground/40">
              Tapez au moins 2 caractères pour lancer la recherche
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showSection(section: TabKey, activeTab: TabKey) {
  return activeTab === "all" || activeTab === section;
}

function formatPopulation(pop: number | null): string {
  if (!pop) return "";
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M hab.`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(0)}k hab.`;
  return `${pop} hab.`;
}

const VERDICT_COLORS: Record<string, string> = {
  TRUE: "#2d6a4f",
  MOSTLY_TRUE: "#52b788",
  HALF_TRUE: "#e9a825",
  MISLEADING: "#e76f51",
  OUT_OF_CONTEXT: "#e76f51",
  MOSTLY_FALSE: "#c1121f",
  FALSE: "#c1121f",
  UNVERIFIABLE: "#6b7280",
};

const VERDICT_SHORT_LABELS: Record<string, string> = {
  TRUE: "Vrai",
  MOSTLY_TRUE: "Plutôt vrai",
  HALF_TRUE: "Mi-vrai",
  MISLEADING: "Trompeur",
  OUT_OF_CONTEXT: "Hors contexte",
  MOSTLY_FALSE: "Plutôt faux",
  FALSE: "Faux",
  UNVERIFIABLE: "Invérifiable",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  label,
  count,
  accent,
}: {
  icon: typeof Search;
  label: string;
  count: number;
  accent?: "amber";
}) {
  const accentClasses = accent === "amber" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <div className="flex items-center gap-2.5 pb-3">
      <Icon className={`h-4 w-4 ${accentClasses || "text-muted-foreground"}`} aria-hidden="true" />
      <h2
        className={`text-xs font-semibold uppercase tracking-wider ${accentClasses || "text-muted-foreground"}`}
      >
        {label}
      </h2>
      <span className="text-xs text-muted-foreground/50">{count}</span>
    </div>
  );
}

function SectionFooter({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 mt-3 text-sm text-primary hover:underline"
      prefetch={false}
    >
      Voir {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function PoliticianRow({ result }: { result: PoliticianResult }) {
  return (
    <Link
      href={`/politiques/${result.slug}`}
      className="flex items-center gap-3 py-3 hover:bg-accent/40 rounded-lg transition-colors px-3 -mx-3"
      prefetch={false}
    >
      <PoliticianAvatar
        photoUrl={result.photoUrl}
        fullName={result.fullName}
        size="sm"
        className="w-8 h-8 text-xs shrink-0"
      />
      <span className="font-medium text-sm">{result.fullName}</span>
      {result.party && (
        <span
          className="text-xs px-2 py-0.5 rounded-full shrink-0"
          style={{
            backgroundColor: result.partyColor ? `${result.partyColor}18` : undefined,
            color: result.partyColor || undefined,
          }}
        >
          {result.party}
        </span>
      )}
      {result.mandate && (
        <span className="ml-auto text-xs text-muted-foreground shrink-0 hidden sm:inline">
          {MANDATE_TYPE_LABELS[result.mandate]}
        </span>
      )}
    </Link>
  );
}

function PartyRow({ result }: { result: PartyResult }) {
  return (
    <Link
      href={`/partis/${result.slug}`}
      className="flex items-center gap-3 py-3 hover:bg-accent/40 rounded-lg transition-colors px-3 -mx-3"
      prefetch={false}
    >
      <div
        className="w-3.5 h-3.5 rounded-full shrink-0"
        style={{ backgroundColor: result.color || "#888" }}
      />
      <span className="font-medium text-sm">{result.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">{result.shortName}</span>
      <span className="ml-auto text-xs text-muted-foreground shrink-0">
        {result.memberCount} membre{result.memberCount > 1 ? "s" : ""}
      </span>
    </Link>
  );
}

function AffairRow({ result }: { result: AffairResult }) {
  return (
    <Link
      href={`/affaires/${result.slug}`}
      className="flex items-center gap-3 py-3 hover:bg-accent/40 rounded-lg transition-colors px-3 -mx-3"
      prefetch={false}
    >
      <Scale className="h-4 w-4 text-amber-500/60 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-base leading-snug">{result.title}</span>
        <span className="block text-xs text-muted-foreground">{result.politicianName}</span>
      </div>
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 hidden sm:inline">
        {AFFAIR_STATUS_LABELS[result.status]}
      </span>
    </Link>
  );
}

function ScrutinRow({ result }: { result: ScrutinResult }) {
  return (
    <Link
      href={`/parlement/votes/${result.slug || result.id}`}
      className="flex items-start gap-3 py-3 hover:bg-accent/40 rounded-lg transition-colors px-3 -mx-3"
      prefetch={false}
    >
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 mt-0.5">
        {CHAMBER_SHORT_LABELS[result.chamber]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-base leading-snug">{result.title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">
          {formatDateShort(result.votingDate)}
        </span>
      </span>
    </Link>
  );
}

function FactCheckRow({ result }: { result: FactCheckResult }) {
  const verdictColor = result.verdictRating ? VERDICT_COLORS[result.verdictRating] : undefined;
  const verdictLabel = result.verdictRating ? VERDICT_SHORT_LABELS[result.verdictRating] : null;
  return (
    <Link
      href={`/factchecks/${result.slug}`}
      className="flex items-center gap-3 py-3 hover:bg-accent/40 rounded-lg transition-colors px-3 -mx-3"
      prefetch={false}
    >
      <CheckCircle2
        className="h-4 w-4 shrink-0"
        style={{ color: verdictColor || "#6b7280" }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-base leading-snug">{result.title}</span>
        <span className="block text-xs text-muted-foreground">
          {result.source}
          {result.politicianName && ` · ${result.politicianName}`}
        </span>
      </div>
      {verdictLabel && (
        <span
          className="text-[11px] px-2 py-0.5 rounded-full shrink-0 hidden sm:inline"
          style={{
            backgroundColor: verdictColor ? `${verdictColor}18` : undefined,
            color: verdictColor,
          }}
        >
          {verdictLabel}
        </span>
      )}
    </Link>
  );
}

function DossierRow({ result }: { result: DossierResult }) {
  return (
    <Link
      href={`/parlement/dossiers/${result.slug}`}
      className="flex items-center gap-3 py-3 hover:bg-accent/40 rounded-lg transition-colors px-3 -mx-3"
      prefetch={false}
    >
      <FileText className="h-4 w-4 text-muted-foreground/60 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-base leading-snug">
          {result.shortTitle || result.title}
        </span>
        {result.filingDate && (
          <span className="block text-xs text-muted-foreground">
            {formatDateShort(result.filingDate)}
          </span>
        )}
      </div>
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 hidden sm:inline">
        {DOSSIER_STATUS_LABELS[result.status]}
      </span>
    </Link>
  );
}

function CommuneRow({ result }: { result: CommuneResult }) {
  return (
    <Link
      href={`/elections/municipales-2026/communes/${result.id}`}
      className="flex items-center gap-3 py-3 hover:bg-accent/40 rounded-lg transition-colors px-3 -mx-3"
      prefetch={false}
    >
      <MapPin className="h-4 w-4 text-muted-foreground/60 shrink-0" aria-hidden="true" />
      <span className="font-medium text-sm">{result.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">{result.departmentName}</span>
      {result.population && (
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {formatPopulation(result.population)}
        </span>
      )}
    </Link>
  );
}
