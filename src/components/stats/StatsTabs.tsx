"use client";

import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Scale, ShieldCheck, FileText, BarChart3 } from "lucide-react";
import { STATS_TABS, DEFAULT_STATS_TAB, type StatsTab } from "@/config/routes";

interface StatsTabsProps {
  judicialContent: ReactNode;
  factCheckContent: ReactNode;
  legislativeContent: ReactNode;
  participationContent: ReactNode;
}

function StatsTabsInner({
  judicialContent,
  factCheckContent,
  legislativeContent,
  participationContent,
}: StatsTabsProps) {
  const searchParams = useSearchParams();

  const tabFromUrl = useMemo<StatsTab>(() => {
    const raw = searchParams.get("tab");
    return STATS_TABS.includes(raw as StatsTab) ? (raw as StatsTab) : DEFAULT_STATS_TAB;
  }, [searchParams]);

  const [tab, setTab] = useState<StatsTab>(tabFromUrl);

  // Keep local state in sync when the URL changes externally
  // (browser back/forward, in-page <Link href="?tab=...">).
  useEffect(() => {
    setTab(tabFromUrl);
  }, [tabFromUrl]);

  function onTabChange(value: string) {
    const next = value as StatsTab;
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === DEFAULT_STATS_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `/statistiques${qs ? `?${qs}` : ""}`);
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="judiciaire">
          <Scale className="h-4 w-4" />
          <span className="hidden sm:inline">Judiciaire</span>
          <span className="sm:hidden">Justice</span>
        </TabsTrigger>
        <TabsTrigger value="factchecks">
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Fact-checking</span>
          <span className="sm:hidden">Facts</span>
        </TabsTrigger>
        <TabsTrigger value="legislatif">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Législatif</span>
          <span className="sm:hidden">Lois</span>
        </TabsTrigger>
        <TabsTrigger value="participation">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Participation aux scrutins publics</span>
          <span className="sm:hidden">Votes</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="judiciaire">{judicialContent}</TabsContent>
      <TabsContent value="factchecks">{factCheckContent}</TabsContent>
      <TabsContent value="legislatif">{legislativeContent}</TabsContent>
      <TabsContent value="participation">{participationContent}</TabsContent>
    </Tabs>
  );
}

export function StatsTabs(props: StatsTabsProps) {
  return (
    <Suspense>
      <StatsTabsInner {...props} />
    </Suspense>
  );
}
