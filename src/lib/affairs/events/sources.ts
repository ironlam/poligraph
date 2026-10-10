/**
 * Sources admises pour une étape de procédure publique. Listes blanches : un domaine absent est
 * refusé. Un domaine couvre ses sous-domaines (`france3-regions.franceinfo.fr`), sauf un
 * sous-domaine de blog hébergé chez un média (`france3-regions.blog.francetvinfo.fr`).
 *
 * Critère : une rédaction professionnelle identifiable, quelle que soit sa ligne éditoriale.
 * Ce qui est refusé n'est pas de la presse : agrégateurs, blogs, encyclopédies, réseaux sociaux,
 * sites de partis ou d'associations parties prenantes. La liste doit s'étendre : un titre légitime
 * absent s'ajoute ici (une ligne), le garde l'indique à l'admin au moment de publier.
 *
 * La page publique /methodologie/sources-medias affiche ces deux tableaux tels quels.
 */

/** Juridictions, administrations et assemblées : seules adresses acceptées en « source officielle ». */
export const OFFICIAL_SOURCE_HOSTS: readonly string[] = [
  "gouv.fr", // Légifrance, ministères, préfectures
  "justice.fr", // cours d'appel, tribunaux
  "courdecassation.fr",
  "conseil-etat.fr",
  "conseil-constitutionnel.fr",
  "ccomptes.fr", // Cour des comptes et chambres régionales
  "assemblee-nationale.fr",
  "senat.fr",
  "hatvp.fr",
  "cnccfp.fr",
  "europarl.europa.eu",
  "curia.europa.eu",
  "echr.coe.int",
];

/** Médias d'information admis en « presse ». */
export const PRESS_SOURCE_HOSTS: readonly string[] = [
  // Agences et presse nationale
  "afp.com",
  "reuters.com",
  "apnews.com",
  "lemonde.fr",
  "lefigaro.fr",
  "liberation.fr",
  "mediapart.fr",
  "lesechos.fr",
  "la-croix.com",
  "humanite.fr",
  "leparisien.fr",
  "lexpress.fr",
  "lepoint.fr",
  "nouvelobs.com",
  "marianne.net",
  "challenges.fr",
  "capital.fr",
  "20minutes.fr",
  "huffingtonpost.fr",
  "lecanardenchaine.fr",
  "lesjours.fr",
  "politico.eu",
  "lejdd.fr",
  "valeursactuelles.com",
  "lopinion.fr",
  "latribune.fr",
  "lesinrocks.com",
  "courrierinternational.com",
  "alternatives-economiques.fr",
  // Presse spécialisée (justice, droit, santé, collectivités)
  "dalloz-actualite.fr",
  "lagazettedescommunes.com",
  "acteurspublics.fr",
  "apmnews.com",
  // Audiovisuel
  "franceinfo.fr",
  "francetvinfo.fr",
  "radiofrance.fr",
  "franceinter.fr",
  "francebleu.fr",
  "ici.fr",
  "bfmtv.com",
  "tf1info.fr",
  "europe1.fr",
  "rtl.fr",
  "cnews.fr",
  "lci.fr",
  "francetv.fr",
  "publicsenat.fr",
  "lcp.fr",
  "france24.com",
  "rfi.fr",
  "arte.tv",
  "ina.fr",
  // Presse régionale
  "ouest-france.fr",
  "sudouest.fr",
  "ladepeche.fr",
  "ledauphine.com",
  "lavoixdunord.fr",
  "leprogres.fr",
  "lindependant.fr",
  "midilibre.fr",
  "courrier-picard.fr",
  "dna.fr",
  "lalsace.fr",
  "estrepublicain.fr",
  "republicain-lorrain.fr",
  "vosgesmatin.fr",
  "lejsl.com",
  "bienpublic.com",
  "laprovence.com",
  "nicematin.com",
  "varmatin.com",
  "corsematin.com",
  "letelegramme.fr",
  "lamontagne.fr",
  "lanouvellerepublique.fr",
  "lepopulaire.fr",
  "leberry.fr",
  "lyonne.fr",
  "lunion.fr",
  "lardennais.fr",
  "paris-normandie.fr",
  "charentelibre.fr",
  "larepubliquedespyrenees.fr",
  "actu.fr",
  "lyonmag.com",
  "petit-bulletin.fr",
  "corsenetinfos.corsica",
  "mesinfos.fr", // hebdomadaires régionaux : Affiches Parisiennes, Le Tout Lyon, TPBM
  // Médias locaux d'enquête en ligne
  "marsactu.fr",
  "mediacites.fr",
  "rue89lyon.fr",
  "rue89strasbourg.com",
  "placegrenet.fr",
  "streetpress.com",
  "blast-info.fr",
  "lepoulpe.info",
  // Outre-mer (la1ere est un sous-domaine de franceinfo et francetvinfo)
  "franceantilles.fr",
  "clicanoo.re",
  "lequotidien.re",
  "linfo.re",
  "rci.fm",
  // Presse étrangère de référence
  "lesoir.be",
  "lalibre.be",
  "rtbf.be",
  "letemps.ch",
  "rts.ch",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "nytimes.com",
  "euronews.com",
  "lavenir.net",
  "rtl.be",
  "aljazeera.com",
  "dw.com",
  "elpais.com",
  "touteleurope.eu",
];

function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function matchesList(url: string, list: readonly string[]): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  const labels = host.split(".");
  return list.some((allowed) => {
    if (host !== allowed && !host.endsWith(`.${allowed}`)) return false;
    // Labels in front of the media domain: a blog hosted under it is not the newsroom.
    const prefix = labels.slice(0, labels.length - allowed.split(".").length);
    return !prefix.some((label) => label === "blog" || label === "blogs");
  });
}

export function isOfficialSourceUrl(url: string): boolean {
  return matchesList(url, OFFICIAL_SOURCE_HOSTS);
}

export function isAcceptedPressUrl(url: string): boolean {
  return matchesList(url, PRESS_SOURCE_HOSTS);
}
