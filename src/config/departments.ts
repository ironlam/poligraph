import { generateSlug } from "@/lib/utils";

// French departments data - shared across the application
export const DEPARTMENTS: Record<string, { name: string; region: string }> = {
  "01": { name: "Ain", region: "Auvergne-Rhône-Alpes" },
  "02": { name: "Aisne", region: "Hauts-de-France" },
  "03": { name: "Allier", region: "Auvergne-Rhône-Alpes" },
  "04": { name: "Alpes-de-Haute-Provence", region: "Provence-Alpes-Côte d'Azur" },
  "05": { name: "Hautes-Alpes", region: "Provence-Alpes-Côte d'Azur" },
  "06": { name: "Alpes-Maritimes", region: "Provence-Alpes-Côte d'Azur" },
  "07": { name: "Ardèche", region: "Auvergne-Rhône-Alpes" },
  "08": { name: "Ardennes", region: "Grand Est" },
  "09": { name: "Ariège", region: "Occitanie" },
  "10": { name: "Aube", region: "Grand Est" },
  "11": { name: "Aude", region: "Occitanie" },
  "12": { name: "Aveyron", region: "Occitanie" },
  "13": { name: "Bouches-du-Rhône", region: "Provence-Alpes-Côte d'Azur" },
  "14": { name: "Calvados", region: "Normandie" },
  "15": { name: "Cantal", region: "Auvergne-Rhône-Alpes" },
  "16": { name: "Charente", region: "Nouvelle-Aquitaine" },
  "17": { name: "Charente-Maritime", region: "Nouvelle-Aquitaine" },
  "18": { name: "Cher", region: "Centre-Val de Loire" },
  "19": { name: "Corrèze", region: "Nouvelle-Aquitaine" },
  "2A": { name: "Corse-du-Sud", region: "Corse" },
  "2B": { name: "Haute-Corse", region: "Corse" },
  "21": { name: "Côte-d'Or", region: "Bourgogne-Franche-Comté" },
  "22": { name: "Côtes-d'Armor", region: "Bretagne" },
  "23": { name: "Creuse", region: "Nouvelle-Aquitaine" },
  "24": { name: "Dordogne", region: "Nouvelle-Aquitaine" },
  "25": { name: "Doubs", region: "Bourgogne-Franche-Comté" },
  "26": { name: "Drôme", region: "Auvergne-Rhône-Alpes" },
  "27": { name: "Eure", region: "Normandie" },
  "28": { name: "Eure-et-Loir", region: "Centre-Val de Loire" },
  "29": { name: "Finistère", region: "Bretagne" },
  "30": { name: "Gard", region: "Occitanie" },
  "31": { name: "Haute-Garonne", region: "Occitanie" },
  "32": { name: "Gers", region: "Occitanie" },
  "33": { name: "Gironde", region: "Nouvelle-Aquitaine" },
  "34": { name: "Hérault", region: "Occitanie" },
  "35": { name: "Ille-et-Vilaine", region: "Bretagne" },
  "36": { name: "Indre", region: "Centre-Val de Loire" },
  "37": { name: "Indre-et-Loire", region: "Centre-Val de Loire" },
  "38": { name: "Isère", region: "Auvergne-Rhône-Alpes" },
  "39": { name: "Jura", region: "Bourgogne-Franche-Comté" },
  "40": { name: "Landes", region: "Nouvelle-Aquitaine" },
  "41": { name: "Loir-et-Cher", region: "Centre-Val de Loire" },
  "42": { name: "Loire", region: "Auvergne-Rhône-Alpes" },
  "43": { name: "Haute-Loire", region: "Auvergne-Rhône-Alpes" },
  "44": { name: "Loire-Atlantique", region: "Pays de la Loire" },
  "45": { name: "Loiret", region: "Centre-Val de Loire" },
  "46": { name: "Lot", region: "Occitanie" },
  "47": { name: "Lot-et-Garonne", region: "Nouvelle-Aquitaine" },
  "48": { name: "Lozère", region: "Occitanie" },
  "49": { name: "Maine-et-Loire", region: "Pays de la Loire" },
  "50": { name: "Manche", region: "Normandie" },
  "51": { name: "Marne", region: "Grand Est" },
  "52": { name: "Haute-Marne", region: "Grand Est" },
  "53": { name: "Mayenne", region: "Pays de la Loire" },
  "54": { name: "Meurthe-et-Moselle", region: "Grand Est" },
  "55": { name: "Meuse", region: "Grand Est" },
  "56": { name: "Morbihan", region: "Bretagne" },
  "57": { name: "Moselle", region: "Grand Est" },
  "58": { name: "Nièvre", region: "Bourgogne-Franche-Comté" },
  "59": { name: "Nord", region: "Hauts-de-France" },
  "60": { name: "Oise", region: "Hauts-de-France" },
  "61": { name: "Orne", region: "Normandie" },
  "62": { name: "Pas-de-Calais", region: "Hauts-de-France" },
  "63": { name: "Puy-de-Dôme", region: "Auvergne-Rhône-Alpes" },
  "64": { name: "Pyrénées-Atlantiques", region: "Nouvelle-Aquitaine" },
  "65": { name: "Hautes-Pyrénées", region: "Occitanie" },
  "66": { name: "Pyrénées-Orientales", region: "Occitanie" },
  "67": { name: "Bas-Rhin", region: "Grand Est" },
  "68": { name: "Haut-Rhin", region: "Grand Est" },
  "69": { name: "Rhône", region: "Auvergne-Rhône-Alpes" },
  "70": { name: "Haute-Saône", region: "Bourgogne-Franche-Comté" },
  "71": { name: "Saône-et-Loire", region: "Bourgogne-Franche-Comté" },
  "72": { name: "Sarthe", region: "Pays de la Loire" },
  "73": { name: "Savoie", region: "Auvergne-Rhône-Alpes" },
  "74": { name: "Haute-Savoie", region: "Auvergne-Rhône-Alpes" },
  "75": { name: "Paris", region: "Île-de-France" },
  "76": { name: "Seine-Maritime", region: "Normandie" },
  "77": { name: "Seine-et-Marne", region: "Île-de-France" },
  "78": { name: "Yvelines", region: "Île-de-France" },
  "79": { name: "Deux-Sèvres", region: "Nouvelle-Aquitaine" },
  "80": { name: "Somme", region: "Hauts-de-France" },
  "81": { name: "Tarn", region: "Occitanie" },
  "82": { name: "Tarn-et-Garonne", region: "Occitanie" },
  "83": { name: "Var", region: "Provence-Alpes-Côte d'Azur" },
  "84": { name: "Vaucluse", region: "Provence-Alpes-Côte d'Azur" },
  "85": { name: "Vendée", region: "Pays de la Loire" },
  "86": { name: "Vienne", region: "Nouvelle-Aquitaine" },
  "87": { name: "Haute-Vienne", region: "Nouvelle-Aquitaine" },
  "88": { name: "Vosges", region: "Grand Est" },
  "89": { name: "Yonne", region: "Bourgogne-Franche-Comté" },
  "90": { name: "Territoire de Belfort", region: "Bourgogne-Franche-Comté" },
  "91": { name: "Essonne", region: "Île-de-France" },
  "92": { name: "Hauts-de-Seine", region: "Île-de-France" },
  "93": { name: "Seine-Saint-Denis", region: "Île-de-France" },
  "94": { name: "Val-de-Marne", region: "Île-de-France" },
  "95": { name: "Val-d'Oise", region: "Île-de-France" },
  // DOM-TOM
  "971": { name: "Guadeloupe", region: "DOM-TOM" },
  "972": { name: "Martinique", region: "DOM-TOM" },
  "973": { name: "Guyane", region: "DOM-TOM" },
  "974": { name: "La Réunion", region: "DOM-TOM" },
  "976": { name: "Mayotte", region: "DOM-TOM" },
  "975": { name: "Saint-Pierre-et-Miquelon", region: "DOM-TOM" },
  "977": { name: "Saint-Barthélemy", region: "DOM-TOM" },
  "978": { name: "Saint-Martin", region: "DOM-TOM" },
  "986": { name: "Wallis-et-Futuna", region: "DOM-TOM" },
  "987": { name: "Polynésie française", region: "DOM-TOM" },
  "988": { name: "Nouvelle-Calédonie", region: "DOM-TOM" },
};

// Reverse lookup: department name (normalized) → code
const DEPARTMENT_NAME_TO_CODE: Map<string, string> = new Map();
for (const [code, dept] of Object.entries(DEPARTMENTS)) {
  const normalized = dept.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['-]/g, " ");
  DEPARTMENT_NAME_TO_CODE.set(normalized, code);
}

/**
 * Find a department code by name (fuzzy match).
 * Handles accents, hyphens, and partial matches.
 */
export function findDepartmentCode(query: string): string | null {
  const normalized = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['-]/g, " ")
    .trim();

  // Exact match
  const exact = DEPARTMENT_NAME_TO_CODE.get(normalized);
  if (exact) return exact;

  // Partial match (query is substring of department name)
  for (const [name, code] of DEPARTMENT_NAME_TO_CODE) {
    if (name.includes(normalized) || normalized.includes(name)) {
      return code;
    }
  }

  return null;
}

// Slug → department lookup (lazy-initialized)
let _slugMap: Map<string, { code: string; name: string; region: string }> | null = null;

function getSlugMap() {
  if (!_slugMap) {
    _slugMap = new Map();
    for (const [code, dept] of Object.entries(DEPARTMENTS)) {
      _slugMap.set(generateSlug(dept.name), { code, ...dept });
    }
  }
  return _slugMap;
}

/** Resolve a slug to department info, or null if not found */
export function getDepartmentBySlug(slug: string) {
  return getSlugMap().get(slug) ?? null;
}

/** Generate a slug from a department name */
export function getDepartmentSlug(name: string) {
  return generateSlug(name);
}

/**
 * The department name behind a code, or null when the code names no department.
 *
 * Exists because `Commune.departmentName` holds the CODE, on all 34 969 rows, so displaying that
 * column prints "86 (86)" where "Vienne (86)" was meant. Resolve through here instead, and never
 * read that column for anything a reader sees.
 *
 * Null rather than a made-up name for the six communes of the TAAF (984) and Clipperton (989):
 * those territories have no department. Adding them to DEPARTMENTS would be the tempting fix and
 * the wrong one, since that map drives the /departements routes and the sitemap, which would gain
 * two entries that are not departments.
 */
export function getDepartmentName(code: string | null | undefined): string | null {
  if (!code) return null;
  return DEPARTMENTS[code]?.name ?? null;
}

/**
 * A department for display: "Vienne (86)", or the bare code when no name exists.
 *
 * The bare code is deliberate. "984 (984)" reads as a bug, and the TAAF have no name to give.
 */
export function formatDepartment(code: string | null | undefined): string {
  if (!code) return "";
  const name = getDepartmentName(code);
  return name ? `${name} (${code})` : code;
}
