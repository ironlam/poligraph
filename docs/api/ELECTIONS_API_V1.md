# API élections générique

## `GET /api/elections/{slug}`

Cette route retourne les champs de l'élection, ses tours et une page de candidatures.
Les candidatures ne sont jamais chargées comme une collection complète dans cette réponse.

Paramètres facultatifs :

- `page`, entier strict supérieur ou égal à 1, défaut `1` ;
- `limit`, entier strict de `1` à `100`, défaut `20`.

La réponse contient `candidacies.data` et `candidacies.pagination` (`page`, `limit`, `total`,
`totalPages`). Le `total` est calculé par PostgreSQL. Le tri est déterministe : élues d'abord,
score du premier tour décroissant, puis identifiant croissant.

### Rupture de contrat

Avant cette version, `candidacies` était un tableau exhaustif. Il devient un objet paginé. Un
client qui veut parcourir toute la collection doit suivre `page` jusqu'à `totalPages` ; il ne doit
pas considérer la première page comme exhaustive. Le contrat présidentiel spécialisé
`GET /api/elections/{slug}/candidacies` reste inchangé.

La borne réduit le volume de chaque réponse et le nombre de lignes transférées à l'application.
Elle ne constitue pas une mesure directe de l'egress Supabase facturé.
