export type MeasureReaderGuideDefinition = {
  slug: string;
  label: string;
  definition: string;
  aliases: readonly string[];
  sourceUrl: string;
  sourceLabel: string;
  sourcePublisher: string;
};

/**
 * Human-reviewed starting vocabulary. Synchronisation creates DRAFT rows only: code review checks
 * the source and wording, while publication remains an explicit editorial action in the admin.
 */
export const MEASURE_READER_GUIDES: readonly MeasureReaderGuideDefinition[] = [
  {
    slug: "zones-faibles-emissions",
    label: "Zone à faibles émissions (ZFE)",
    definition:
      "Une zone à faibles émissions est un périmètre routier où la circulation des véhicules " +
      "les plus polluants est restreinte selon des règles fixées localement. Le dispositif vise " +
      "à améliorer la qualité de l’air.",
    aliases: [
      "ZFE",
      "ZFE-m",
      "zone à faibles émissions",
      "zones à faibles émissions",
      "zone à faibles émissions mobilité",
      "zones à faibles émissions mobilité",
    ],
    sourceUrl: "https://www.ecologie.gouv.fr/politiques-publiques/zones-faibles-emissions-zfe",
    sourceLabel: "Zones à faibles émissions (ZFE)",
    sourcePublisher: "Ministère de la Transition écologique",
  },
];
