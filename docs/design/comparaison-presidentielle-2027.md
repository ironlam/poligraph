# Comparaison factuelle des candidatures à la présidentielle 2027

## Objectif

Permettre de placer côte à côte les mesures publiées de deux ou trois personnalités, par thème et
par sous-thème, sans score, recommandation, résumé libre ni jugement de faisabilité.

La comparaison porte sur le corpus Poligraph, pas sur une prétendue exhaustivité des programmes.
Une cellule vide doit donc dire « Poligraph n'a pas encore trouvé ou traité de mesure sur ce
sujet », jamais « cette personnalité ne propose rien ».

## Parcours retenu

Route : `/elections/presidentielle-2027/comparer`.

État partageable dans l'URL :

- `candidat=slug-a&candidat=slug-b`, deux personnes au minimum, trois au maximum ;
- `theme=logement-urbanisme`, obligatoire pour afficher la comparaison ;
- `sous-theme=logement-social`, facultatif.

Entrées vers ce parcours :

1. une action « Comparer » sur les fiches candidates et les pages thématiques ;
2. la sélection d'une deuxième personnalité dans un panneau dédié ;
3. un lien partageable qui conserve les personnes et le sujet choisis.

Sur mobile, les personnalités sont présentées l'une après l'autre. On évite un tableau horizontal
illisible. Sur écran large, deux ou trois colonnes sont affichées côte à côte. L'ordre des
personnalités reste alphabétique. Le filtre par sous-thème viendra ensuite, après mesure de la
couverture des affectations validées.

Chaque personnalité dispose de sa propre pagination, conservée dans l'URL. Cette indépendance évite
qu'un programme très long impose plusieurs écrans vides à une personnalité qui ne porte qu'une
mesure sur le thème. Six mesures sont affichées par page et aucun extrait n'est présenté comme un
échantillon éditorial.

Les liens de pagination utilisent la navigation Next.js avec `scroll={false}` lorsque JavaScript
est disponible : la colonne mise à jour reste dans le champ de lecture et son compteur est annoncé
par une région `aria-live`. Les mêmes liens sont des URL ordinaires sans JavaScript, ce qui garantit
un rechargement complet fonctionnel et partageable sans maintenir une seconde API.

## Module de données

Créer un module profond dans `src/lib/data/presidential-comparison.ts` avec une seule interface :

```ts
getPresidentialComparison({
  electionSlug,
  candidateSlugs,
  theme,
  subtopicSlug,
}): Promise<PresidentialComparison | null>
```

Son implémentation réutilise les autorités publiques existantes : mesures publiées, fiche de
candidature ouverte, sources et affectations de sous-thèmes `APPROVED`. Le module prend aussi en
charge l'ordre, les limites, les retraits et les libellés de couverture. Les pages ne construisent
aucun filtre Prisma.

L'analyse par IA reste en amont : elle peut suggérer les sous-thèmes pendant l'import, mais seule
une affectation validée par l'équipe éditoriale structure la comparaison publique. Aucun appel à un
modèle n'est déclenché à la consultation.

## Présentation

Chaque mesure conserve :

- sa formulation publiée sans reformulation comparative ;
- le lien vers sa page canonique ;
- sa source primaire ou secondaire ;
- son statut de retrait éventuel ;
- les qualifications éditoriales déjà validées.

Le haut de page affiche le périmètre : nombre de mesures traitées, date de dernière revue et rappel
que les volumes reflètent le corpus Poligraph. Aucun total n'est transformé en score.

## Synthèse factuelle par thème

La fiche d'une candidature peut afficher une courte synthèse avant les mesures d'un thème lorsque
celui-ci contient au moins trois mesures. Cette synthèse décrit les orientations communes présentes
dans le corpus, sans en déduire une intention, une faisabilité ou une priorité politique.

Le texte doit être stocké et daté, citer les identifiants des mesures qui l'étayent, puis être
invalidé dès qu'une de ces mesures change ou qu'une nouvelle mesure est publiée dans le thème. Le
modèle peut proposer le texte en amont, mais aucune génération n'a lieu pendant la consultation et
la publication reste soumise à une validation éditoriale.

Dans l'interface :

- 40 à 60 mots au maximum, directement sous le titre du thème ;
- un libellé visible « Synthèse des mesures publiées » ;
- un accès aux mesures utilisées comme références ;
- aucun résumé pour un thème ne contenant qu'une ou deux mesures, où le texte serait redondant ;
- sur la comparaison, la synthèse précède les mesures de chaque personnalité sans remplacer les
  formulations originales.

## SEO et accessibilité

La page de comparaison est `noindex,follow` : ses combinaisons de paramètres sont nombreuses et
dupliquent des contenus canoniques. Les pages mesure, candidat et thème restent les surfaces à
indexer.

Les sélecteurs utilisent des libellés visibles, des groupes de cases à cocher et une annonce
`aria-live` lors de la mise à jour. Les intitulés de personne et de sous-thème restent associés à
chaque mesure sur mobile, sans dépendre de la couleur ou de la position d'une colonne.

## Découpage de livraison

1. Module de données et tests d'invariants éditoriaux.
2. Sélecteur de deux ou trois personnalités et URL partageable.
3. Vue par thème, responsive et accessible.
4. Entrées depuis les fiches candidates, les thèmes et les pages mesure.
5. Ajout facultatif du filtre par sous-thème après validation de la couverture réelle des
   affectations `APPROVED`.
