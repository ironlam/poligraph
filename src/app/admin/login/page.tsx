"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";
import { safeAdminRedirect } from "@/lib/admin-redirect";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        // Read at submit time rather than through useSearchParams, which would need a Suspense
        // boundary for a page that only cares about the value once.
        router.push(safeAdminRedirect(new URLSearchParams(window.location.search).get("next")));
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || "Mot de passe incorrect");
      }
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 px-4">
      {/* Brand accent bar */}
      <div
        className="fixed top-0 left-0 right-0 h-[3px]"
        style={{
          background: "linear-gradient(90deg, var(--brand), var(--primary))",
        }}
        aria-hidden="true"
      />

      <div className="w-full max-w-sm space-y-8">
        {/* Logo + branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand text-brand-foreground shadow-sm">
            <Lock className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Poligraph</h1>
            <p className="text-sm text-muted-foreground mt-1">Espace d&apos;administration</p>
          </div>
        </div>

        {/* Login card */}
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Mot de passe
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Entrez le mot de passe admin"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  required
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? "password-error" : undefined}
                  autoFocus
                  autoComplete="current-password"
                  className={error ? "border-destructive focus-visible:ring-destructive" : ""}
                />
              </div>

              {error && (
                <div
                  id="password-error"
                  role="alert"
                  aria-live="assertive"
                  className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2"
                >
                  <span
                    className="shrink-0 w-1.5 h-1.5 rounded-full bg-destructive"
                    aria-hidden="true"
                  />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={loading || !password}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {loading ? "Connexion..." : "Se connecter"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground">
          Accès restreint — Observatoire citoyen de la vie politique
        </p>
      </div>
    </div>
  );
}
