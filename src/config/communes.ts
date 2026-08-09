/**
 * Provenance of the commune data imported by `scripts/seed-communes.ts`.
 *
 * `Commune.population` carries the INSEE population municipale, but it reaches us
 * through geo.api.gouv.fr, whose API definition (https://geo.api.gouv.fr/definition.yml)
 * describes the field without publishing its vintage. We therefore do not know
 * which year the figure is from, and printing "Population INSEE 2026" under a
 * number would be an unverifiable claim on a verification platform.
 *
 * What we do know and can prove: the source, and the date we queried it. That pair
 * is what surfaces. The seed records the import date in `SyncMetadata` under
 * `COMMUNE_DATA_SYNC_KEY`; any surface rendering a population reads that date
 * instead of announcing a vintage.
 *
 * A single import fills all ~35,000 communes in one pass, so only one vintage
 * exists at a time: provenance is global, not per row. Should several vintages
 * ever coexist, this would need a `populationYear` column instead.
 */

export const COMMUNE_DATA_SYNC_KEY = "communes-geo-api";

export const COMMUNE_POPULATION_SOURCE = {
  /** What the figure measures, as the API defines it. */
  label: "Population municipale (INSEE)",
  /** How it reaches us. Name the body, not the pipeline. */
  via: "geo.api.gouv.fr",
  url: "https://geo.api.gouv.fr/decoupage-administratif/communes",
} as const;
