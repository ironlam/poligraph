# Patterns

Les fondations (`src/app/globals.css`, `src/config/*`) disent avec quoi dessiner. Les primitives (`src/components/ui/*`) donnent les briques. Les **patterns** disent comment on résout, chez Poligraph, un problème qui revient, et pourquoi la solution évidente est souvent fausse.

Chaque pattern porte un nom anglais (celui du composant en code) et un libellé français (celui qu'on emploie à l'oral et dans les issues).

| Pattern                                         | Libellé                 | Le problème qu'il résout                                                             |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| [`InvolvementBand`](./InvolvementBand.md)       | Bandeau de rôle         | Dire comment une personne est liée à une affaire, quand elle n'est pas mise en cause |
| [`JudicialCaution`](./JudicialCaution.md)       | Encart de prudence      | Énoncer l'état exact d'une procédure avant toute lecture à charge                    |
| [`MissingData`](./MissingData.md)               | Donnée absente          | Afficher une absence sans la déguiser en information                                 |
| [`ClickTarget`](./ClickTarget.md)               | Cible de clic           | Rendre une ligne ou une carte réellement cliquable, au doigt comme au clavier        |
| [`ContextNav`](./ContextNav.md)                 | Navigation contextuelle | Savoir où l'on est, d'où l'on vient, et repartir sans perdre son filtrage            |
| [`SourceAttribution`](./SourceAttribution.md)   | Attribution de source   | Rendre chaque fait vérifiable, y compris hors du site                                |
| [`VoteBreakdown`](./VoteBreakdown.md)           | Restitution de scrutin  | Montrer un vote sans le transformer en jugement                                      |
| [`PoliticianIdentity`](./PoliticianIdentity.md) | Identité d'élu          | Présenter une personne de façon constante, dense et non incriminante                 |

## Comment lire un pattern

Chaque fiche suit la même structure : quand l'employer, anatomie, règles, thème sombre, à ne pas faire, état actuel dans le code. Les règles marquées **INVARIANT** renvoient à [`legal-invariants.md`](../legal-invariants.md) : elles ne se négocient pas.

La section « état actuel dans le code » de chaque fiche relie le pattern à son implémentation réelle et signale les écarts connus (par exemple la variante `not_accused` manquante de `JudicialCaution`). Ces écarts sont des correctifs à cadrer séparément, pas des ajustements à faire au fil de l'eau, car ils touchent des surfaces affaires et légales sensibles.

## Origine

Ces patterns viennent de cinq séries de refonte menées sur le produit : liste et fiche d'affaires, refonte des scrutins, carte et fiche d'élu, patrimoine HATVP, et redesign de la Boussole. Ils ne sont pas théoriques : chacun corrige un défaut observé sur `poligraph.fr`. Source de spécification : le bundle `poligraph-design-system-*.zip` (dossiers `patterns/` et `guidelines/`).
