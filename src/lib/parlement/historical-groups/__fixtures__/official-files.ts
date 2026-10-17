/**
 * Synthetic official files, in the shapes the Assemblée nationale really publishes (object or list,
 * `null` blocks, typed identifiers, strings for numbers). Identifiers are invented. Nothing here
 * comes from a real record.
 */
export type Json = Record<string, unknown>;

export function organeFile(
  uid: string,
  overrides: {
    codeType?: string;
    abbreviation?: string | null;
    label?: string;
    legislature?: unknown;
    start?: unknown;
    end?: unknown;
  } = {}
): Json {
  return {
    organe: {
      uid,
      codeType: overrides.codeType ?? "GP",
      libelle: overrides.label ?? "Groupe fictif",
      libelleAbrege: "abbreviation" in overrides ? overrides.abbreviation : "GF",
      viMoDe: {
        dateDebut: "start" in overrides ? overrides.start : "2022-06-28",
        dateAgrement: null,
        dateFin: "end" in overrides ? overrides.end : null,
      },
      legislature: "legislature" in overrides ? overrides.legislature : "16",
    },
  };
}

export function groupMandate(
  uid: string,
  actor: string,
  organ: unknown,
  overrides: {
    start?: unknown;
    end?: unknown;
    quality?: string;
    legislature?: unknown;
    type?: string;
  } = {}
): Json {
  return {
    uid,
    acteurRef: actor,
    legislature: "legislature" in overrides ? overrides.legislature : "16",
    typeOrgane: overrides.type ?? "GP",
    dateDebut: "start" in overrides ? overrides.start : "2022-06-29",
    dateFin: "end" in overrides ? overrides.end : null,
    nominPrincipale: "1",
    infosQualite: { codeQualite: overrides.quality ?? "Membre" },
    organes: { organeRef: organ },
  };
}

export function seatMandate(
  uid: string,
  actor: string,
  overrides: { start?: unknown; end?: unknown; legislature?: unknown } = {}
): Json {
  return {
    uid,
    acteurRef: actor,
    legislature: "legislature" in overrides ? overrides.legislature : "16",
    typeOrgane: "ASSEMBLEE",
    dateDebut: "start" in overrides ? overrides.start : "2022-06-22",
    dateFin: "end" in overrides ? overrides.end : null,
    infosQualite: { codeQualite: "membre" },
    organes: { organeRef: "PO717460" },
  };
}

/** `mandats` as the source writes it: `null`, one object, or a list. */
export function acteurFile(
  actor: string,
  mandates: unknown[] | Json | null,
  typedUid = true
): Json {
  return {
    acteur: {
      uid: typedUid ? { "@xsi:type": "IdActeur_type", "#text": actor } : actor,
      mandats: mandates === null ? null : { mandat: mandates },
    },
  };
}

export interface VotantSpec {
  actor: string;
  mandate?: string | null;
}

function block(votants: VotantSpec[] | undefined, shape: "list" | "single" = "list"): unknown {
  if (votants === undefined || votants.length === 0) return null;
  const toVotant = (v: VotantSpec) => ({
    acteurRef: v.actor,
    mandatRef: v.mandate === undefined ? "PM1" : v.mandate,
    parDelegation: "false",
    numPlace: "001",
  });
  const items = votants.map(toVotant);
  // One voter is a bare object, several are a list: the XML-to-JSON conversion does this.
  return { votant: items.length === 1 && shape === "single" ? items[0] : items };
}

export interface GroupSpec {
  organ: string;
  pour?: VotantSpec[];
  contre?: VotantSpec[];
  abstention?: VotantSpec[];
  nonVotant?: VotantSpec[];
  /** Official count of the group. Defaults to the nominal lists. */
  official?: { pour: number; contre: number; abstention: number; nonVotant: number } | null;
  singleVotantAsObject?: boolean;
}

export function groupBlock(spec: GroupSpec, singular = false): Json {
  const shape = spec.singleVotantAsObject ? "single" : "list";
  const keys = singular
    ? { pour: "pour", contre: "contre", abstention: "abstention", nonVotant: "nonVotant" }
    : { pour: "pours", contre: "contres", abstention: "abstentions", nonVotant: "nonVotants" };
  const official =
    spec.official === undefined
      ? {
          pour: spec.pour?.length ?? 0,
          contre: spec.contre?.length ?? 0,
          abstention: spec.abstention?.length ?? 0,
          nonVotant: spec.nonVotant?.length ?? 0,
        }
      : spec.official;
  return {
    organeRef: spec.organ,
    nombreMembresGroupe: "10",
    vote: {
      positionMajoritaire: "pour",
      ...(official === null
        ? {}
        : {
            decompteVoix: {
              nonVotants: String(official.nonVotant),
              pour: String(official.pour),
              contre: String(official.contre),
              abstentions: String(official.abstention),
              nonVotantsVolontaires: "0",
            },
          }),
      decompteNominatif: {
        [keys.nonVotant]: block(spec.nonVotant, shape),
        [keys.pour]: block(spec.pour, shape),
        [keys.contre]: block(spec.contre, shape),
        [keys.abstention]: block(spec.abstention, shape),
      },
    },
  };
}

export function scrutinFile(
  uid: string,
  groups: GroupSpec[] | Json,
  overrides: {
    date?: unknown;
    legislature?: unknown;
    mode?: unknown;
    synthese?: { pour: number; contre: number; abstention: number; nonVotant: number } | null;
    miseAuPoint?: unknown;
    singular?: boolean;
  } = {}
): Json {
  const specs = Array.isArray(groups) ? groups : null;
  const sum = (key: "pour" | "contre" | "abstention" | "nonVotant") =>
    (specs ?? []).reduce((total, g) => total + (g[key]?.length ?? 0), 0);
  const synthese =
    overrides.synthese === undefined
      ? {
          pour: sum("pour"),
          contre: sum("contre"),
          abstention: sum("abstention"),
          nonVotant: sum("nonVotant"),
        }
      : overrides.synthese;
  const groupBlocks = specs ? specs.map((g) => groupBlock(g, overrides.singular)) : groups;
  return {
    scrutin: {
      uid,
      numero: "1",
      organeRef: "PO838901",
      legislature: "legislature" in overrides ? overrides.legislature : "16",
      dateScrutin: "date" in overrides ? overrides.date : "2023-03-14",
      modePublicationDesVotes: "mode" in overrides ? overrides.mode : "DecompteNominatif",
      syntheseVote:
        synthese === null
          ? {}
          : {
              nombreVotants: "0",
              decompte: {
                pour: String(synthese.pour),
                contre: String(synthese.contre),
                abstentions: String(synthese.abstention),
                nonVotants: String(synthese.nonVotant),
              },
            },
      ventilationVotes: {
        organe: {
          organeRef: "PO838901",
          groupes: {
            groupe:
              Array.isArray(groupBlocks) && groupBlocks.length === 1 ? groupBlocks[0] : groupBlocks,
          },
        },
      },
      miseAuPoint: "miseAuPoint" in overrides ? overrides.miseAuPoint : null,
    },
  };
}

/** A group node of a built scrutin file, typed so that a test can damage it without `any`. */
export interface GroupNode {
  organeRef?: string;
  vote: {
    decompteVoix: Record<string, unknown>;
    decompteNominatif: Record<string, unknown> | null;
  };
}

/** The group nodes of a file built by `scrutinFile`, as live objects: editing one edits the file. */
export function groupNodes(file: Json): GroupNode[] {
  const scrutin = file["scrutin"] as {
    ventilationVotes: { organe: { groupes: { groupe: GroupNode | GroupNode[] } } };
  };
  const groupe = scrutin.ventilationVotes.organe.groupes.groupe;
  return Array.isArray(groupe) ? groupe : [groupe];
}
