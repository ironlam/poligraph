const OFFICIAL_HOSTS = new Set([
  "ameli.fr",
  "assemblee-nationale.fr",
  "cnil.fr",
  "conseil-constitutionnel.fr",
  "defenseurdesdroits.fr",
  "ecologie.gouv.fr",
  "hatvp.fr",
  "insee.fr",
  "legifrance.gouv.fr",
  "senat.fr",
  "service-public.fr",
  "urssaf.fr",
  "vie-publique.fr",
]);

function isHostOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isOfficialInstitutionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname.endsWith(".gouv.fr") ||
      [...OFFICIAL_HOSTS].some((domain) => isHostOrSubdomain(hostname, domain))
    );
  } catch {
    return false;
  }
}
