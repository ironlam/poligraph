"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ConsentFormProps {
  params: Record<string, string | null>;
  clientHost: string;
  clientName: string | null;
  redirectHost: string;
}

export function ConsentForm({ params, clientHost, clientName, redirectHost }: ConsentFormProps) {
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState("");

  async function submit(decision: "approve" | "deny") {
    setPending(decision);
    setError("");
    try {
      const response = await fetch("/api/admin/oauth/autoriser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, decision }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.redirectTo !== "string") {
        setError(data.error || "Autorisation impossible.");
        setPending(null);
        return;
      }
      window.location.assign(data.redirectTo);
    } catch {
      setError("Erreur de connexion au serveur.");
      setPending(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6 text-sm">
        {/* The host is what proves who asks: the client name comes from a self-asserted document. */}
        <p>
          <strong>{clientHost}</strong>
          {clientName ? ` (« ${clientName} »)` : ""} demande l{"'"}accès au serveur de publication
          sociale de Poligraph.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>créer, lister et rejeter des brouillons de posts ;</li>
          <li>publier sur les comptes X et Bluesky de Poligraph ;</li>
          <li>tester les identifiants des deux comptes.</li>
        </ul>
        <p className="text-muted-foreground">
          Après accord, le navigateur repart vers <strong>{redirectHost}</strong>.
        </p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button onClick={() => submit("approve")} disabled={pending !== null}>
            {pending === "approve" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Autoriser
          </Button>
          <Button variant="outline" onClick={() => submit("deny")} disabled={pending !== null}>
            Refuser
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
