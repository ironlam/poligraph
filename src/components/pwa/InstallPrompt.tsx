"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, X } from "lucide-react";
import { shouldShowPrompt, DISMISS_DURATION_MS, MIN_VISITS } from "@/lib/pwa/install-gate";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const VISIT_KEY = "pwa-visit-count";
const DISMISS_KEY = "pwa-prompt-dismissed-until";

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

function readNumber(key: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const next = readNumber(VISIT_KEY) + 1;
    window.localStorage.setItem(VISIT_KEY, String(next));
  }, []);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      const ev = event as BeforeInstallPromptEvent;
      setPromptEvent(ev);
      const allowed = shouldShowPrompt({
        now: Date.now(),
        visitCount: readNumber(VISIT_KEY),
        dismissedUntil: readNumber(DISMISS_KEY),
        isMobile: isMobileViewport(),
        hasPromptEvent: true,
      });
      if (allowed) setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const onDismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS));
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onDismiss]);

  const onInstall = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    setVisible(false);
  }, [promptEvent]);

  if (!visible || !promptEvent) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-description"
      className="fixed bottom-[calc(var(--tabbar-h)+1rem)] left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-border bg-background p-4 shadow-lg md:hidden"
    >
      <div className="flex items-start gap-3">
        <Download className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
        <div className="flex-1">
          <p id="pwa-install-title" className="text-sm font-semibold text-foreground">
            Installer Poligraph
          </p>
          <p id="pwa-install-description" className="mt-1 text-xs text-muted-foreground">
            Ajoutez Poligraph à votre écran d&apos;accueil pour un accès rapide aux fiches
            consultées récemment, même hors connexion.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Installer
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Fermer la proposition d'installation"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Suggestion après {MIN_VISITS} visites.</p>
    </div>
  );
}
