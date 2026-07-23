"use client";

import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { User, Briefcase, Vote, FileCheck, Scale } from "lucide-react";

const VALID_TABS = ["profil", "carriere", "votes", "factchecks", "affaires"] as const;
type TabValue = (typeof VALID_TABS)[number];
const DEFAULT_TAB: TabValue = "profil";

interface ProfileTabsProps {
  profileContent: ReactNode;
  careerContent: ReactNode;
  votesContent: ReactNode | null;
  factchecksContent: ReactNode | null;
  affairsContent: ReactNode;
  affairsCount?: number;
}

function ProfileTabsInner({
  profileContent,
  careerContent,
  votesContent,
  factchecksContent,
  affairsContent,
  affairsCount,
}: ProfileTabsProps) {
  const searchParams = useSearchParams();

  const availableTabs = useMemo<readonly TabValue[]>(
    () =>
      VALID_TABS.filter((t) => {
        if (t === "votes" && !votesContent) return false;
        if (t === "factchecks" && !factchecksContent) return false;
        return true;
      }),
    [votesContent, factchecksContent]
  );

  const tabFromUrl = useMemo<TabValue>(() => {
    const raw = searchParams.get("tab");
    return availableTabs.includes(raw as TabValue) ? (raw as TabValue) : DEFAULT_TAB;
  }, [searchParams, availableTabs]);

  const [tab, setTab] = useState<TabValue>(tabFromUrl);

  // Keep local state in sync when the URL changes externally
  // (browser back/forward, in-page <Link href="?tab=...">).
  useEffect(() => {
    setTab(tabFromUrl);
  }, [tabFromUrl]);

  function onTabChange(value: string) {
    const next = value as TabValue;
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="profil">
          <User className="size-4" />
          Profil
        </TabsTrigger>
        <TabsTrigger value="carriere">
          <Briefcase className="size-4" />
          Carrière
        </TabsTrigger>
        {votesContent && (
          <TabsTrigger value="votes">
            <Vote className="size-4" />
            Votes
          </TabsTrigger>
        )}
        {factchecksContent && (
          <TabsTrigger value="factchecks">
            <FileCheck className="size-4" />
            Fact-checks
          </TabsTrigger>
        )}
        <TabsTrigger value="affaires">
          <Scale className="size-4" />
          Affaires
          {affairsCount != null && affairsCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium min-w-[1.25rem] h-5 px-1.5">
              {affairsCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="profil">{profileContent}</TabsContent>
      <TabsContent value="carriere">{careerContent}</TabsContent>
      {votesContent && <TabsContent value="votes">{votesContent}</TabsContent>}
      {factchecksContent && <TabsContent value="factchecks">{factchecksContent}</TabsContent>}
      <TabsContent value="affaires">{affairsContent}</TabsContent>
    </Tabs>
  );
}

export function ProfileTabs(props: ProfileTabsProps & { affairsCount?: number }) {
  return (
    <Suspense>
      <ProfileTabsInner {...props} />
    </Suspense>
  );
}
