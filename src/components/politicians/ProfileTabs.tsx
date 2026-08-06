"use client";

import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { User, Briefcase, Vote, Wallet, FileCheck, Scale } from "lucide-react";
import { PROFILE_TABS_ANCHOR_ID } from "./profile-tabs-anchor";

const VALID_TABS = ["profil", "carriere", "votes", "patrimoine", "factchecks", "affaires"] as const;
type TabValue = (typeof VALID_TABS)[number];
const DEFAULT_TAB: TabValue = "profil";

interface ProfileTabsProps {
  profileContent: ReactNode;
  careerContent: ReactNode;
  votesContent: ReactNode | null;
  patrimoineContent: ReactNode | null;
  factchecksContent: ReactNode | null;
  affairsContent: ReactNode;
  affairsCount?: number;
}

function ProfileTabsInner({
  profileContent,
  careerContent,
  votesContent,
  patrimoineContent,
  factchecksContent,
  affairsContent,
  affairsCount,
}: ProfileTabsProps) {
  const searchParams = useSearchParams();

  const availableTabs = useMemo<readonly TabValue[]>(
    () =>
      VALID_TABS.filter((t) => {
        if (t === "votes" && !votesContent) return false;
        if (t === "patrimoine" && !patrimoineContent) return false;
        if (t === "factchecks" && !factchecksContent) return false;
        return true;
      }),
    [votesContent, patrimoineContent, factchecksContent]
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

  // If the URL names a tab that isn't available (e.g. ?tab=patrimoine on a
  // profile without declarations), drop ?tab so the URL matches the fallback
  // tab instead of lying.
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw && !availableTabs.includes(raw as TabValue)) {
      const params = new URLSearchParams(window.location.search);
      params.delete("tab");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [searchParams, availableTabs]);

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
    // Target of the "En bref" shortcuts. Mounted once, unlike the summary that
    // links here, so the id stays unique. scroll-mt clears the sticky header.
    <div id={PROFILE_TABS_ANCHOR_ID} tabIndex={-1} className="scroll-mt-20 outline-none">
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
          {patrimoineContent && (
            <TabsTrigger value="patrimoine">
              <Wallet className="size-4" />
              Patrimoine
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
        {patrimoineContent && <TabsContent value="patrimoine">{patrimoineContent}</TabsContent>}
        {factchecksContent && <TabsContent value="factchecks">{factchecksContent}</TabsContent>}
        <TabsContent value="affaires">{affairsContent}</TabsContent>
      </Tabs>
    </div>
  );
}

export function ProfileTabs(props: ProfileTabsProps & { affairsCount?: number }) {
  return (
    <Suspense>
      <ProfileTabsInner {...props} />
    </Suspense>
  );
}
