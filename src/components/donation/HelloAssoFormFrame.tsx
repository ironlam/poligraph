"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FRAME_MIN_HEIGHT, parseHelloAssoHeight } from "./helloasso-frame-utils";

type Props = {
  src: string;
  title: string;
  fallbackUrl: string;
  /** When true, the iframe is not created until the user clicks the load button. */
  requireClick?: boolean;
  onActivate?: () => void;
  className?: string;
};

export function HelloAssoFormFrame({
  src,
  title,
  fallbackUrl,
  requireClick = false,
  onActivate,
  className,
}: Props) {
  const [loaded, setLoaded] = useState(!requireClick);
  const [ready, setReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!loaded) return;
    function onMessage(event: MessageEvent) {
      const height = parseHelloAssoHeight(event, iframeRef.current?.contentWindow);
      if (height === null) return;
      const el = iframeRef.current;
      if (el && height > parseFloat(el.style.height || "0")) {
        el.style.height = `${height}px`;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loaded]);

  return (
    <div className={cn("space-y-2", className)}>
      {loaded ? (
        <>
          {!ready && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Chargement du formulaire sécurisé...
            </p>
          )}
          <iframe
            ref={iframeRef}
            src={src}
            title={title}
            allow="payment"
            onLoad={() => setReady(true)}
            style={{
              width: "min(100%, 26rem)",
              height: `${FRAME_MIN_HEIGHT}px`,
              border: "none",
              margin: "0 auto",
              display: "block",
            }}
          />
          <p className="text-xs text-muted-foreground">
            Le formulaire ne s&apos;affiche pas ?{" "}
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Ouvrir le formulaire sécurisé sur HelloAsso
              <span className="sr-only"> (ouvre un nouvel onglet)</span>
            </a>
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            onActivate?.();
            setLoaded(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Charger le formulaire sécurisé
        </button>
      )}
    </div>
  );
}
