import { db } from "@/lib/db";
import { findDepartmentCode } from "@/config/departments";
import { DEPARTMENTS } from "@/config/departments";
import { extractPersonName, AFFAIR_STATUS_LABELS, formatCurrency } from "./helpers";

/**
 * A pattern that matches a citizen query and returns direct context.
 */
interface QueryPattern {
  name: string;
  test: (query: string) => RegExpMatchArray | null;
  handler: (query: string, match: RegExpMatchArray) => Promise<string | null>;
}

/**
 * Ordered list of patterns. First match wins.
 */
const PATTERNS: QueryPattern[] = [
  // 1. Understand institutions
  {
    name: "institutions",
    test: (q) =>
      q.match(
        /(?:c'?est quoi|qu'?est[- ]ce que?|comment fonctionne|[àa] quoi sert|r[oô]le d[eu])\s+(?:l'?assembl[ée]e|le s[ée]nat|le parlement|le gouvernement|le pr[ée]sident|les institutions|l'?[ée]lys[ée]e|matignon)/i
      ),
    handler: async () => {
      return (
        `RÉPONSE PÉDAGOGIQUE SUR LES INSTITUTIONS :\n\n` +
        `L'Assemblée nationale (577 députés) et le Sénat (348 sénateurs) forment le Parlement.\n` +
        `Les députés sont élus au suffrage universel direct pour 5 ans ; les sénateurs au suffrage indirect pour 6 ans.\n` +
        `Le gouvernement est nommé par le Président sur proposition du Premier ministre et est responsable devant l'Assemblée.\n` +
        `Le Président est élu pour 5 ans (2 mandats consécutifs max).\n` +
        `La France dispose aussi de 81 eurodéputés au Parlement européen.\n\n` +
        `→ En savoir plus : /institutions`
      );
    },
  },

  // 2. Understand legislative process
  {
    name: "processus_legislatif",
    test: (q) =>
      q.match(
        /(?:comment (?:est vot[ée]e|se fait|se vote|fonctionne)|processus l[ée]gislatif|c'?est quoi (?:la navette|une loi|un projet de loi|une proposition de loi)|comment (?:on fait|on vote) une loi)/i
      ),
    handler: async () => {
      return (
        `RÉPONSE PÉDAGOGIQUE SUR LE PROCESSUS LÉGISLATIF :\n\n` +
        `Voici les grandes étapes du vote d'une loi en France :\n` +
        `1. Dépôt du texte (projet de loi par le gouvernement ou proposition de loi par un parlementaire)\n` +
        `2. Examen en commission parlementaire (amendements, auditions)\n` +
        `3. Débat et vote en séance publique (hémicycle)\n` +
        `4. Navette entre l'Assemblée et le Sénat (le texte fait des allers-retours)\n` +
        `5. En cas de désaccord, une commission mixte paritaire (7 députés + 7 sénateurs) tente un compromis\n` +
        `6. L'Assemblée a le dernier mot en cas de désaccord persistant\n` +
        `7. Promulgation par le Président de la République\n\n` +
        `→ Suivre les dossiers en cours : /assemblee`
      );
    },
  },

  // 3. Understand justice / legal concepts
  {
    name: "justice_pedagogie",
    test: (q) =>
      q.match(
        /(?:c'?est quoi|qu'?est[- ]ce que?|(?:ça|ca) veut dire quoi|diff[ée]rence entre)\s+(?:(?:la |une )?mise en examen|(?:la )?pr[ée]somption d'?innocence|(?:la )?relaxe|(?:l'?)?acquittement|(?:un )?non[- ]lieu|(?:la )?prescription|(?:un )?appel|(?:le )?pourvoi|condamn)/i
      ),
    handler: async () => {
      return (
        `RÉPONSE PÉDAGOGIQUE SUR LA JUSTICE :\n\n` +
        `Voici les principaux termes du parcours judiciaire :\n\n` +
        `• **Mise en examen** : une personne est soupçonnée d'un crime ou délit grave. Elle bénéficie de la présomption d'innocence.\n` +
        `• **Procès** : audience devant un tribunal où les faits sont examinés.\n` +
        `• **Relaxe** (tribunal) / **Acquittement** (cour d'assises) : la personne est déclarée non coupable.\n` +
        `• **Condamnation** : le tribunal déclare la personne coupable.\n` +
        `• **Appel** : la personne conteste le jugement devant une cour supérieure. La condamnation n'est pas définitive.\n` +
        `• **Pourvoi en cassation** : dernier recours, la Cour de cassation vérifie que la loi a été correctement appliquée.\n` +
        `• **Non-lieu** : les charges sont insuffisantes, la procédure s'arrête.\n` +
        `• **Prescription** : le délai pour poursuivre est dépassé.\n\n` +
        `⚠️ La présomption d'innocence signifie que toute personne est considérée innocente tant qu'elle n'a pas été définitivement condamnée.\n\n` +
        `→ Voir les affaires référencées : /affaires`
      );
    },
  },

  // 4. Find one's representative (by postal code or department)
  {
    name: "trouver_elu",
    test: (q) =>
      q.match(
        /(?:mon d[ée]put[ée]|qui me repr[ée]sente|d[ée]put[ée]s? (?:de |du |des |d')|[ée]lus? (?:de |du |des |d')|\b(\d{5})\b|[ée]lus? (?:dans le |en |dans l[ea] ))(.+)?/i
      ),
    handler: async (q, _match) => {
      // Try to extract postal code
      const postalMatch = q.match(/\b(\d{5})\b/);
      if (postalMatch) {
        const postal = postalMatch[1];
        const deptCode = postal!.startsWith("97") ? postal!.slice(0, 3) : postal!.slice(0, 2);
        const dept = DEPARTMENTS[deptCode];
        if (dept) {
          return await fetchElusByDepartment(deptCode, dept.name);
        }
      }

      // Try to extract department name
      const deptNameMatch = q.match(
        /(?:d[ée]put[ée]s?|[ée]lus?|s[ée]nateurs?)\s+(?:de |du |des |d'|en |dans (?:le |la |l')?)([a-zA-ZÀ-ÿ\s'-]+)/i
      );
      if (deptNameMatch) {
        const deptName = deptNameMatch[1]!.trim();
        const code = findDepartmentCode(deptName);
        if (code) {
          const dept = DEPARTMENTS[code];
          return await fetchElusByDepartment(code, dept?.name || deptName);
        }
      }

      // Generic "mon député" without location
      return (
        `Pour trouver votre député ou sénateur, vous pouvez :\n` +
        `• Chercher par nom sur /politiques\n` +
        `• Explorer la carte des élus par département sur /carte\n\n` +
        `→ Carte des élus : /carte\n` +
        `→ Liste des élus : /politiques`
      );
    },
  },

  // 5. Politician profile (who is X)
  {
    name: "fiche_politicien",
    test: (q) =>
      q.match(
        /(?:qui est|informations? sur|fiche (?:de |d')|parle[z-]?\s*moi (?:de |d')|pr[ée]sente[z-]?\s*moi|(?:tu |vous )(?:connais|connaissez))\s+(.+)/i
      ),
    handler: async (_q, match) => {
      const searchName = extractPersonName(match[1]!);
      return await fetchPoliticianProfile(searchName);
    },
  },

  // 6. Affairs of a politician
  {
    name: "affaires_politicien",
    test: (q) =>
      q.match(
        /(?:affaires?|condamn[ée]|mis(?:e)? en examen|casier|jug[ée]|poursuivi|inculp[ée])\s+(?:de |d'|contre |concernant |judiciaires? (?:de |d'))?(.+)|(.+?)(?:\s+(?:a[- ]?t[- ]?il|a[- ]?t[- ]?elle|a [ée]t[ée]|est[- ]il|est[- ]elle)\s+(?:condamn[ée]|mis(?:e)? en examen|jug[ée]|poursuivi))/i
      ),
    handler: async (_q, match) => {
      const rawName = match[1] || match[2];
      if (!rawName) return null;
      const searchName = extractPersonName(rawName);
      return await fetchPoliticianAffairs(searchName);
    },
  },

  // 7. Report / missing information
  {
    name: "signaler",
    test: (q) =>
      q.match(
        /(?:signaler|corriger|il manque|erreur|information (?:manquante|incorrecte|fausse)|pourquoi.+(?:pas d'affaire|pas r[ée]f[ée]renc[ée]|n'appara[iî]t pas))/i
      ),
    handler: async () => {
      return (
        `Si vous souhaitez signaler une information manquante, incorrecte ou si vous disposez de sources fiables sur un sujet non couvert, vous pouvez nous contacter via la page mentions légales.\n\n` +
        `Notre équipe vérifie systématiquement toute information avant publication pour garantir la fiabilité des données.\n\n` +
        `→ Page de contact : /mentions-legales`
      );
    },
  },

  // 8. Patrimony / HATVP declarations
  {
    name: "patrimoine",
    test: (q) =>
      q.match(
        /(?:patrimoine|d[ée]claration(?:s)?\s+(?:hatvp|de patrimoine|d'int[ée]r[eê]ts?)|que d[ée]clare|combien (?:gagne|poss[èe]de|a d[ée]clar[ée])|fortune|plus riche|hatvp)\s*(?:de |d')?(.+)?/i
      ),
    handler: async (_q, match) => {
      const rawName = match[1];
      if (rawName) {
        const searchName = extractPersonName(rawName);
        return await fetchPoliticianHATVP(searchName);
      }
      // Generic HATVP question
      return (
        `Les déclarations de patrimoine et d'intérêts des élus sont publiées par la Haute Autorité pour la Transparence de la Vie Publique (HATVP).\n\n` +
        `Sur Poligraph, vous pouvez consulter ces déclarations sur la fiche de chaque élu qui en dispose.\n\n` +
        `→ Chercher un élu : /politiques`
      );
    },
  },

  // 9. Votes of a politician
  {
    name: "votes_politicien",
    test: (q) =>
      q.match(
        /(?:comment a vot[ée]|votes? (?:de |d')|a[- ]?t[- ]?il vot[ée]|a[- ]?t[- ]?elle vot[ée])\s+(.+)/i
      ),
    handler: async (_q, match) => {
      const raw = match[1];
      // Try to separate name from topic: "Mélenchon sur la retraite"
      const nameTopicMatch = raw!.match(/^(.+?)\s+(?:sur|pour|contre)\s+(.+)/i);
      if (nameTopicMatch) {
        const name = extractPersonName(nameTopicMatch[1]!);
        const topic = nameTopicMatch[2]!.trim();
        return await fetchPoliticianVotes(name, topic);
      }
      const name = extractPersonName(raw!);
      return await fetchPoliticianVotes(name, null);
    },
  },

  // 10. Compare two politicians
  {
    name: "comparer",
    test: (q) =>
      q.match(
        /(?:compar(?:er|aison)|diff[ée]rence(?:s)? entre)\s+(.+?)\s+(?:et|vs|versus|avec)\s+(.+)/i
      ),
    handler: async (_q, match) => {
      const name1 = extractPersonName(match[1]!);
      const name2 = extractPersonName(match[2]!);

      const [p1, p2] = await Promise.all([
        db.politician.findFirst({
          where: {
            OR: [
              { fullName: { contains: name1, mode: "insensitive" } },
              { lastName: { contains: name1, mode: "insensitive" } },
            ],
          },
          select: { fullName: true, slug: true },
        }),
        db.politician.findFirst({
          where: {
            OR: [
              { fullName: { contains: name2, mode: "insensitive" } },
              { lastName: { contains: name2, mode: "insensitive" } },
            ],
          },
          select: { fullName: true, slug: true },
        }),
      ]);

      if (p1 && p2) {
        return (
          `Pour comparer **${p1.fullName}** et **${p2.fullName}**, utilisez notre outil de comparaison qui met en regard leurs mandats, votes, affaires et déclarations de patrimoine.\n\n` +
          `→ Comparer : /comparer?a=${p1.slug}&b=${p2.slug}\n` +
          `→ Fiche de ${p1.fullName} : /politiques/${p1.slug}\n` +
          `→ Fiche de ${p2.fullName} : /politiques/${p2.slug}`
        );
      }

      const notFound = !p1 ? name1 : name2;
      return `Je n'ai pas trouvé "${notFound}" parmi nos représentants référencés.\n\n→ Chercher un élu : /politiques`;
    },
  },

  // 11. Party members
  {
    name: "membres_parti",
    test: (q) =>
      q.match(
        /(?:membres?|d[ée]put[ée]s?|s[ée]nateurs?|[ée]lus?|qui est)\s+(?:du |de |des |au |à |chez (?:le |la )?)?(?:parti )?(RN|LFI|PS|LR|EELV|RE|Renaissance|Rassemblement National|France Insoumise|R[ée]publicains|Parti Socialiste|Écologistes?|Modem|MoDem|PCF|Horizons|UDI|LIOT|Nouveau Front Populaire|NFP)\b/i
      ),
    handler: async (_q, match) => {
      const partySearch = match[1];
      return await fetchPartyMembers(partySearch!);
    },
  },

  // 12. Government
  {
    name: "gouvernement",
    test: (q) =>
      q.match(
        /(?:ministre(?:s)?|composition du gouvernement|qui est au gouvernement|gouvernement actuel|premier ministre|ministre (?:de |du |des |d'))/i
      ),
    handler: async () => {
      const ministers = await db.mandate.findMany({
        where: {
          isCurrent: true,
          type: {
            in: ["PREMIER_MINISTRE", "MINISTRE", "MINISTRE_DELEGUE", "SECRETAIRE_ETAT"],
          },
        },
        include: {
          politician: {
            select: { fullName: true, slug: true, civility: true },
          },
        },
        orderBy: { type: "asc" },
      });

      if (ministers.length === 0) {
        return `Je n'ai pas trouvé de membres du gouvernement actuellement en exercice.\n\n→ /politiques`;
      }

      let result = `**Gouvernement actuel** (${ministers.length} membres) :\n\n`;
      for (const m of ministers) {
        result += `• **${m.politician.fullName}** — ${m.title}\n`;
        result += `  → /politiques/${m.politician.slug}\n`;
      }
      result += `\n→ Tous les élus : /politiques`;
      return result;
    },
  },

  // 13. Follow legislation
  {
    name: "legislation",
    test: (q) =>
      q.match(
        /(?:projets? de loi|dossiers? l[ée]gislatifs?|(?:lois?|textes?) en (?:cours|discussion)|derniers? dossiers?|loi sur|dossier sur)\s*(.+)?/i
      ),
    handler: async (_q, match) => {
      const topic = match[1]?.trim();

      const where: Record<string, unknown> = {
        status: { in: ["DEPOSE", "EN_COMMISSION", "EN_COURS", "CONSEIL_CONSTITUTIONNEL"] },
      };
      if (topic && topic.length > 2) {
        where.OR = [
          { title: { contains: topic, mode: "insensitive" } },
          { shortTitle: { contains: topic, mode: "insensitive" } },
          { category: { contains: topic, mode: "insensitive" } },
        ];
      }

      const dossiers = await db.legislativeDossier.findMany({
        where,
        orderBy: { filingDate: "desc" },
        take: 5,
      });

      if (dossiers.length === 0) {
        const fallback = topic
          ? `Aucun dossier en cours trouvé sur le thème "${topic}".`
          : `Aucun dossier législatif en cours trouvé.`;
        return `${fallback}\n\n→ Explorer tous les dossiers : /assemblee`;
      }

      let result = topic
        ? `**Dossiers en cours sur "${topic}" :**\n\n`
        : `**Dossiers législatifs récents en cours :**\n\n`;

      for (const d of dossiers) {
        const title = d.shortTitle || d.title.slice(0, 100);
        const link = d.slug || d.id;
        result += `• **${title}**\n`;
        if (d.category) result += `  Catégorie : ${d.category}\n`;
        if (d.filingDate) result += `  Date : ${d.filingDate.toLocaleDateString("fr-FR")}\n`;
        result += `  → /parlement/dossiers/${link}\n`;
      }
      result += `\n→ Tous les dossiers : /parlement/dossiers`;
      return result;
    },
  },

  // 14. Recent votes
  {
    name: "votes_recents",
    test: (q) =>
      q.match(
        /(?:derniers? votes?|derniers? scrutins?|qu'?a[- ]?t[- ]?on vot[ée]|scrutins? r[ée]cents?|votes? r[ée]cents?)/i
      ),
    handler: async () => {
      const scrutins = await db.scrutin.findMany({
        orderBy: { votingDate: "desc" },
        take: 5,
      });

      if (scrutins.length === 0) {
        return `Aucun scrutin trouvé.\n\n→ /votes`;
      }

      let result = `**Derniers scrutins :**\n\n`;
      for (const s of scrutins) {
        const adopted = s.result === "ADOPTED" ? "✅ Adopté" : "❌ Rejeté";
        const link = s.slug || s.id;
        const title = s.title.length > 100 ? s.title.slice(0, 100) + "…" : s.title;
        result += `• **${title}**\n`;
        result += `  ${s.votingDate.toLocaleDateString("fr-FR")} — ${adopted}\n`;
        result += `  Pour : ${s.votesFor} | Contre : ${s.votesAgainst} | Abstention : ${s.votesAbstain}\n`;
        result += `  → /parlement/votes/${link}\n`;
      }
      result += `\n→ Tous les scrutins : /parlement/votes`;
      return result;
    },
  },

  // 15. Press / news
  {
    name: "presse",
    test: (q) =>
      q.match(
        /(?:actualit[ée]s?|presse|articles?|dans les m[ée]dias|dans la presse|journal|revue de presse)\s*(?:sur |de |d'|concernant )?(.+)?/i
      ),
    handler: async (_q, match) => {
      const topic = match[1]?.trim();

      if (topic) {
        // Search press articles mentioning a politician or topic
        const articles = await db.pressArticle.findMany({
          where: {
            OR: [
              { title: { contains: topic, mode: "insensitive" } },
              { description: { contains: topic, mode: "insensitive" } },
            ],
          },
          orderBy: { publishedAt: "desc" },
          take: 5,
        });

        if (articles.length > 0) {
          let result = `**Articles récents sur "${topic}" :**\n\n`;
          for (const a of articles) {
            result += `• **${a.title}**\n`;
            result += `  ${a.feedSource} — ${a.publishedAt.toLocaleDateString("fr-FR")}\n`;
            if (a.url) result += `  → ${a.url}\n`;
          }
          result += `\n→ Revue de presse complète : /presse`;
          return result;
        }
      }

      // Generic press query
      const articles = await db.pressArticle.findMany({
        orderBy: { publishedAt: "desc" },
        take: 5,
      });

      if (articles.length === 0) {
        return `Aucun article de presse récent trouvé.\n\n→ /presse`;
      }

      let result = `**Derniers articles de presse :**\n\n`;
      for (const a of articles) {
        result += `• **${a.title}**\n`;
        result += `  ${a.feedSource} — ${a.publishedAt.toLocaleDateString("fr-FR")}\n`;
        if (a.url) result += `  → ${a.url}\n`;
      }
      result += `\n→ Revue de presse : /presse`;
      return result;
    },
  },
];

// ─── Database helpers for patterns ──────────────────────────────

async function fetchElusByDepartment(code: string, name: string): Promise<string> {
  const mandates = await db.mandate.findMany({
    where: {
      departmentCode: code,
      isCurrent: true,
      type: { in: ["DEPUTE", "SENATEUR"] },
    },
    include: {
      politician: {
        select: { fullName: true, slug: true, civility: true },
        include: { currentParty: { select: { shortName: true } } },
      },
    },
    orderBy: { type: "asc" },
  });

  if (mandates.length === 0) {
    return (
      `Aucun élu trouvé pour le département ${name} (${code}).\n\n` +
      `→ Carte des élus : /carte\n` +
      `→ Liste des élus : /politiques`
    );
  }

  const deputes = mandates.filter((m) => m.type === "DEPUTE");
  const senateurs = mandates.filter((m) => m.type === "SENATEUR");

  let result = `**Élus du département ${name} (${code}) :**\n\n`;

  if (deputes.length > 0) {
    result += `**Députés (${deputes.length}) :**\n`;
    for (const m of deputes) {
      const party = m.politician.currentParty?.shortName || "";
      result += `• ${m.politician.fullName}${party ? ` (${party})` : ""} — ${m.title}\n`;
      result += `  → /politiques/${m.politician.slug}\n`;
    }
    result += `\n`;
  }

  if (senateurs.length > 0) {
    result += `**Sénateurs (${senateurs.length}) :**\n`;
    for (const m of senateurs) {
      const party = m.politician.currentParty?.shortName || "";
      result += `• ${m.politician.fullName}${party ? ` (${party})` : ""} — ${m.title}\n`;
      result += `  → /politiques/${m.politician.slug}\n`;
    }
  }

  result += `\n→ Carte des élus : /carte`;
  return result;
}

async function fetchPoliticianProfile(searchName: string): Promise<string | null> {
  const politician = await db.politician.findFirst({
    where: {
      OR: [
        { fullName: { contains: searchName, mode: "insensitive" } },
        { lastName: { contains: searchName, mode: "insensitive" } },
      ],
    },
    include: {
      currentParty: true,
      mandates: { where: { isCurrent: true }, take: 5 },
      affairs: { take: 5, include: { sources: { take: 1 } } },
      declarations: { orderBy: { year: "desc" }, take: 1 },
    },
  });

  if (!politician) return null;

  let context = `**${politician.civility || ""} ${politician.fullName}**\n`;
  if (politician.currentParty) {
    context += `Parti : ${politician.currentParty.name}`;
    if (politician.currentParty.shortName) {
      context += ` (${politician.currentParty.shortName})`;
    }
    context += `\n`;
  }
  if (politician.birthDate) {
    context += `Né(e) le : ${politician.birthDate.toLocaleDateString("fr-FR")}\n`;
  }
  if (politician.deathDate) {
    context += `Décédé(e) le : ${politician.deathDate.toLocaleDateString("fr-FR")}\n`;
  }

  if (politician.mandates.length > 0) {
    context += `\n**Mandats actuels :**\n`;
    for (const m of politician.mandates) {
      context += `• ${m.title}\n`;
    }
  }

  if (politician.declarations.length > 0) {
    const decl = politician.declarations[0];
    context += `\n**Déclaration HATVP** (${decl!.year}) :\n`;
    if (decl!.totalNet)
      context += `• Patrimoine net déclaré : ${formatCurrency(Number(decl!.totalNet))}\n`;
  }

  if (politician.affairs.length > 0) {
    context += `\n⚠️ **${politician.affairs.length} affaire(s) judiciaire(s) référencée(s)** :\n`;
    for (const a of politician.affairs) {
      const status = AFFAIR_STATUS_LABELS[a.status] || a.status;
      context += `• ${a.title} — ${status}\n`;
    }
    const DEFINITIVE_STATUSES = [
      "CONDAMNATION_DEFINITIVE",
      "RELAXE",
      "ACQUITTEMENT",
      "NON_LIEU",
      "PRESCRIPTION",
      "CLASSEMENT_SANS_SUITE",
    ];
    const isAllDefinitive = politician.affairs.every((a: { status: string }) =>
      DEFINITIVE_STATUSES.includes(a.status)
    );
    if (!isAllDefinitive) {
      context += `\n⚠️ Rappel : ${politician.fullName} bénéficie de la présomption d'innocence pour les affaires non définitivement jugées.`;
    }
  }

  context += `\n\n→ Fiche complète : /politiques/${politician.slug}`;
  return context;
}

async function fetchPoliticianAffairs(searchName: string): Promise<string | null> {
  const politician = await db.politician.findFirst({
    where: {
      OR: [
        { fullName: { contains: searchName, mode: "insensitive" } },
        { lastName: { contains: searchName, mode: "insensitive" } },
      ],
    },
    include: {
      affairs: {
        include: {
          sources: { take: 2 },
          partyAtTime: { select: { shortName: true } },
        },
      },
    },
  });

  if (!politician) return null;

  if (politician.affairs.length === 0) {
    return (
      `**${politician.fullName}** n'a aucune affaire judiciaire référencée sur Poligraph.\n\n` +
      `Si vous disposez d'informations sourcées, vous pouvez nous le signaler via /mentions-legales.\n\n` +
      `→ Fiche : /politiques/${politician.slug}`
    );
  }

  let result = `**Affaires judiciaires de ${politician.fullName}** (${politician.affairs.length}) :\n\n`;
  for (const a of politician.affairs) {
    const status = AFFAIR_STATUS_LABELS[a.status] || a.status;
    result += `• **${a.title}** — ${status}\n`;
    if (a.description) result += `  ${a.description.slice(0, 200)}\n`;
    if (a.factsDate) result += `  Faits : ${a.factsDate.toLocaleDateString("fr-FR")}\n`;
    for (const src of a.sources) {
      if (src.url) result += `  Source : ${src.url}\n`;
    }
    result += `\n`;
  }

  const hasNonDefinitive = politician.affairs.some(
    (a) =>
      ![
        "CONDAMNATION_DEFINITIVE",
        "RELAXE",
        "ACQUITTEMENT",
        "NON_LIEU",
        "PRESCRIPTION",
        "CLASSEMENT_SANS_SUITE",
      ].includes(a.status)
  );
  if (hasNonDefinitive) {
    result += `⚠️ ${politician.fullName} bénéficie de la présomption d'innocence pour les affaires non définitivement jugées.\n`;
  }

  result += `\n→ Fiche complète : /politiques/${politician.slug}\n→ Toutes les affaires : /affaires`;
  return result;
}

async function fetchPoliticianHATVP(searchName: string): Promise<string | null> {
  const politician = await db.politician.findFirst({
    where: {
      OR: [
        { fullName: { contains: searchName, mode: "insensitive" } },
        { lastName: { contains: searchName, mode: "insensitive" } },
      ],
    },
    include: {
      declarations: { orderBy: { year: "desc" }, take: 3 },
    },
  });

  if (!politician) return null;

  if (politician.declarations.length === 0) {
    return (
      `**${politician.fullName}** n'a pas de déclaration HATVP référencée.\n\n` +
      `→ Fiche : /politiques/${politician.slug}`
    );
  }

  let result = `**Déclarations HATVP de ${politician.fullName}** :\n\n`;
  for (const d of politician.declarations) {
    result += `• **${d.type.replace(/_/g, " ")}**`;
    result += ` (${d.year})`;
    result += `\n`;
    if (d.totalNet) result += `  Patrimoine net : ${formatCurrency(Number(d.totalNet))}\n`;
    if (d.realEstate) result += `  Immobilier : ${formatCurrency(Number(d.realEstate))}\n`;
    if (d.securities) result += `  Valeurs mobilières : ${formatCurrency(Number(d.securities))}\n`;
    if (d.bankAccounts)
      result += `  Comptes bancaires : ${formatCurrency(Number(d.bankAccounts))}\n`;
    result += `\n`;
  }

  result += `→ Fiche complète : /politiques/${politician.slug}`;
  return result;
}

async function fetchPoliticianVotes(
  searchName: string,
  topic: string | null
): Promise<string | null> {
  const politician = await db.politician.findFirst({
    where: {
      OR: [
        { fullName: { contains: searchName, mode: "insensitive" } },
        { lastName: { contains: searchName, mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, slug: true },
  });

  if (!politician) return null;

  const voteWhere: Record<string, unknown> = { politicianId: politician.id };
  if (topic) {
    voteWhere.scrutin = {
      title: { contains: topic, mode: "insensitive" },
    };
  }

  const votes = await db.vote.findMany({
    where: voteWhere,
    include: {
      scrutin: {
        select: { title: true, votingDate: true, slug: true, id: true },
      },
    },
    orderBy: { votingDate: "desc" },
    take: 10,
  });

  if (votes.length === 0) {
    const msg = topic
      ? `Aucun vote trouvé pour **${politician.fullName}** sur le thème "${topic}".`
      : `Aucun vote trouvé pour **${politician.fullName}**.`;
    return `${msg}\n\n→ Fiche : /politiques/${politician.slug}\n→ Tous les scrutins : /votes`;
  }

  const voteLabels: Record<string, string> = {
    POUR: "✅ Pour",
    CONTRE: "❌ Contre",
    ABSTENTION: "⚪ Abstention",
    NON_VOTANT: "➖ Non votant",
    ABSENT: "⬜ Absent",
  };

  let result = topic
    ? `**Votes de ${politician.fullName} sur "${topic}" :**\n\n`
    : `**Derniers votes de ${politician.fullName} :**\n\n`;

  for (const v of votes) {
    const title =
      v.scrutin.title.length > 80 ? v.scrutin.title.slice(0, 80) + "…" : v.scrutin.title;
    const link = v.scrutin.slug || v.scrutin.id;
    result += `• ${voteLabels[v.position] || v.position} — ${title}\n`;
    result += `  ${v.scrutin.votingDate.toLocaleDateString("fr-FR")}\n`;
    result += `  → /parlement/votes/${link}\n`;
  }
  result += `\n→ Fiche complète : /politiques/${politician.slug}`;
  return result;
}

async function fetchPartyMembers(partySearch: string): Promise<string | null> {
  const party = await db.party.findFirst({
    where: {
      OR: [
        { name: { contains: partySearch, mode: "insensitive" } },
        { shortName: { contains: partySearch, mode: "insensitive" } },
      ],
    },
    include: {
      _count: { select: { politicians: true } },
    },
  });

  if (!party) return null;

  // Get mandate type breakdown
  const mandateCounts = await db.mandate.groupBy({
    by: ["type"],
    where: {
      isCurrent: true,
      politician: { currentPartyId: party.id },
    },
    _count: true,
  });

  const mandateLabels: Record<string, string> = {
    DEPUTE: "Députés",
    SENATEUR: "Sénateurs",
    DEPUTE_EUROPEEN: "Eurodéputés",
    MINISTRE: "Ministres",
    MINISTRE_DELEGUE: "Ministres délégués",
    SECRETAIRE_ETAT: "Secrétaires d'État",
    PREMIER_MINISTRE: "Premier ministre",
    PRESIDENT_REPUBLIQUE: "Président de la République",
  };

  let result = `**${party.name}** (${party.shortName || ""}) — ${party._count.politicians} membres référencés\n\n`;

  if (mandateCounts.length > 0) {
    result += `**Mandats en exercice :**\n`;
    for (const mc of mandateCounts) {
      const label = mandateLabels[mc.type] || mc.type;
      result += `• ${label} : ${mc._count}\n`;
    }
    result += `\n`;
  }

  if (party.slug) {
    result += `→ Page du parti : /partis/${party.slug}`;
  }
  return result;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Try to match the query against all citizen patterns.
 * Returns direct context if a pattern matches, null otherwise.
 */
export async function matchPattern(query: string): Promise<string | null> {
  for (const pattern of PATTERNS) {
    const match = pattern.test(query);
    if (match) {
      const result = await pattern.handler(query, match);
      if (result) return result;
    }
  }
  return null;
}
