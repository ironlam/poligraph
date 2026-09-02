import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { HubCandidacy, HubTheme } from "@/lib/data/hub";
import { cn } from "@/lib/utils";

const COMPARISON_PATH = "/elections/presidentielle-2027/comparer";

export function HubComparisonLauncher({
  candidacies,
  themes,
}: {
  candidacies: HubCandidacy[];
  themes: HubTheme[];
}) {
  const candidateOptions = candidacies.filter((candidacy) => candidacy.measureCount > 0);
  const themeOptions = themes.filter((theme) => theme.publishable);

  if (candidateOptions.length < 2 || themeOptions.length === 0) return null;

  return (
    <section
      aria-labelledby="hub-comparison-title"
      className="rounded-2xl border border-border bg-card p-5 md:p-6"
    >
      <div className="max-w-3xl">
        <h2 id="hub-comparison-title" className="font-display text-xl font-bold md:text-2xl">
          Comparer deux candidats
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Choisissez deux candidats et un thème pour placer leurs mesures publiées côte à côte.
        </p>
      </div>
      <form
        action={COMPARISON_PATH}
        method="get"
        className="mt-5 grid items-end gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
      >
        {[0, 1].map((index) => (
          <div key={index}>
            <label htmlFor={`hub-candidate-${index}`} className="mb-1.5 block text-sm font-bold">
              Candidat {index + 1}
            </label>
            <Select
              id={`hub-candidate-${index}`}
              name="candidat"
              required
              defaultValue=""
              className="min-h-11"
            >
              <option value="">Choisir</option>
              {candidateOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.politicianSlug}>
                  {candidate.candidateName}
                  {candidate.partyLabel ? `, ${candidate.partyLabel}` : ""}
                </option>
              ))}
            </Select>
          </div>
        ))}
        <div>
          <label htmlFor="hub-comparison-theme" className="mb-1.5 block text-sm font-bold">
            Thème
          </label>
          <Select
            id="hub-comparison-theme"
            name="theme"
            required
            defaultValue=""
            className="min-h-11"
          >
            <option value="">Choisir</option>
            {themeOptions.map((theme) => (
              <option key={theme.theme} value={theme.slug}>
                {theme.label}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "default" }), "min-h-11 w-full lg:w-auto")}
        >
          Comparer
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
