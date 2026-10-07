"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Telescope, Vote, Scale, Building2 } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { Badge } from "@/components/ui/badge";
import { VOTE_POSITION_LABELS, AFFAIR_CATEGORY_LABELS } from "@/config/labels";
import { getColor } from "@/config/colors";
import type { VotePosition, AffairCategory } from "@/generated/prisma";
import type { ActivityItem, ActivityResponse } from "@/types/activity";
import { WatchlistSearch } from "./WatchlistSearch";
import { WatchlistSidebar } from "./WatchlistSidebar";
import { WatchlistDashboard } from "./WatchlistDashboard";
import { WatchlistAvatarBar } from "./WatchlistAvatarBar";

// --- Constants ---

const LAST_VISIT_KEY = "poligraph:watchlist:lastVisit";

type TabId = "activity" | "following" | "add";

const TABS: { id: TabId; label: string }[] = [
  { id: "activity", label: "Activité" },
  { id: "following", label: "Suivis" },
  { id: "add", label: "+" },
];

const ACTIVITY_ICONS: Record<string, typeof Vote> = {
  vote: Vote,
  affair: Scale,
};

const ACTIVITY_LABELS: Record<string, string> = {
  vote: "Vote",
  affair: "Affaire",
  "party-update": "Parti",
};

// --- Main component ---

export function WatchlistContent() {
  const { items, count } = useWatchlist();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab management via URL params
  const rawTab = searchParams.get("tab");
  const activeTab: TabId = rawTab === "following" || rawTab === "add" ? rawTab : "activity";

  const setActiveTab = useCallback(
    (tab: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "activity") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.push(`/mon-observatoire${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Data fetching
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());

  const toggleSlugFilter = useCallback((slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const clearSlugFilter = useCallback(() => {
    setSelectedSlugs(new Set());
  }, []);

  // "New" alert state
  const [hasNew, setHasNew] = useState(false);

  // Build dependency key from items
  const itemsKey = useMemo(() => items.map((i) => `${i.type}:${i.slug}`).join(","), [items]);

  // Split items by type
  const politicianSlugs = useMemo(
    () => items.filter((i) => i.type === "politician").map((i) => i.slug),
    [items]
  );
  const partySlugs = useMemo(
    () => items.filter((i) => i.type === "party").map((i) => i.slug),
    [items]
  );

  // Subtitle
  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (politicianSlugs.length > 0) {
      parts.push(`${politicianSlugs.length} politique${politicianSlugs.length > 1 ? "s" : ""}`);
    }
    if (partySlugs.length > 0) {
      parts.push(`${partySlugs.length} parti${partySlugs.length > 1 ? "s" : ""}`);
    }
    return parts.join(" · ");
  }, [politicianSlugs.length, partySlugs.length]);

  // Fetch activity data
  useEffect(() => {
    if (items.length === 0) {
      setData(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/activity/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slugs: politicianSlugs,
        partySlugs,
        days: 30,
      }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Erreur serveur");
        return res.json();
      })
      .then((json: ActivityResponse) => {
        setData(json);
        setLoading(false);

        // Check for new activity since last visit
        const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
        if (lastVisit && json.activity.length > 0) {
          const lastVisitDate = new Date(lastVisit);
          const hasNewActivity = json.activity.some((a) => new Date(a.date) > lastVisitDate);
          setHasNew(hasNewActivity);
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("Erreur lors du chargement de l'activité.");
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  // Update lastVisitedAt when on activity tab
  useEffect(() => {
    if (activeTab === "activity" && data && !loading) {
      localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
      setHasNew(false);
    }
  }, [activeTab, data, loading]);

  // Filtered activity — combines type filter + person filter
  const filteredActivity = useMemo(() => {
    if (!data) return [];
    return data.activity.filter((a) => {
      if (activeFilter !== "all" && a.type !== activeFilter) return false;
      if (selectedSlugs.size === 0) return true;
      const matchesPolitician = !!a.politician && selectedSlugs.has(a.politician.slug);
      const matchesParty = !!a.party && selectedSlugs.has(a.party.slug);
      return matchesPolitician || matchesParty;
    });
  }, [data, activeFilter, selectedSlugs]);

  // Empty state — no items followed
  if (count === 0 && activeTab !== "add") {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <div className="text-center py-16 max-w-lg mx-auto">
          <div className="mx-auto size-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Telescope className="size-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Aucun représentant suivi</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Ajoutez des politiques ou des partis à votre observatoire pour suivre leurs votes et
            leurs affaires judiciaires.
          </p>
          <div className="max-w-md mx-auto">
            <WatchlistSearch />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}

      {/* ========== Desktop layout (lg+) ========== */}
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-8">
        {/* Sidebar */}
        <aside className="lg:col-span-1">
          <WatchlistSidebar
            politicians={data?.politicians ?? []}
            parties={data?.parties ?? []}
            selectedSlugs={selectedSlugs}
            onToggleFilter={toggleSlugFilter}
            onClearFilter={clearSlugFilter}
            onAddClick={() => setActiveTab("add")}
          />
        </aside>

        {/* Main content */}
        <main className="lg:col-span-3 space-y-6">
          {activeTab === "add" ? (
            <div>
              <h2 className="text-lg font-semibold mb-4">Ajouter des suivis</h2>
              <WatchlistSearch />
            </div>
          ) : (
            <>
              <WatchlistDashboard
                stats={data?.stats ?? null}
                filteredActivity={filteredActivity}
                hasPersonFilter={selectedSlugs.size > 0}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                selectedSlugs={selectedSlugs}
                politicians={data?.politicians ?? []}
                parties={data?.parties ?? []}
                onRemoveSlug={toggleSlugFilter}
                onClearFilter={clearSlugFilter}
              />
              <ActivityFeed activity={filteredActivity} loading={loading} error={error} />
            </>
          )}
        </main>
      </div>

      {/* ========== Mobile layout (<lg) ========== */}
      <div className="lg:hidden">
        {/* Sticky tabs */}
        <div className="sticky top-0 z-10 bg-background border-b -mx-4 px-4">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 py-3 text-sm font-medium text-center transition-colors ${
                  activeTab === tab.id
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.id === "activity" && hasNew && (
                  <span className="absolute top-2.5 ml-0.5 size-2 rounded-full bg-red-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="pt-4">
          {activeTab === "activity" && (
            <div className="space-y-4">
              <WatchlistAvatarBar
                politicians={data?.politicians ?? []}
                parties={data?.parties ?? []}
                selectedSlugs={selectedSlugs}
                onToggleFilter={toggleSlugFilter}
              />
              <WatchlistDashboard
                stats={data?.stats ?? null}
                filteredActivity={filteredActivity}
                hasPersonFilter={selectedSlugs.size > 0}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                selectedSlugs={selectedSlugs}
                politicians={data?.politicians ?? []}
                parties={data?.parties ?? []}
                onRemoveSlug={toggleSlugFilter}
                onClearFilter={clearSlugFilter}
              />
              <ActivityFeed activity={filteredActivity} loading={loading} error={error} />
            </div>
          )}
          {activeTab === "following" && (
            <WatchlistSidebar
              politicians={data?.politicians ?? []}
              parties={data?.parties ?? []}
              selectedSlugs={selectedSlugs}
              onToggleFilter={toggleSlugFilter}
              onClearFilter={clearSlugFilter}
              onAddClick={() => setActiveTab("add")}
            />
          )}
          {activeTab === "add" && <WatchlistSearch />}
        </div>
      </div>
    </div>
  );
}

// --- Activity feed sub-component ---

function ActivityFeed({
  activity,
  loading,
  error,
}: {
  activity: ActivityItem[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-lg border bg-card">
            <div className="size-10 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              <div className="h-3.5 w-48 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-3 w-12 bg-muted rounded animate-pulse self-start" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Aucune activité sur les 30 derniers jours.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activity.map((item, i) => (
        <ActivityCard key={`${item.type}-${i}`} item={item} />
      ))}
    </div>
  );
}

// --- ActivityCard sub-component ---

function ActivityCard({ item }: { item: ActivityItem }) {
  const date = new Date(item.date);
  const formattedDate = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

  // Party-update type: party-centric card
  if (item.type === "party-update" && item.party) {
    const message = (item.data.message as string) || "";
    return (
      <div className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        <div
          className="size-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: item.party.color ? `${item.party.color}20` : "#e5e7eb",
          }}
        >
          <Building2 className="size-5" style={{ color: item.party.color || "#6b7280" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <Link
              href={`/partis/${item.party.slug}`}
              className="text-sm font-semibold hover:text-primary transition-colors"
              prefetch={false}
            >
              {item.party.shortName || item.party.name}
            </Link>
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
              <Building2 className="size-3" />
              {ACTIVITY_LABELS["party-update"]}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{formattedDate}</span>
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </div>
    );
  }

  // Politician-centric cards (vote, press, affair)
  if (!item.politician) return null;

  const Icon = ACTIVITY_ICONS[item.type];
  const label = ACTIVITY_LABELS[item.type];

  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <Link href={`/politiques/${item.politician.slug}`} prefetch={false} className="shrink-0">
        <PoliticianAvatar
          photoUrl={item.politician.photoUrl}
          blobPhotoUrl={item.politician.blobPhotoUrl}
          fullName={item.politician.fullName}
          size="sm"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <Link
            href={`/politiques/${item.politician.slug}`}
            className="text-sm font-semibold hover:text-primary transition-colors"
            prefetch={false}
          >
            {item.politician.fullName}
          </Link>
          <Badge
            variant="outline"
            className={`text-[10px] gap-1 px-1.5 py-0 ${
              item.type === "affair"
                ? "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                : ""
            }`}
          >
            {Icon && <Icon className="size-3" />}
            {label}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">{formattedDate}</span>
        </div>
        <ActivityDetail item={item} />
      </div>
    </div>
  );
}

// --- ActivityDetail sub-component ---

function ActivityDetail({ item }: { item: ActivityItem }) {
  switch (item.type) {
    case "vote": {
      const position = item.data.position as VotePosition;
      const title = item.data.title as string;
      const slug = item.data.slug as string | null;
      const positionLabel = VOTE_POSITION_LABELS[position] ?? position;
      const positionColor = getColor("vote", position.toLowerCase());

      return (
        <p className="text-sm text-muted-foreground">
          A voté{" "}
          <span className="font-medium" style={{ color: positionColor }}>
            {positionLabel}
          </span>{" "}
          sur{" "}
          {slug ? (
            <Link
              href={`/parlement/votes/${slug}`}
              className="text-primary hover:underline"
              prefetch={false}
            >
              {title}
            </Link>
          ) : (
            <span>{title}</span>
          )}
        </p>
      );
    }
    case "affair": {
      const title = item.data.title as string;
      const slug = item.data.slug as string;
      const category = item.data.category as AffairCategory;
      const categoryLabel = AFFAIR_CATEGORY_LABELS[category] ?? category;

      return (
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/affaires/${slug}`}
            className="text-amber-700 dark:text-amber-400 hover:underline"
            prefetch={false}
          >
            {title}
          </Link>
          <span className="text-xs ml-1">({categoryLabel})</span>
        </p>
      );
    }
    default:
      return null;
  }
}
