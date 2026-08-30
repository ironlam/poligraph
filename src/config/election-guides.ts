import type { ElectionType } from "@/generated/prisma";

export interface ElectionGuideSection {
  title: string;
  icon: string;
  content: string;
}

/**
 * Practical guide content per election type.
 * Displayed on election detail pages when the `ELECTION_GUIDE_SECTION` feature flag is enabled.
 * Flags are rows in `FeatureFlag`, read through `isFeatureEnabled()` in `src/lib/feature-flags.ts`.
 */
export const ELECTION_GUIDES: Partial<Record<ElectionType, ElectionGuideSection[]>> = {
  MUNICIPALES: [
    {
      title: "Comment ça marche ?",
      icon: "🗳️",
      content:
        "Les conseillers municipaux sont élus au scrutin de liste à deux tours. " +
        "Dans les communes de 1 000 habitants et plus, les listes doivent être paritaires. " +
        "La liste arrivée en tête au 1er tour avec la majorité absolue, ou en tête au 2nd tour, " +
        "obtient la moitié des sièges (prime majoritaire). Les sièges restants sont répartis à la proportionnelle.",
    },
    {
      title: "Nouveauté 2026",
      icon: "✨",
      content:
        "La loi du 11 avril 2025 étend le scrutin de liste paritaire à toutes les communes, " +
        "y compris celles de moins de 1 000 habitants (auparavant au scrutin majoritaire plurinominal). " +
        "C'est une avancée majeure pour la parité dans les conseils municipaux ruraux.",
    },
    {
      title: "Qui peut voter ?",
      icon: "👤",
      content:
        "Pour voter, il faut avoir 18 ans révolus, être inscrit sur les listes électorales " +
        "et jouir de ses droits civils et politiques. Les citoyens de l'Union européenne résidant " +
        "en France peuvent également voter aux municipales.",
    },
    {
      title: "Comment s'inscrire ?",
      icon: "📋",
      content:
        "L'inscription est possible en ligne sur service-public.fr, en mairie ou par courrier. " +
        "La date limite d'inscription est fixée au 7 février 2026 pour ces municipales. " +
        "Pensez à vérifier votre situation électorale sur le site de l'INSEE.",
    },
  ],
  PRESIDENTIELLE: [
    {
      title: "Comment ça marche ?",
      icon: "🗳️",
      content:
        "Scrutin uninominal majoritaire à deux tours. " +
        "Il faut la majorité absolue au 1er tour pour être élu, sinon les deux candidats " +
        "arrivés en tête s'affrontent au 2nd tour. " +
        "Mandat de 5 ans, renouvelable une fois depuis 2008.",
    },
    {
      title: "Qui peut se présenter ?",
      icon: "📋",
      content:
        "Il faut recueillir au moins 500 parrainages d'élus (maires, conseillers " +
        "départementaux/régionaux, parlementaires) issus d'au moins 30 départements différents. " +
        "Les parrainages sont publiés par le Conseil constitutionnel. " +
        "Les comptes de campagne sont plafonnés et contrôlés par la CNCCFP.",
    },
    {
      title: "Qui peut voter ?",
      icon: "👤",
      content:
        "Tout citoyen français de 18 ans révolus, inscrit sur les listes électorales. " +
        "Seuls les nationaux français peuvent voter (pas les citoyens UE). " +
        "Vote possible par procuration, mais pas de vote par correspondance.",
    },
    {
      title: "Le saviez-vous ?",
      icon: "💡",
      content:
        "Le président de la République est aussi de droit co-prince d'Andorre. " +
        "Depuis l'inversion du calendrier en 2002, les législatives suivent la présidentielle " +
        "de quelques semaines. " +
        "L'élection mobilise généralement le plus fort taux de participation " +
        "de toutes les élections françaises.",
    },
  ],
  LEGISLATIVES: [
    {
      title: "Comment ça marche ?",
      icon: "🗳️",
      content:
        "577 députés élus au scrutin uninominal majoritaire à deux tours, " +
        "dans 577 circonscriptions. " +
        "Pour être élu au 1er tour : majorité absolue des suffrages exprimés " +
        "et au moins 25% des inscrits. " +
        "Au 2nd tour : les candidats ayant obtenu au moins 12,5% des inscrits " +
        "peuvent se maintenir (triangulaires possibles). Mandat de 5 ans.",
    },
    {
      title: "Les circonscriptions",
      icon: "🗺️",
      content:
        "La France est découpée en 577 circonscriptions législatives. " +
        "558 en métropole et outre-mer, 11 pour les Français de l'étranger (depuis 2012). " +
        "Le découpage est révisé périodiquement en fonction des évolutions démographiques.",
    },
    {
      title: "Qui peut voter ?",
      icon: "👤",
      content:
        "Tout citoyen français de 18 ans révolus inscrit sur les listes électorales. " +
        "Les citoyens de l'UE ne peuvent pas voter aux législatives. " +
        "Le vote a lieu un dimanche, en un ou deux tours.",
    },
    {
      title: "Assemblée et gouvernement",
      icon: "⚖️",
      content:
        "L'Assemblée nationale peut renverser le gouvernement par une motion de censure. " +
        "En cas de désaccord, le président peut dissoudre l'Assemblée " +
        "et provoquer de nouvelles élections. " +
        "Les députés votent les lois et contrôlent l'action du gouvernement.",
    },
  ],
  SENATORIALES: [
    {
      title: "Comment ça marche ?",
      icon: "🗳️",
      content:
        "Les sénateurs sont élus au suffrage universel indirect " +
        "par un collège de grands électeurs. " +
        "Dans les départements élisant 1 ou 2 sénateurs : scrutin majoritaire à deux tours. " +
        "Dans les départements élisant 3 sénateurs ou plus : scrutin proportionnel de liste. " +
        "Mandat de 6 ans, renouvelé par moitié tous les 3 ans.",
    },
    {
      title: "Les grands électeurs",
      icon: "👥",
      content:
        "Le collège électoral est constitué circonscription par circonscription : " +
        "seuls votent les grands électeurs des départements renouvelés. " +
        "Il est composé à 95 % de délégués des conseils municipaux. " +
        "Comprend aussi les députés, sénateurs sortants, " +
        "conseillers régionaux et départementaux. " +
        "Le vote est obligatoire pour les grands électeurs (amende en cas d'abstention).",
    },
    {
      title: "Le Sénat",
      icon: "🏛️",
      content:
        "348 sénateurs au total. " +
        "Le Sénat examine les projets et propositions de loi, peut proposer des amendements. " +
        "En cas de désaccord avec l'Assemblée, le gouvernement peut donner le dernier mot " +
        "à l'Assemblée nationale. " +
        "Le président du Sénat assure l'intérim de la présidence de la République.",
    },
    {
      title: "Le saviez-vous ?",
      icon: "💡",
      content:
        "Les sénatoriales sont les seules élections où le vote est obligatoire en France. " +
        "Le Sénat ne peut pas être dissous, contrairement à l'Assemblée nationale. " +
        "Le Sénat siège au Palais du Luxembourg à Paris.",
    },
  ],
  EUROPEENNES: [
    {
      title: "Comment ça marche ?",
      icon: "🗳️",
      content:
        "Scrutin de liste à la représentation proportionnelle, à un seul tour. " +
        "Les listes qui obtiennent au moins 5% des suffrages exprimés obtiennent des sièges. " +
        "Depuis 2019, la France élit 81 eurodéputés dans une circonscription nationale unique. " +
        "Mandat de 5 ans.",
    },
    {
      title: "Le Parlement européen",
      icon: "🇪🇺",
      content:
        "720 eurodéputés au total pour les 27 États membres. " +
        "Le Parlement européen co-légifère avec le Conseil de l'UE. " +
        "Il approuve la Commission européenne et peut la censurer. " +
        "Les groupes politiques sont transnationaux (PPE, S&D, Renew, etc.).",
    },
    {
      title: "Qui peut voter ?",
      icon: "👤",
      content:
        "Tout citoyen français ou de l'Union européenne résidant en France, âgé de 18 ans. " +
        "Les citoyens UE doivent choisir s'ils votent dans leur pays d'origine ou en France. " +
        "Le vote a lieu un dimanche en France (certains pays votent le jeudi ou samedi).",
    },
    {
      title: "Enjeux",
      icon: "🌍",
      content:
        "Les élections européennes ont historiquement un faible taux de participation en France. " +
        "Elles servent souvent de baromètre politique national à mi-mandat. " +
        "Les eurodéputés français siègent principalement à Strasbourg et Bruxelles.",
    },
  ],
};

/**
 * Deadline to register on the electoral roll, per election, when a decree has actually set one.
 *
 * Absent by design for présidentielle 2027: the decree has not been published, and inventing a date
 * would be worse than omitting the reminder. The banner renders the reminder only when a deadline
 * exists AND has not passed.
 */
const VOTER_REGISTRATION_DEADLINES: Record<string, Date> = {
  "municipales-2026": new Date("2026-02-07T00:00:00.000Z"),
};

export function getVoterRegistrationDeadline(electionSlug: string, now: Date): Date | null {
  const deadline = VOTER_REGISTRATION_DEADLINES[electionSlug];
  if (!deadline) return null;
  return deadline.getTime() > now.getTime() ? deadline : null;
}
