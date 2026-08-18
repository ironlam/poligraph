# Audit du pool blind V6 Ruffin v4

Date : 17 août 2026.

## Résultat

Le pool Ruffin restant ne permet pas de constituer honnêtement le blind indépendant équilibré demandé.
Aucune annotation n'a été figée et aucune décision pipeline n'a été révélée ou scorée.

## Méthode read-only

- Seed : `ruffin-v6-blind-holdout-v4:2026-08-17`.
- Source : `DocumentUnit` produites par le parser gelé sur les trois PDF mis en cache.
- Aucun speaker, rôle discourse, anchor, verdict d'acceptation ou formulation pipeline n'a été utilisé
  pour sélectionner ou afficher les cas.
- Exclusion par texte normalisé et par inclusion lorsque les anciens corpus utilisaient un bloc plus
  large que la nouvelle `DocumentUnit`.
- Corpus d'exclusion : gold, precision-v1, ancien holdout, blind-v1, blind-v2, blind-v3, fixtures
  discourse, tests ciblés et sélection disponible de la revue shadow 50.
- Entrée de sélection non annotée :
  `064d366e4cb4de15e91814b9fbdc9b11249518aedd412328871e5a28f6f81705`.

## Pool et collisions

| Document | Blocs | Unités | Collisions détectées et exclues | Pool restant | Candidats d'action structurels indépendants |
| -------- | ----: | -----: | ------------------------------: | -----------: | ------------------------------------------: |
| Travail  |   216 |    500 |                              95 |          265 |                                           2 |
| Probité  |   195 |    634 |                             113 |          400 |                                          10 |
| Loisirs  |   157 |    424 |                              79 |          266 |                                           3 |
| Total    |   568 |  1 558 |                             287 |          931 |                                          15 |

Le premier contrôle au niveau `DocumentBlock`, abandonné avant annotation, avait retiré 197 collisions
et produit des cas mélangeant à nouveau plusieurs voix ou actes discursifs. Il a été rejeté parce qu'il
contredisait la granularité V6 validée. Le contrôle final au niveau `DocumentUnit` est le seul retenu.

Le total de 287 correspond aux collisions du tirage final après exclusion des unités trop courtes ou
trop longues. Le corpus d'exclusion contient 560 textes normalisés uniques. Les collisions détectées
ont toutes été exclues.

## Pourquoi le blind n'a pas été constitué

La cible demandée est d'environ 40 à 45 engagements ou objectifs humains parmi 80 cas. Après trois
anciens blinds, gold, precision, les revues shadow et les tests de régression, les unités d'action des
trois mêmes documents sont largement consommées. Le pool restant contient beaucoup de diagnostics,
témoignages, exemples, fragments et références, mais seulement 15 candidats d'action identifiables par
des marqueurs structurels indépendants du pipeline.

Continuer aurait imposé au moins une des entorses suivantes :

- réintroduire des unités déjà utilisées pour calibrer V5 ou V6 ;
- considérer comme indépendant un fragment inclus dans une ancienne citation plus large ;
- sélectionner à partir des verdicts du shadow V6 ;
- produire un blind très déséquilibré, impropre à la mesure de recall demandée.

Aucune de ces options ne respecte la règle d'indépendance. Le fichier d'entrée généré dans `.tmp` reste
non annoté et ne constitue pas `ruffin-v6-blind-holdout-v4`. Il ne doit pas être scoré.

## Suite nécessaire

Une validation indépendante suffisante exige un corpus source non consommé, par exemple de nouveaux
documents officiels ou une autre candidature, puis un nouveau tirage sous le même gel sémantique. Il
ne faut pas créer un blind supplémentaire sur les mêmes unités dans cette session.
