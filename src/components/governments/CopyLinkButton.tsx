"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies the current URL (date and filters included). Announces the result politely. */
export function CopyLinkButton() {
  const [status, setStatus] = useState<"" | "ok" | "error">("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" className="min-h-11" onClick={copy}>
        <Link2 aria-hidden="true" />
        Copier le lien
      </Button>
      <span role="status" className="text-sm text-muted-foreground">
        {status === "ok"
          ? "Lien copié."
          : status === "error"
            ? "Copie impossible : copiez l'adresse affichée dans la barre du navigateur."
            : ""}
      </span>
    </span>
  );
}
