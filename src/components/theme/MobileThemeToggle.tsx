"use client";

import { useTheme } from "next-themes";
import { useIsMounted } from "@/hooks/useIsMounted";
import { Moon, Sun } from "lucide-react";

export function MobileThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useIsMounted();

  if (!mounted) {
    return (
      <button
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground/80"
        aria-label="Changer le thème"
      >
        {/* span, not div: a button may only contain phrasing content. */}
        <span className="block w-5 h-5" />
        <span>Thème</span>
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
      aria-label={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      <span>{isDark ? "Mode clair" : "Mode sombre"}</span>
    </button>
  );
}
