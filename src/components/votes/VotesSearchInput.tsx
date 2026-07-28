"use client";

import { UrlSearchInput } from "@/components/filters";

export function VotesSearchInput({ value, mode }: { value: string; mode?: "push" | "replace" }) {
  return (
    <UrlSearchInput
      value={value}
      mode={mode}
      placeholder="Rechercher un scrutin..."
      className="flex-1 min-w-[200px]"
    />
  );
}
