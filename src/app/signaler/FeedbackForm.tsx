"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  type FeedbackCategoryKey,
} from "@/config/feedback";

type Status = "idle" | "sending" | "sent" | "error";

export function FeedbackForm({ pagePath }: { pagePath: string | null }) {
  const [category, setCategory] = useState<FeedbackCategoryKey | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const confirmationRef = useRef<HTMLDivElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message, pagePath, contactEmail: email, website }),
      });
      if (response.status === 429) {
        throw new Error(
          "Vous avez envoyé plusieurs messages à la suite. Réessayez dans une heure."
        );
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          response.status === 400
            ? "Vérifiez les champs, le message ou l'adresse e-mail semble invalide."
            : (body?.error ?? "L'envoi a échoué. Réessayez dans quelques minutes.")
        );
      }
      setStatus("sent");
      // Le formulaire disparaît : le focus passe à la confirmation pour qu'un lecteur d'écran l'annonce.
      requestAnimationFrame(() => confirmationRef.current?.focus());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "L'envoi a échoué. Réessayez dans quelques minutes."
      );
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div
        ref={confirmationRef}
        tabIndex={-1}
        role="status"
        className="rounded-lg border bg-card p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <h2 className="mb-2 title-card">Merci, votre message est bien reçu</h2>
        <p className="text-muted-foreground">
          L&apos;équipe le lira.{" "}
          {email ? "Si une réponse est utile, elle vous sera envoyée par e-mail." : ""}
        </p>
      </div>
    );
  }

  const remaining = FEEDBACK_MESSAGE_MAX - message.length;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {pagePath && (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Page concernée : <code className="break-all text-foreground">{pagePath}</code>
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">De quoi s&apos;agit-il ?</legend>
        {FEEDBACK_CATEGORIES.map((key) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="category"
              value={key}
              required
              checked={category === key}
              onChange={() => setCategory(key)}
              className="size-4 accent-[var(--primary)]"
            />
            {FEEDBACK_CATEGORY_LABELS[key]}
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="feedback-message">Votre message</Label>
        <Textarea
          id="feedback-message"
          name="message"
          required
          minLength={FEEDBACK_MESSAGE_MIN}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby="feedback-message-help"
        />
        <p id="feedback-message-help" className="text-sm text-muted-foreground">
          Dites ce qui est faux et, si possible, où se trouve la bonne information. Évitez les
          données personnelles inutiles. {remaining} caractères restants.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-email">Adresse e-mail (facultatif)</Label>
        <Input
          id="feedback-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          className="h-11"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="feedback-email-help"
        />
        <p id="feedback-email-help" className="text-sm text-muted-foreground">
          Uniquement pour vous répondre si c&apos;est nécessaire. Elle est effacée dès que votre
          message est traité.
        </p>
      </div>

      {/* Champ piège : hors écran et hors navigation, un robot le remplit, une personne non. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Ne pas remplir
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {status === "error" && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="min-h-11" disabled={status === "sending"}>
        {status === "sending" ? "Envoi en cours…" : "Envoyer"}
      </Button>
    </form>
  );
}
