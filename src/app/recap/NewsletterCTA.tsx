"use client";

import { useEffect, useState } from "react";
import { Mail, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackUmami } from "@/lib/umami";

export function NewsletterCTA() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    trackUmami("newsletter_cta_shown", { source: "RECAP_PAGE" });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !consent || status === "loading") return;

    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source: "RECAP_PAGE",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Une erreur est survenue.");
        return;
      }

      trackUmami("newsletter_email_submitted", { source: "RECAP_PAGE" });
      setStatus("success");
      setMessage(data.message);
    } catch {
      setStatus("error");
      setMessage("Impossible de contacter le serveur.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-xl border bg-primary/5 p-6 text-center">
        <CheckCircle className="mx-auto mb-2 size-8 text-green-600" />
        <p className="font-medium">{message}</p>
        <p className="text-sm text-muted-foreground mt-1">
          Vérifiez votre boîte mail (et vos spams).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-primary/5 p-6">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="size-5 text-primary" />
        <h3 className="font-semibold">Recevez ce recap chaque lundi matin</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Gratuit, sans spam. Désinscription en un clic.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          placeholder="votre@email.com"
          required
          aria-label="Adresse email pour la newsletter"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            aria-label="J'accepte de recevoir la newsletter Poligraph par email"
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            J&apos;accepte de recevoir la newsletter Poligraph par email. Je peux me désinscrire à
            tout moment.{" "}
            <a href="/confidentialite#newsletter" className="underline">
              Comment mes données sont traitées
            </a>
            .
          </span>
        </label>

        <Button
          type="submit"
          disabled={status === "loading" || !consent || !email.trim()}
          size="sm"
          className="w-full"
        >
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : "S'inscrire"}
        </Button>
      </form>
      {status === "error" && <p className="text-sm text-red-600 mt-2">{message}</p>}
    </div>
  );
}
