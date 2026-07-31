# VoteBreakdown : restitution de scrutin

Montrer un vote sans le transformer en jugement. Un vote « contre » n'est ni une faute ni un courage : c'est une position.

## Quand l'employer

Fiche de scrutin, onglet « Votes » d'une fiche d'élu, carte de scrutin dans une liste, restitution de la Boussole.

## Anatomie

- **Barre de répartition** (`VoteBar`) : pour, contre, abstention, non-votants, en une seule barre à segments proportionnels, chaque segment étiqueté avec son effectif en `fr-FR`. Couleurs : `--vote-pour`, `--vote-contre`, `--vote-abstention`, `--vote-absent`.
- **Résultat** : « Adopté » ou « Rejeté » (`VOTING_RESULT_LABELS`), en badge, à côté du titre du scrutin. C'est le fait ; il précède toute analyse.
- **Position de la personne** sur une fiche d'élu : sa position, et le taux de participation du scrutin. Une position sans participation est trompeuse.
- **Position du groupe** (`GROUP_POSITION_LABELS`), pour situer la personne par rapport à son groupe. C'est le seul contexte qui permet de lire une dissidence.
- **Anneau de participation** (`ParticipationRing`) sur les agrégats, jamais sur un scrutin isolé.

## Règles

- Les couleurs de vote sont désaturées à dessein (`#4a8a5c`, `#9e5454`) : un vert vif et un rouge vif fabriquent un bien et un mal. Ne pas les « corriger ».
- **Séparer les segments par un filet** de 1 px à la couleur de la carte. `--vote-abstention` et `--vote-absent` sont deux gris très proches : sans filet, abstentions et non-votants se lisent comme un seul bloc, ce que la règle suivante interdit.
- **Aucune information portée par la seule couleur** : chaque segment, chaque puce porte un libellé.
- Un absent n'est pas un non-votant. `ABSENT` et `NON_VOTANT` ont des libellés, des couleurs et des sens distincts, ne pas les fusionner pour simplifier une barre.
- **Ne jamais qualifier une absence.** Pas de « n'a pas daigné voter ». `dissidenceLabel()` donne le vocabulaire admis pour l'écart au groupe (« Très discipliné » vers « Indépendant »), descriptif et borné.
- Un scrutin porte son intitulé complet et son type (`SCRUTIN_TYPE_LABELS`) : un amendement et un texte final n'ont pas le même poids et ne se comparent pas.
- Les effectifs en `toLocaleString("fr-FR")`, avec espace insécable.
- **Distinguer inscrits, votants et exprimés.** « 577 inscrits, 565 votants » n'est pas « 577 votants ». C'est l'erreur d'arithmétique la plus fréquente sur ce pattern.
- Un taux de participation faible s'affiche comme un fait, avec l'effectif : « 84 votants sur 577 ».

## Thème sombre

Les couleurs de vote ont des variantes sombres dédiées (`--vote-pour: #7ab892`, etc.) : ne pas se contenter d'éclaircir les valeurs claires, elles perdent leur désaturation et redeviennent un feu tricolore. Sur un segment étroit, le libellé passe hors de la barre plutôt qu'en blanc sur fond clair.

**Le piège du libellé sur le remplissage.** Ne jamais coder en dur `color:#fff` sur un segment : les remplissages sombres (`#7ab892`, `#c88a8a`) dépassent le seuil de luminosité BT.601 de 150, donc `getContrastTextColor()` impose un texte foncé. Employer `--vote-pour-fg` / `--vote-contre-fg` / `--vote-abstention-fg` / `--vote-absent-fg`, qui basculent avec le thème. Même règle pour tout texte posé sur une couleur de parti ou de chambre.

## À ne pas faire

- Un score, une note, un « taux de fidélité au groupe » présenté comme une performance.
- Un classement d'élus par nombre de votes « contre ».
- Une barre à segments sans effectifs : le pourcentage seul masque un scrutin à 40 votants.
- Additionner des positions sur des scrutins de natures différentes.
- Un emoji de vote. Les icônes sont Lucide, les couleurs sont des tokens.

## État actuel dans le code

- Surfaces existantes : `src/components/votes/VoteCard.tsx`, `src/components/votes/CardGroupPositions.tsx`, `src/components/parlement/ScrutinsListing.tsx`. Libellés : `VOTE_POSITION_LABELS`, `GROUP_POSITION_LABELS`, `SCRUTIN_TYPE_LABELS`, `dissidenceLabel()`, `AN_SEAT_COUNT` dans `src/config/labels.ts`.
- Les tokens `--vote-*` (et leurs `-fg`) sont déjà dans `src/app/globals.css` et consommés par `VoteCard` / `CardGroupPositions`.
- **Note dataviz** : la barre segmentée, l'anneau de participation et l'hémicycle existent déjà en production (`VoteCard`, `stats/Hemicycle.tsx`, `parlement/CompositionHemicycle.tsx`). Les extraire en primitives partagées (`VoteBar`, `ParticipationRing`) est un refactor de la feature votes, à coordonner, pas un ajout greenfield.
