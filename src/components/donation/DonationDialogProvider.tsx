"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { buildDonationWidgetUrl, HELLOASSO_FORM_URL } from "@/config/donation";
import { trackUmami } from "@/lib/umami";
import { cn } from "@/lib/utils";
import { HelloAssoFormFrame } from "./HelloAssoFormFrame";

type DonationIntent = "monthly" | "one-time" | "generic";
type DonationSource = "homepage" | "support-page";

type DonationDialogContextValue = { open: (intent: DonationIntent) => void };

const DonationDialogContext = createContext<DonationDialogContextValue | null>(null);

export function useDonationDialog(): DonationDialogContextValue {
  const ctx = useContext(DonationDialogContext);
  if (!ctx) throw new Error("useDonationDialog must be used within DonationDialogProvider");
  return ctx;
}

export function DonationDialogProvider({
  source,
  children,
}: {
  source: DonationSource;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [intent, setIntent] = useState<DonationIntent>("generic");

  const value = useMemo<DonationDialogContextValue>(
    () => ({
      open: (nextIntent) => {
        setIntent(nextIntent);
        setIsOpen(true);
        trackUmami("donation_dialog_open", { source, intent: nextIntent });
      },
    }),
    [source]
  );

  const widgetSrc = buildDonationWidgetUrl(
    intent === "generic" ? undefined : { frequency: intent }
  );

  return (
    <DonationDialogContext.Provider value={value}>
      {children}
      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4",
              "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
              "sm:w-full sm:max-w-[30rem] sm:max-h-[90vh] sm:rounded-xl sm:border sm:shadow-2xl"
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="font-display text-lg font-bold">
                Soutenir Poligraph
              </Dialog.Title>
              <Dialog.Close
                aria-label="Fermer"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Formulaire de don sécurisé HelloAsso pour l&apos;association Sankofa.
            </Dialog.Description>
            {isOpen && (
              <HelloAssoFormFrame
                src={widgetSrc}
                title="Formulaire de don HelloAsso"
                fallbackUrl={HELLOASSO_FORM_URL}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </DonationDialogContext.Provider>
  );
}
