import { db } from "@/lib/db";
import { findDepartmentCode } from "@/config/departments";
import { DEPARTMENTS } from "@/config/departments";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import { extractTemporalModifiers, DOSSIER_STATUS_LABELS, formatCurrency } from "./helpers";

/**
 * Thematic keyword groups for expanding search terms.
 * When a user query touches a theme, related keywords are used to search dossiers/votes.
 */
const THEME_KEYWORDS: Record<string, string[]> = {
  agriculture: [
    "agricole",
    "agriculteur",
    "paysan",
    "ferme",
    "exploitation",
    "pac",
    "élevage",
    "culture",
  ],
  santé: ["santé", "hôpital", "médecin", "soin", "maladie", "sécu", "médical", "pandémie"],
  éducation: [
    "éducation",
    "école",
    "enseignant",
    "professeur",
    "étudiant",
    "université",
    "scolaire",
    "formation",
  ],
  environnement: [
    "environnement",
    "écologie",
    "climat",
    "carbone",
    "énergie",
    "pollution",
    "vert",
    "biodiversité",
  ],
  économie: [
    "économie",
    "entreprise",
    "emploi",
    "travail",
    "chômage",
    "salaire",
    "fiscal",
    "croissance",
  ],
  retraite: ["retraite", "pension", "âge", "cotisation", "réforme"],
  logement: ["logement", "loyer", "locataire", "propriétaire", "hlm", "immobilier", "logis"],
  sécurité: ["sécurité", "police", "gendarmerie", "délinquance", "criminalité", "terrorisme"],
  immigration: ["immigration", "migrant", "asile", "frontière", "étranger", "nationalité"],
  transport: ["transport", "train", "sncf", "route", "autoroute", "mobilité", "vélo", "métro"],
  numérique: [
    "numérique",
    "internet",
    "données",
    "intelligence artificielle",
    "ia",
    "cyber",
    "tech",
  ],
  défense: ["défense", "armée", "militaire", "otan", "soldat", "guerre"],
  international: ["international", "diplomatie", "europe", "onu", "traité", "coopération"],
  culture: ["culture", "art", "patrimoine culturel", "musée", "cinéma", "livre", "spectacle"],
  justice: ["justice", "tribunal", "magistrat", "prison", "peine", "droit", "judiciaire"],
  outremer: [
    "outre-mer",
    "dom-tom",
    "guadeloupe",
    "martinique",
    "réunion",
    "guyane",
    "mayotte",
    "polynésie",
    "calédonie",
  ],
  collectivités: [
    "collectivité",
    "commune",
    "mairie",
    "région",
    "département",
    "décentralisation",
    "maire",
  ],
  démocratie: [
    "démocratie",
    "référendum",
    "citoyen",
    "participation",
    "représentation",
    "élection",
    "suffrage",
  ],
  social: ["social", "solidarité", "pauvreté", "minima sociaux", "rsa", "allocation", "handicap"],
  fiscalité: ["fiscalité", "impôt", "taxe", "tva", "isf", "dette", "budget", "dépense publique"],
  europe: [
    "europe",
    "union européenne",
    "bruxelles",
    "directive",
    "eurodéputé",
    "parlement européen",
  ],
};

/**
 * Search the database by keywords when RAG embeddings return nothing.
 * This is the fallback search layer: politician names, parties, dossiers, votes, HATVP, press, geography, stats.
 */
export async function searchDatabaseByKeywords(query: string): Promise<string | null> {
  const lowerQuery = query.toLowerCase();
  const results: string[] = [];
  const temporal = extractTemporalModifiers(query);

  // Extract words (3+ characters)
  let words = lowerQuery
    .replace(/[?!.,;:'"()]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Expand thematic keywords
  for (const [, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some((kw) => lowerQuery.includes(kw))) {
      words = [...new Set([...words, ...keywords.slice(0, 4)])];
      break;
    }
  }

  // ─── Search politicians by name ───────────────────────────────
  if (words.length > 0) {
    const politicians = await db.politician.findMany({
      where: {
        ...PUBLIC_POLITICIAN_WHERE,
        OR: words.map((word) => ({
          OR: [
            { fullName: { contains: word, mode: "insensitive" as const } },
            { lastName: { contains: word, mode: "insensitive" as const } },
          ],
        })),
      },
      include: {
        currentParty: true,
        mandates: { where: { isCurrent: true }, take: 2 },
      },
      take: 3,
    });

    for (const p of politicians) {
      let info = `**${p.civility || ""} ${p.fullName}**`;
      if (p.currentParty) info += ` (${p.currentParty.shortName || p.currentParty.name})`;
      if (p.mandates.length > 0) {
        info += ` — ${p.mandates[0]!.title}`;
      }
      info += `\n→ /politiques/${p.slug}`;
      results.push(info);
    }
  }

  // ─── Search parties ───────────────────────────────────────────
  if (
    lowerQuery.includes("parti") ||
    lowerQuery.includes("groupe") ||
    lowerQuery.includes("politique")
  ) {
    const parties = await db.party.findMany({
      where: {
        ...PUBLIC_PARTY_WHERE,
        OR: words.map((word) => ({
          OR: [
            { name: { contains: word, mode: "insensitive" as const } },
            { shortName: { contains: word, mode: "insensitive" as const } },
          ],
        })),
      },
      include: {
        _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
      },
      take: 3,
    });

    for (const party of parties) {
      results.push(
        `**${party.name}** (${party.shortName || ""}) — ${party._count.politicians} membre(s)${party.slug ? `\n→ /partis/${party.slug}` : ""}`
      );
    }
  }

  // ─── Search dossiers / votes by theme ─────────────────────────
  const isThematicQuery = Object.values(THEME_KEYWORDS).some((keywords) =>
    keywords.some((kw) => lowerQuery.includes(kw))
  );
  const isVoteQuery =
    lowerQuery.includes("vote") || lowerQuery.includes("scrutin") || lowerQuery.includes("loi");

  if (isThematicQuery || isVoteQuery) {
    const searchTerms = words.filter((w) => w.length > 3);
    if (searchTerms.length > 0) {
      // Dossiers
      const dossierWhere: Record<string, unknown> = {
        OR: searchTerms.map((term) => ({
          OR: [
            { title: { contains: term, mode: "insensitive" as const } },
            { shortTitle: { contains: term, mode: "insensitive" as const } },
            { category: { contains: term, mode: "insensitive" as const } },
          ],
        })),
      };

      // Add temporal filter
      if (temporal?.since) {
        dossierWhere.filingDate = { gte: temporal.since };
      } else if (temporal?.year) {
        dossierWhere.filingDate = {
          gte: new Date(temporal.year, 0, 1),
          lt: new Date(temporal.year + 1, 0, 1),
        };
      }

      const dossiers = await db.legislativeDossier.findMany({
        where: dossierWhere,
        orderBy: { filingDate: "desc" },
        take: 3,
      });

      for (const d of dossiers) {
        const status = DOSSIER_STATUS_LABELS[d.status] || d.status;
        const dossierLink = d.slug || d.id;
        results.push(
          `**${d.shortTitle || d.title.slice(0, 80)}**\n` +
            `Statut : ${status}` +
            (d.category ? ` | Catégorie : ${d.category}` : "") +
            (d.filingDate ? `\nDate : ${d.filingDate.toLocaleDateString("fr-FR")}` : "") +
            `\n→ /parlement/dossiers/${dossierLink}`
        );
      }

      // Votes
      const scrutinWhere: Record<string, unknown> = {
        OR: searchTerms.map((term) => ({
          title: { contains: term, mode: "insensitive" as const },
        })),
      };

      if (temporal?.since) {
        scrutinWhere.votingDate = { gte: temporal.since };
      } else if (temporal?.year) {
        scrutinWhere.votingDate = {
          gte: new Date(temporal.year, 0, 1),
          lt: new Date(temporal.year + 1, 0, 1),
        };
      }

      const scrutins = await db.scrutin.findMany({
        where: scrutinWhere,
        orderBy: { votingDate: "desc" },
        take: 3,
      });

      for (const s of scrutins) {
        const adopted = s.result === "ADOPTED" ? "Adopté" : "Rejeté";
        const scrutinLink = s.slug || s.id;
        results.push(
          `**Vote : ${s.title.slice(0, 100)}${s.title.length > 100 ? "…" : ""}**\n` +
            `Date : ${s.votingDate.toLocaleDateString("fr-FR")} — ${adopted}\n` +
            `Pour : ${s.votesFor}, Contre : ${s.votesAgainst}, Abstention : ${s.votesAbstain}\n` +
            `→ /parlement/votes/${scrutinLink}`
        );
      }
    }
  }

  // ─── HATVP / patrimony ────────────────────────────────────────
  if (
    lowerQuery.includes("patrimoine") ||
    lowerQuery.includes("déclaration") ||
    lowerQuery.includes("fortune") ||
    lowerQuery.includes("plus riche") ||
    lowerQuery.includes("hatvp")
  ) {
    const declarations = await db.declaration.findMany({
      where: {
        totalNet: { not: null },
        politician: PUBLIC_POLITICIAN_WHERE,
      },
      orderBy: { totalNet: "desc" },
      include: {
        politician: { select: { fullName: true, slug: true } },
      },
      take: 5,
    });

    if (declarations.length > 0) {
      let hatvpResult = `**Déclarations de patrimoine les plus élevées :**\n`;
      for (const d of declarations) {
        hatvpResult += `• ${d.politician.fullName} : ${d.totalNet ? formatCurrency(Number(d.totalNet)) : "Non communiqué"}\n`;
        hatvpResult += `  → /politiques/${d.politician.slug}\n`;
      }
      results.push(hatvpResult);
    }
  }

  // ─── Press articles ───────────────────────────────────────────
  if (
    lowerQuery.includes("presse") ||
    lowerQuery.includes("actualité") ||
    lowerQuery.includes("article") ||
    lowerQuery.includes("journal") ||
    lowerQuery.includes("médias")
  ) {
    const pressWhere: Record<string, unknown> = {};
    if (temporal?.since) {
      pressWhere.publishedAt = { gte: temporal.since };
    }

    const articles = await db.pressArticle.findMany({
      where: pressWhere,
      orderBy: { publishedAt: "desc" },
      take: 3,
    });

    if (articles.length > 0) {
      let pressResult = `**Articles de presse récents :**\n`;
      for (const a of articles) {
        pressResult += `• **${a.title}** — ${a.feedSource} (${a.publishedAt.toLocaleDateString("fr-FR")})\n`;
        if (a.url) pressResult += `  → ${a.url}\n`;
      }
      pressResult += `→ Revue de presse : /presse`;
      results.push(pressResult);
    }
  }

  // ─── Geographic queries ───────────────────────────────────────
  if (
    lowerQuery.includes("département") ||
    lowerQuery.includes("région") ||
    lowerQuery.includes("élus de") ||
    lowerQuery.includes("élus du") ||
    lowerQuery.includes("élus des")
  ) {
    // Try to find department from query
    for (const word of words) {
      const code = findDepartmentCode(word);
      if (code) {
        const dept = DEPARTMENTS[code];
        const mandateCount = await db.mandate.count({
          where: {
            departmentCode: code,
            isCurrent: true,
            type: { in: ["DEPUTE", "SENATEUR"] },
            politician: PUBLIC_POLITICIAN_WHERE,
          },
        });
        results.push(
          `**${dept?.name || code}** (${code}) : ${mandateCount} élu(s) en exercice\n→ Carte des élus : /carte`
        );
        break;
      }
    }
  }

  // ─── Statistics questions ─────────────────────────────────────
  if (
    lowerQuery.includes("combien") ||
    lowerQuery.includes("nombre") ||
    lowerQuery.includes("statistique") ||
    lowerQuery.includes("chiffre") ||
    lowerQuery.includes("total")
  ) {
    const [
      deputeCount,
      senateurCount,
      mepCount,
      ministerCount,
      partyCount,
      affairCount,
      dossierCount,
      voteCount,
      declCount,
    ] = await Promise.all([
      db.mandate.count({
        where: { type: "DEPUTE", isCurrent: true, politician: PUBLIC_POLITICIAN_WHERE },
      }),
      db.mandate.count({
        where: { type: "SENATEUR", isCurrent: true, politician: PUBLIC_POLITICIAN_WHERE },
      }),
      db.mandate.count({
        where: {
          type: "DEPUTE_EUROPEEN",
          isCurrent: true,
          politician: PUBLIC_POLITICIAN_WHERE,
        },
      }),
      db.mandate.count({
        where: {
          type: { in: ["MINISTRE", "MINISTRE_DELEGUE", "SECRETAIRE_ETAT", "PREMIER_MINISTRE"] },
          isCurrent: true,
          politician: PUBLIC_POLITICIAN_WHERE,
        },
      }),
      db.party.count({ where: PUBLIC_PARTY_WHERE }),
      db.affair.count({
        where: {
          ...getPublishedAffairWhere(),
          politician: PUBLIC_POLITICIAN_WHERE,
        },
      }),
      db.legislativeDossier.count(),
      db.scrutin.count(),
      db.declaration.count({ where: { politician: PUBLIC_POLITICIAN_WHERE } }),
    ]);

    results.push(
      `**Statistiques de Poligraph :**\n` +
        `• ${deputeCount} députés en exercice (577 sièges)\n` +
        `• ${senateurCount} sénateurs en exercice (348 sièges)\n` +
        `• ${mepCount} eurodéputés français (81 sièges)\n` +
        `• ${ministerCount} membres du gouvernement\n` +
        `• ${partyCount} partis politiques référencés\n` +
        `• ${affairCount} affaires judiciaires référencées\n` +
        `• ${dossierCount} dossiers législatifs\n` +
        `• ${voteCount} scrutins enregistrés\n` +
        `• ${declCount} déclarations HATVP\n\n` +
        `→ Statistiques détaillées : /statistiques\n` +
        `→ Carte des élus : /carte`
    );
  }

  // ─── Institution questions ────────────────────────────────────
  if (
    lowerQuery.includes("assemblée") ||
    lowerQuery.includes("sénat") ||
    lowerQuery.includes("gouvernement") ||
    lowerQuery.includes("institution")
  ) {
    results.push(
      `Pour comprendre le fonctionnement des institutions françaises :\n→ /institutions`
    );
  }

  if (results.length === 0) {
    return null;
  }

  return results.join("\n\n---\n\n");
}
