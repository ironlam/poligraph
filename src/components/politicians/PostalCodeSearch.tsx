"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { ensureContrast } from "@/lib/contrast";
import { useIsMounted } from "@/hooks/useIsMounted";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeoCommune {
  nom: string;
  code: string;
  codeDepartement: string;
  population: number;
}

interface Representative {
  id: string;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  constituency?: string | null;
  party: {
    name: string;
    shortName: string;
    color: string | null;
  } | null;
}

interface SearchResult {
  deputy: Representative | null;
  senators: Representative[];
  commune: string;
  department: string;
  departmentCode: string;
  constituencyNumber: number | null;
  multipleDeputies: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function RepresentativeCard({ rep, role }: { rep: Representative; role: string }) {
  return (
    <Link href={`/politiques/${rep.slug}`} prefetch={false} className="block group">
      <Card className="transition-all duration-200 hover:shadow-lg hover:border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="transition-transform duration-200 group-hover:scale-105">
              <PoliticianAvatar
                photoUrl={rep.photoUrl}
                blobPhotoUrl={rep.blobPhotoUrl}
                fullName={rep.fullName}
                size="md"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg group-hover:text-primary transition-colors">
                {rep.fullName}
              </p>
              <p className="text-sm text-muted-foreground">
                {role}
                {rep.constituency ? ` · ${rep.constituency}` : ""}
              </p>
              {rep.party && (
                <Badge
                  variant="secondary"
                  className="mt-2"
                  title={rep.party.name}
                  style={{
                    backgroundColor: rep.party.color ? `${rep.party.color}15` : undefined,
                    color: rep.party.color ? ensureContrast(rep.party.color, "#ffffff") : undefined,
                  }}
                >
                  {rep.party.shortName}
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground group-hover:text-primary transition-colors">
              <ChevronRight />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PostalCodeSearch() {
  const mounted = useIsMounted();
  const [postalCode, setPostalCode] = useState("");
  const [communes, setCommunes] = useState<GeoCommune[]>([]);
  const [selectedCommune, setSelectedCommune] = useState<GeoCommune | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close commune picker on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setCommunes([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchRepresentatives = useCallback(
    async (params: { inseeCode?: string; lat?: number; lon?: number }) => {
      setError(null);
      setResult(null);
      setIsSearching(true);
      setCommunes([]);

      try {
        const query = params.inseeCode
          ? `inseeCode=${params.inseeCode}`
          : `lat=${params.lat}&lon=${params.lon}`;

        const response = await fetch(`/api/deputies/by-commune?${query}`);

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Erreur lors de la recherche");
        }

        const data: SearchResult = await response.json();
        setResult(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        const isFrench =
          message.startsWith("Erreur") ||
          message.startsWith("Aucun") ||
          message.startsWith("Code") ||
          message.startsWith("Commune") ||
          message.startsWith("Coordonnées");
        setError(
          isFrench ? message : "Une erreur est survenue. Vérifiez votre connexion et réessayez."
        );
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  const handlePostalCodeSearch = useCallback(async () => {
    if (!postalCode || postalCode.length !== 5) {
      setError("Veuillez entrer un code postal valide (5 chiffres)");
      return;
    }

    setError(null);
    setResult(null);
    setIsSearching(true);

    try {
      // Resolve postal code → commune(s) via geo.api.gouv.fr
      const geoResponse = await fetch(
        `https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom,code,codeDepartement,population`
      );

      if (!geoResponse.ok) {
        throw new Error("Erreur lors de la recherche géographique");
      }

      const geoCommunes: GeoCommune[] = await geoResponse.json();

      if (geoCommunes.length === 0) {
        setError("Code postal non trouvé. Vérifiez votre saisie.");
        setIsSearching(false);
        return;
      }

      if (geoCommunes.length === 1) {
        // Single commune → direct lookup
        await fetchRepresentatives({ inseeCode: geoCommunes[0]!.code });
      } else {
        // Multiple communes → show picker
        const sorted = geoCommunes.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
        setCommunes(sorted);
        setIsSearching(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const isFrench = message.startsWith("Erreur");
      setError(
        isFrench ? message : "Une erreur est survenue. Vérifiez votre connexion et réessayez."
      );
      setIsSearching(false);
    }
  }, [postalCode, fetchRepresentatives]);

  const handleCommuneSelect = useCallback(
    (commune: GeoCommune) => {
      setSelectedCommune(commune);
      setCommunes([]);
      fetchRepresentatives({ inseeCode: commune.code });
    },
    [fetchRepresentatives]
  );

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }

    setIsGeolocating(true);
    setGeoError(null);
    setError(null);
    setResult(null);
    setCommunes([]);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setIsGeolocating(false);
        await fetchRepresentatives({ lat: latitude, lon: longitude });
      },
      (geoErr) => {
        const messages: Record<number, string> = {
          1: "Vous avez refusé l'accès à votre position",
          2: "Votre position n'a pas pu être déterminée",
          3: "La demande de géolocalisation a expiré",
        };
        setGeoError(messages[geoErr.code] ?? "La géolocalisation a échoué");
        setIsGeolocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [fetchRepresentatives]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePostalCodeSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div ref={containerRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="postal-code" className="sr-only">
              Code postal
            </label>
            <input
              id="postal-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              placeholder="Ex : 75001"
              value={postalCode}
              onChange={(e) => {
                setPostalCode(e.target.value.replace(/\D/g, ""));
                setGeoError(null);
              }}
              onKeyDown={handleKeyDown}
              aria-describedby={error ? "postal-code-error" : undefined}
              className="w-full h-12 px-4 text-lg rounded-lg border border-input bg-background ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
          <button
            onClick={handlePostalCodeSearch}
            disabled={isSearching || postalCode.length !== 5}
            aria-label="Rechercher par code postal"
            className="h-12 px-6 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSearching ? (
              <>
                <Spinner className="h-4 w-4" />
                Recherche...
              </>
            ) : (
              "Rechercher"
            )}
          </button>

          {/* Geolocation button */}
          {mounted && "geolocation" in navigator && (
            <button
              type="button"
              onClick={handleGeolocate}
              disabled={isGeolocating || isSearching}
              className={cn(
                "inline-flex items-center justify-center h-12 w-12 shrink-0 rounded-lg border border-input bg-background",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
              aria-label="Utiliser ma position"
              title="Me géolocaliser"
            >
              {isGeolocating ? (
                <Spinner className="h-5 w-5" />
              ) : (
                <LocationIcon className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        {/* Commune picker dropdown */}
        {communes.length > 1 && (
          <div
            role="listbox"
            aria-label="Sélectionnez votre commune"
            className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden"
          >
            <p className="px-3 py-2 text-xs text-muted-foreground border-b">
              Plusieurs communes trouvées — sélectionnez la vôtre :
            </p>
            <ul className="py-1 max-h-64 overflow-y-auto">
              {communes.map((commune) => (
                <li key={commune.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedCommune?.code === commune.code}
                    onClick={() => handleCommuneSelect(commune)}
                    className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="font-medium">{commune.nom}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {commune.population?.toLocaleString("fr-FR")} hab.
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Geolocation error */}
      {geoError && (
        <p className="text-sm text-destructive text-center" role="alert">
          {geoError}
        </p>
      )}

      {/* Error message */}
      {error && (
        <div
          id="postal-code-error"
          role="alert"
          aria-live="assertive"
          className="p-4 bg-destructive/10 text-destructive rounded-lg text-center"
        >
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div
          className="space-y-6"
          role="region"
          aria-live="polite"
          aria-label="Résultats de recherche"
        >
          {/* Context header */}
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Résultats pour <strong>{result.commune}</strong> ({result.department})
            </p>
            {result.constituencyNumber && (
              <p className="text-xs text-muted-foreground mt-1">
                {result.constituencyNumber}
                <sup>e</sup> circonscription
              </p>
            )}
          </div>

          {/* Multiple deputies warning */}
          {result.multipleDeputies && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 rounded-lg text-sm">
              <strong>Note :</strong> Nous n{"'"}avons pas pu déterminer votre circonscription
              exacte. Votre député dépend de votre adresse précise.{" "}
              <a
                href="https://www.assemblee-nationale.fr/dyn/vos-deputes"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                Vérifiez sur le site de l{"'"}Assemblée nationale →
              </a>
            </div>
          )}

          {/* Deputy section */}
          {result.deputy && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Votre député</h2>
              <RepresentativeCard rep={result.deputy} role="Député" />
            </div>
          )}

          {!result.deputy && !result.multipleDeputies && (
            <div className="text-center p-6 text-muted-foreground bg-muted/50 rounded-lg">
              <p>Aucun député trouvé pour cette circonscription.</p>
              <p className="text-sm mt-2">Les données sont peut-être en cours de mise à jour.</p>
            </div>
          )}

          {/* Senators section */}
          {result.senators.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">
                {result.senators.length === 1 ? "Votre sénateur" : "Vos sénateurs"}
              </h2>
              <div className="grid gap-3">
                {result.senators.map((senator) => (
                  <RepresentativeCard key={senator.id} rep={senator} role="Sénateur" />
                ))}
              </div>
            </div>
          )}

          {/* No results at all */}
          {!result.deputy && result.senators.length === 0 && !result.multipleDeputies && (
            <div className="text-center p-8 text-muted-foreground">
              <p>Aucun représentant trouvé pour cette commune.</p>
              <p className="text-sm mt-2">Les données sont peut-être en cours de mise à jour.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
