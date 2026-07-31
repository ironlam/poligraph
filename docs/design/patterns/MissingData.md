# MissingData : donnée absente

Sur une plateforme de données publiques, l'absence est une information. Elle se dit, elle ne se comble pas.

## Quand l'employer

Partout où une valeur peut manquer : déclaration HATVP non publiée, juridiction non renseignée, peine sans objet, patrimoine inconnu, vote non enregistré, mandat sans date de fin.

## Le défaut qu'il corrige

Sur une fiche d'affaire visant un tiers, la page réservait deux cartes à un procès qui ne concernait pas la personne suivie : « Juridiction : informations non renseignées » et une carte « Peine » affichant successivement « les peines prononcées ne concernent pas cette personne » puis « affaire en cours, pas encore de verdict ». Deux blocs pleins de rien, et deux messages contradictoires.

## Les trois cas, et leur traitement

| Cas                                                                                                    | Traitement                                                                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Sans objet** : la donnée ne peut pas exister ici (peine, alors que la personne n'est pas poursuivie) | Masquer le bloc. Une ligne discrète en fin de section explique l'absence, une fois.          |
| **Inconnue** : la donnée existe mais Poligraph ne l'a pas                                              | Afficher le bloc avec un état vide explicite et daté : ce qui manque, pourquoi, où chercher. |
| **Non publiée** : l'autorité ne l'a pas rendue publique                                                | État vide qui nomme l'autorité : « Aucune déclaration publiée par la HATVP à ce jour. »      |

## Anatomie de l'état vide

`border: 1px dashed var(--border)`, `border-radius: var(--radius-md)`, `padding: 12px 14px`, texte `var(--muted-foreground)` à 12,5 px. Un symbole Unicode discret en gris si nécessaire, jamais d'emoji, jamais d'illustration.

## Règles

- **[I8](../legal-invariants.md)** : le doute se documente. Pas de tiret, pas de « N/A », pas de `0` là où la valeur est inconnue.
- **`0` et « inconnu » ne se rendent jamais pareil.** « 0 affaire » est un fait ; « aucune donnée » est une lacune.
- **Un seul message par absence.** Deux phrases qui se contredisent valent moins que rien.
- Ne jamais remplir un bloc pour tenir une grille. Si la grille se déséquilibre, c'est la grille qui change : passer en une colonne.
- Dire où chercher quand c'est possible : lien vers la source officielle, « Signaler une erreur ».
- Une absence n'est jamais un reproche. « Aucune déclaration publiée », pas « n'a pas déclaré ».
- Ne pas employer un `Skeleton` pour une donnée absente : le squelette dit « ça arrive », pas « ça n'existe pas ».

## Thème sombre

`var(--border)` en pointillé devient très peu visible en sombre (`oklch(1 0 0 / 10%)`). Monter à `oklch(1 0 0 / 18%)` pour l'état vide, sinon le bloc semble cassé plutôt que vide.

## À ne pas faire

- « Non renseigné » seul, sans dire par qui ni pourquoi.
- Un placeholder gris à la place d'un chiffre : le lecteur croit à un chargement.
- Un ton évaluatif (« aucune transparence sur ce point »).
- Masquer une absence pour rendre une fiche « plus complète » : c'est une falsification par omission.

## État actuel dans le code

- La condition de masquage du bloc Peine repose sur `isAccusedInvolvement()` (`src/config/certainty.ts`) ; les blocs Peine et Juridiction sont dans `src/app/affaires/[slug]/page.tsx`.
- Le premier volet (l'encart tiers) a été traité (#511, variante `third_party` de [`JudicialCaution`](./JudicialCaution.md)).
- **À vérifier sur la fiche actuelle** : qu'un seul message d'absence subsiste quand `isAccusedInvolvement` est faux (pas de bloc Peine vide contradictoire), et que les états vides HATVP nomment l'autorité et datent l'absence.
