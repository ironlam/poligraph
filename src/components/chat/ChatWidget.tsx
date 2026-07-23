"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { ChatInterface } from "./ChatInterface";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus first focusable element when panel opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        const focusable = panelRef.current?.querySelector<HTMLElement>("input, textarea, button");
        focusable?.focus();
      });
    }
  }, [isOpen]);

  function handleClose() {
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  // Trap focus inside panel and handle Escape
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const panel = panelRef.current;
    if (!panel) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, isMinimized]);

  // Don't show on /chat page
  const isOnChatPage = pathname === "/chat";

  // Show subtle animation after 5 seconds if user hasn't interacted
  useEffect(() => {
    if (!hasInteracted) {
      const timer = setTimeout(() => {
        setHasInteracted(true);
      }, 30000); // 30 seconds
      return () => clearTimeout(timer);
    }
  }, [hasInteracted]);

  if (isOnChatPage) return null;

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          ref={triggerRef}
          onClick={() => {
            setIsOpen(true);
            setHasInteracted(true);
          }}
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "w-14 h-14 rounded-full",
            "bg-primary text-primary-foreground shadow-lg",
            "flex items-center justify-center",
            "hover:scale-105 transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
            !hasInteracted && "animate-pulse"
          )}
          aria-label="Ouvrir l'assistant IA"
          aria-expanded={false}
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Assistant IA"
          className={cn(
            "fixed z-50 bg-background border rounded-lg shadow-2xl",
            "flex flex-col overflow-hidden",
            "transition-all duration-300 ease-in-out",
            isMinimized
              ? "bottom-6 right-6 w-80 h-14"
              : "bottom-6 right-6 w-[420px] h-[600px] max-h-[80vh]",
            // Mobile: full width
            "max-sm:left-2 max-sm:right-2 max-sm:bottom-2 max-sm:w-auto"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Logo size={32} />
              <div>
                <h3 className="font-medium text-sm">Assistant IA</h3>
                {!isMinimized && (
                  <p className="text-xs text-muted-foreground">Posez vos questions</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsMinimized(!isMinimized)}
                aria-label={isMinimized ? "Agrandir" : "Réduire"}
              >
                {isMinimized ? (
                  <Maximize2 className="w-4 h-4" />
                ) : (
                  <Minimize2 className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleClose}
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Chat content */}
          {!isMinimized && (
            <div className="flex-1 overflow-hidden">
              <ChatInterface />
            </div>
          )}
        </div>
      )}

      {/* Backdrop on mobile when open */}
      {isOpen && !isMinimized && (
        <div
          className="fixed inset-0 bg-black/20 z-40 sm:hidden"
          aria-hidden="true"
          onClick={handleClose}
        />
      )}
    </>
  );
}
