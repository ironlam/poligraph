/**
 * Public identifier (poligraphId) entity types and their prefix conventions.
 *
 * Format grammar: `<PREFIX>-<SEQUENCE>` where PREFIX is two uppercase letters
 * and SEQUENCE is a zero-padded integer of 6+ digits. Sequences are allocated
 * per-entity-type via PostgreSQL sequences so concurrent writes never collide.
 *
 * Never reuse a retired identifier: when entities merge, write a row to
 * PublicIdRedirect instead so external citations keep resolving.
 */

export type PublicIdEntityType =
  | "politician"
  | "affair"
  | "factcheck"
  | "scrutin"
  | "party"
  | "election"
  | "mandate"
  | "dossier"
  | "group"
  | "electoralList";

export type PublicIdPrefix =
  | "PG" // Politicien
  | "AF" // Affaire judiciaire
  | "FC" // Fact-check
  | "SC" // Scrutin parlementaire
  | "PT" // Parti politique
  | "EL" // Élection
  | "MA" // Mandat
  | "DO" // Dossier législatif
  | "GP" // Groupe parlementaire
  | "LM"; // Liste municipale

export interface PublicIdMapping {
  entityType: PublicIdEntityType;
  prefix: PublicIdPrefix;
  sequenceName: string;
  frenchLabel: string;
}

export const PUBLIC_ID_ENTITIES: Record<PublicIdEntityType, PublicIdMapping> = {
  politician: {
    entityType: "politician",
    prefix: "PG",
    sequenceName: "poligraph_politician_seq",
    frenchLabel: "Politicien",
  },
  affair: {
    entityType: "affair",
    prefix: "AF",
    sequenceName: "poligraph_affair_seq",
    frenchLabel: "Affaire judiciaire",
  },
  factcheck: {
    entityType: "factcheck",
    prefix: "FC",
    sequenceName: "poligraph_factcheck_seq",
    frenchLabel: "Fact-check",
  },
  scrutin: {
    entityType: "scrutin",
    prefix: "SC",
    sequenceName: "poligraph_scrutin_seq",
    frenchLabel: "Scrutin parlementaire",
  },
  party: {
    entityType: "party",
    prefix: "PT",
    sequenceName: "poligraph_party_seq",
    frenchLabel: "Parti politique",
  },
  election: {
    entityType: "election",
    prefix: "EL",
    sequenceName: "poligraph_election_seq",
    frenchLabel: "Élection",
  },
  mandate: {
    entityType: "mandate",
    prefix: "MA",
    sequenceName: "poligraph_mandate_seq",
    frenchLabel: "Mandat",
  },
  dossier: {
    entityType: "dossier",
    prefix: "DO",
    sequenceName: "poligraph_dossier_seq",
    frenchLabel: "Dossier législatif",
  },
  group: {
    entityType: "group",
    prefix: "GP",
    sequenceName: "poligraph_group_seq",
    frenchLabel: "Groupe parlementaire",
  },
  electoralList: {
    entityType: "electoralList",
    prefix: "LM",
    sequenceName: "poligraph_electoral_list_seq",
    frenchLabel: "Liste municipale",
  },
};

/** Reverse lookup: prefix → entity type. Built once at module load. */
export const PREFIX_TO_ENTITY: Record<PublicIdPrefix, PublicIdEntityType> = Object.fromEntries(
  Object.values(PUBLIC_ID_ENTITIES).map((e) => [e.prefix, e.entityType])
) as Record<PublicIdPrefix, PublicIdEntityType>;
