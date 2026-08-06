import {
  Vote,
  Landmark,
  Scale,
  Gavel,
  Shield,
  Users,
  FileCheck,
  Wallet,
  FileText,
} from "lucide-react";
import type { Signal, SignalIconKey, SignalTone } from "@/lib/politicians/signals";
import { TabShortcutLink } from "./TabShortcutLink";

const ICONS: Record<
  SignalIconKey,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  vote: Vote,
  mandate: Landmark,
  scale: Scale,
  gavel: Gavel,
  shield: Shield,
  users: Users,
  filecheck: FileCheck,
  wallet: Wallet,
  filetext: FileText,
};

const TONE: Record<SignalTone, string> = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  neutral: "text-foreground",
};

// Dashboard cards: only the "primary" signals. Meaning is carried by icon +
// label + value; tone is a visual reinforcement only.
export function PoliticianSignals({ signals }: { signals: Signal[] }) {
  const cards = signals.filter((s) => s.primary);
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((s) => {
        const Icon = ICONS[s.iconKey];
        return (
          <TabShortcutLink
            key={s.key}
            href={s.href}
            className="flex min-h-11 flex-col justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={`size-4 ${TONE[s.tone]}`} aria-hidden={true} />
              {s.label}
            </span>
            <span className={`mt-1 font-display text-xl font-extrabold ${TONE[s.tone]}`}>
              {s.value}{" "}
              <span aria-hidden className="text-xs text-primary">
                →
              </span>
            </span>
          </TabShortcutLink>
        );
      })}
    </div>
  );
}
