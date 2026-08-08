"use client";

import { Compass } from "lucide-react";
import { CommandPaletteTrigger, CommandPaletteTriggerCompact } from "@/components/search";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { NavItem } from "@/config/navigation";

interface NavIconBarProps {
  tools: NavItem[];
  boussoleEnabled?: boolean;
}

export function NavIconBar({ tools: _tools, boussoleEnabled = false }: NavIconBarProps) {
  return (
    <div className="flex items-center gap-1">
      <CommandPaletteTrigger />
      <CommandPaletteTriggerCompact />
      <ThemeToggle />
      {boussoleEnabled && (
        <a
          href="https://boussole.poligraph.fr"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          aria-label="Boussole politique (s'ouvre dans un nouvel onglet)"
          title="Boussole"
        >
          <Compass className="w-5 h-5" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
