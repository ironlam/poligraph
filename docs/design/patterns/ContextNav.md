# ContextNav : navigation contextuelle

Savoir où l'on est, d'où l'on vient, et repartir sans perdre son travail de filtrage.

## Quand l'employer

Sur toute page de détail atteinte depuis une liste : fiche d'affaire, fiche d'élu, scrutin, dossier législatif, fact-check.

## Le défaut qu'il corrige

La fiche d'affaire n'offrait aucun chemin visible vers la fiche de l'élu, la page du parti, ni la liste d'où venait le lecteur. Le seul retour disponible était le bouton du navigateur, qui, sur une liste filtrée, ramenait souvent à une liste vide de tout filtre.

## Anatomie

Trois éléments, dans cet ordre de priorité :

1. **Fil d'Ariane** : `Affaires › <super-catégorie> › <titre tronqué>`. Le dernier segment n'est pas un lien, il est en `font-weight: 700`. Les segments intermédiaires portent du sens : une catégorie, une chambre, un parti, pas « Détail ».
2. **Retour non destructif** : le lien « Affaires » du fil conserve la query string d'origine (filtres, tri, page). Passer les paramètres, ne pas se contenter d'un `href` nu.
3. **Bloc « Poursuivre »** en fin de fiche : 2 à 4 destinations réelles (la fiche de la personne, la page du parti, les autres affaires de la même catégorie, la source officielle). Chacune décrite, pas « Voir plus ».

Sur une fiche longue, une barre collante reprend le titre tronqué et le retour : `position: sticky; top: 0`, `background: color-mix(in oklch, var(--background) 80%, transparent)`, `backdrop-filter: blur(8px)`, hauteur 56 px.

## Règles

- Le fil d'Ariane est un `<nav aria-label="Fil d'Ariane">` avec une liste ordonnée, pas une suite de `<span>` séparés par des `›`.
- Le séparateur `›` est décoratif : `aria-hidden`.
- Cibles à 44 px minimum, y compris dans le fil (voir [`ClickTarget`](./ClickTarget.md)).
- La barre collante ne masque jamais un encart de prudence au défilement : elle est fine et ne porte que le titre et le retour.
- Ne jamais réécrire l'historique du navigateur pour simuler un retour.
- Le bloc « Poursuivre » ne propose que des destinations qui existent : pas de lien vers une fiche de parti absente.

## Thème sombre

La barre translucide est le point sensible : `color-mix` avec `var(--background)` sombre donne un voile presque noir qui écrase la carte en dessous. Descendre à 70 % et augmenter le flou à 10 px. Vérifier que la bordure basse (`var(--border)`, soit `oklch(1 0 0 / 10%)`) reste perceptible, sinon la barre semble flotter sans attache.

## À ne pas faire

- Un fil d'Ariane qui répète la hiérarchie de l'URL sans valeur sémantique.
- Un bouton « Retour » qui appelle `history.back()` : il casse l'arrivée directe depuis un partage ou un moteur de recherche.
- Empiler barre collante, en-tête de site et barre de partage : au-delà de deux couches fixes, le mobile n'a plus de contenu visible.
- Perdre les filtres au retour. C'est le défaut le plus coûteux de la navigation, et le moins visible en recette.

## État actuel dans le code

- Primitive : `src/components/ui/Breadcrumb.tsx` (`nav` labellisé, `aria-current`, chevrons `aria-hidden`, voir l'audit a11y). Surfaces : `src/app/affaires/[slug]/page.tsx`, `src/app/affaires/parti/[slug]/page.tsx`, `src/components/affairs/LinkedAffairBanner.tsx`.
- **À vérifier sur la fiche actuelle** : que le fil d'Ariane et le retour préservent la query string de la liste d'origine, et que le bloc « Poursuivre » existe en fin de fiche.
