# Enrichissement des pages de mesure présidentielle 2027

## Objectif

Faire de chaque page mesure une fiche de référence utile même lorsqu'elle est consultée directement,
sans ajouter de texte pour atteindre une longueur arbitraire. Google recommande un contenu fiable,
original et pensé pour répondre au besoin du lecteur, plutôt qu'un volume de texte produit pour le
référencement. La page doit donc aider à comprendre la formulation, retrouver son contexte exact et
la comparer à des propositions proches.

Référence : [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

## État actuel

La page possède déjà :

- une URL stable et descriptive ;
- un titre et une description SEO propres à la mesure ;
- le thème, le niveau de précision et la date de revue ;
- l'édition du programme dont elle provient ;
- le candidat ou la candidate qui la porte ;
- la source primaire avec son emplacement dans le document ;
- des mesures d'autres candidats sur le même thème ;
- les votes parlementaires lorsqu'un rapprochement a été validé ;
- un fil d'Ariane, un canonical et des données structurées.

Dans la base locale auditée le 29 août 2026, les 1 402 mesures publiées sont rattachées à une édition
de programme. Les champs `details`, qualifications, sous-thèmes approuvés et liens de vote sont
encore vides. Le premier enjeu n'est donc pas d'ajouter de nouveaux blocs, mais d'alimenter les
structures éditoriales déjà prévues.

## Contenu cible d'une fiche

### 1. Ce que prévoit la mesure

Utiliser `MeasureRevision.details`, déjà versionné et lié à la formulation publiée. Ce texte doit
apporter uniquement des précisions présentes dans la source : mécanisme annoncé, population ou
territoire concernés, calendrier, seuils, exceptions et articulation avec une mesure voisine du
même programme.

Règles proposées :

- 80 à 250 mots lorsque la source contient réellement ces informations ;
- aucune reformulation sur la faisabilité, l'intention ou les effets supposés ;
- chaque élément doit être vérifiable dans une source attachée à la révision ;
- chaque affirmation générée doit conserver les identifiants exacts des extraits qui la soutiennent ;
- une quantité est admise uniquement lorsqu'elle figure dans l'extrait cité par l'affirmation ;
- génération par IA autorisée comme proposition de brouillon, jamais comme publication automatique ;
- validation humaine et date de revue obligatoires.

Lorsque la source ne dit rien de plus que le titre, le bloc reste absent. Un texte redondant ferait
baisser la valeur de la page au lieu de l'améliorer.

Les définitions externes ne doivent pas être enregistrées dans `MeasureRevision.details`. Ce champ
décrit le contenu du programme et son origine ne doit pas devenir ambiguë. Un futur bloc « Repères
pour comprendre » utilisera un circuit distinct, avec une source fournie par le document lui-même ou
une source institutionnelle officielle, son URL, sa date de vérification et une validation humaine.
Une source journalistique ou généraliste ne suffira pas pour générer automatiquement une définition.

### 2. Repères structurés

Afficher les informations validées sous forme de liste courte :

- attribution personnelle ou reprise du programme du parti ;
- sous-thèmes approuvés ;
- calendrier précisé ;
- financement non précisé ;
- périmètre incertain ;
- mesure déjà tentée, avec sa source.

Ces éléments existent déjà dans `MeasureRevisionSubtopic` et `MeasureQualification`. Les libellés
publics doivent expliquer le constat sans suggérer une note ou un jugement.

### 3. Contexte dans le programme

Conserver le bloc désormais présent, puis l'enrichir avec :

- l'emplacement exact dans le document ;
- le chapitre ou l'axe du programme ;
- un lien vers les autres mesures publiées du même chapitre ;
- une courte citation seulement lorsqu'elle apporte un contexte distinct et respecte les limites de
  reproduction de la source.

L'emplacement est aujourd'hui stocké dans `MeasureSource.page`. Si le chapitre doit devenir un outil
de navigation, il faudra le modéliser dans l'édition du programme plutôt que le déduire à chaque
affichage depuis une chaîne libre.

### 4. Comparaisons réellement proches

Les cartes actuelles utilisent le thème général faute de sous-thèmes approuvés. Une fois la
classification relue :

- proposer en priorité les mesures partageant un sous-thème ;
- afficher le sous-thème commun ;
- garantir au maximum une mesure par candidat ;
- conserver l'ordre alphabétique ;
- proposer ensuite la comparaison complète du thème.

Le classement sémantique peut suggérer des rapprochements en administration, mais il ne doit pas
ordonner seul les candidats sur la page publique.

### 5. Votes et historique

Lorsqu'un rapprochement manuel existe, expliquer factuellement la relation avec le scrutin et son
périmètre. Lorsqu'une mesure reprend une proposition d'une campagne précédente, utiliser les liens
`precedingMeasure` et `followingMeasures` pour présenter une chronologie sourcée.

Ne jamais afficher un bloc vide ou une mention générique indiquant que le travail reste à faire.

## Maillage interne

Chaque fiche doit conduire vers :

- la fiche du candidat ;
- l'édition complète du programme ;
- la page du thème et, plus tard, du sous-thème ;
- les mesures proches d'autres candidats ;
- les autres mesures du même candidat sur ce sous-thème ;
- le scrutin lié lorsqu'il existe.

Le maillage doit aussi fonctionner dans l'autre sens : programme, candidat, thème, sous-thème et
comparateur doivent tous pouvoir mener à l'URL canonique de la mesure.

## Doctrine d'indexation

Ne pas supposer que les 1 402 pages méritent toutes le même verdict. Avant d'ajouter une règle,
mesurer sur la production la répartition des signaux suivants :

- source primaire et emplacement précis ;
- détails relus suffisamment distincts du titre ;
- au moins un sous-thème approuvé ;
- qualification sourcée ;
- vote ou filiation validé ;
- plusieurs liens entrants contextuels.

Construire ensuite un prédicat pur dans `src/lib/seo/measure-robots.ts`, partagé par les métadonnées
et le sitemap, puis le couvrir dans `indexation-doctrine.test.ts`. Aucun seuil ne doit être choisi
avant ce comptage : un signal devenu universel ne distingue plus une fiche riche d'une fiche mince.

Dans l'intervalle, conserver les pages publiées indexables. Les masquer toutes avant d'avoir des
données Search Console et une mesure du contenu réel détruirait le bénéfice des URL déjà diffusées.

## Données structurées et confiance

Auditer l'usage actuel de `ArticleJsonLd` : une fiche mesure n'est pas nécessairement un article.
Privilégier un `WebPage` avec fil d'Ariane, entité `about`, dates de publication et de modification si
ce modèle décrit plus honnêtement le contenu. Les données structurées doivent refléter ce que le
lecteur voit, pas viser artificiellement un résultat enrichi.

Ajouter près de la date une mention courte de la revue par Poligraph, avec un lien vers la méthode.
La page doit rendre immédiatement visibles la source, la date et la manière dont le contenu a été
produit ou vérifié.

## Administration et chaîne éditoriale

Ajouter à l'administration d'une révision publiée :

1. édition des `details` avec aperçu public ;
2. propositions de sous-thèmes, puis approbation ou rejet humain ;
3. qualifications avec justification et source ;
4. contrôle de complétude avant publication ;
5. filtre « fiche publique à enrichir » ;
6. traitement par lots assisté par Mistral, sans publication automatique.

Le contrôle de complétude signale les champs manquants, mais ne bloque pas une mesure dont la source
ne permet honnêtement aucun enrichissement.

### Commandes de génération

Mesurer l'entonnoir complet avant une génération ou une campagne de relecture :

```bash
npm run measures:audit-contexts -- --election presidentielle-2027
```

Le rapport distingue les contextes publics, les brouillons en attente, les mesures sans preuve
structurée, les sources qui ne contiennent aucun contexte distinct de la formulation et les
tentatives déjà terminées. Les résultats terminaux sont séparés entre absence de contexte utile et
échec répété de validation. Les réservations actives, les erreurs encore réessayables et les
exclusions inexpliquées possèdent aussi leur propre compteur. Un faible taux public ne signifie donc
pas automatiquement que toutes les autres mesures peuvent recevoir un résumé utile.

Prévisualiser le nombre de mesures éligibles sans appeler Mistral ni écrire en base :

```bash
npm run measures:generate-contexts -- \
  --election presidentielle-2027 \
  --all
```

Créer tous les brouillons manquants en une seule exécution :

```bash
npm run measures:generate-contexts -- \
  --election presidentielle-2027 \
  --all \
  --apply
```

Le traitement reste séquentiel pour maîtriser la charge sur Mistral et sur la base. Il est
reprenable : une nouvelle exécution écarte les révisions déjà traitées, les résultats sans contexte
utile et les erreurs de validation déjà auditées. `--all` et `--limit` sont volontairement
incompatibles afin que le périmètre de l'opération soit explicite.

La régénération depuis une ancienne version de prompt accepte le même mode. Commencer par une
simulation ciblée sur les brouillons :

```bash
npm run measures:regenerate-contexts -- \
  --election presidentielle-2027 \
  --from-prompt measure-context-v6 \
  --scope drafts \
  --all \
  --dry-run
```

Après vérification du nombre et du périmètre, remplacer `--dry-run` par `--apply`. Répéter la
commande pour chaque ancienne version réellement présente dans le rapport d'audit. Ne pas lancer
une régénération de contexte déjà publié sans décision éditoriale explicite.

```bash
npm run measures:regenerate-contexts -- \
  --election presidentielle-2027 \
  --from-prompt measure-context-v6 \
  --scope drafts \
  --all \
  --apply
```

Ces commandes créent uniquement des brouillons. La relecture et la publication restent des décisions
éditoriales distinctes dans l'administration. Les lots « Corrections de contexte » sont séparés des
premières publications. Chaque ligne mène à la fiche d'administration qui expose les extraits de
preuve avant confirmation.

## Ordre de livraison

1. Mesurer la couverture réelle des signaux et définir le tableau de bord d'enrichissement.
2. Alimenter et publier `details` sur un échantillon de 30 mesures couvrant plusieurs candidats et
   thèmes.
3. Valider les sous-thèmes et améliorer les mesures connexes.
4. Publier les qualifications sourcées déjà prévues par le modèle.
5. Ajouter la navigation par chapitre de programme si les imports fournissent une structure fiable.
6. Calibrer le prédicat d'indexation avec les données de production et Search Console.
7. Étendre progressivement le traitement, avec audit éditorial par lots.

## Critères de réussite

- un lecteur comprend ce qui est annoncé sans ouvrir immédiatement le PDF ;
- chaque précision reste traçable à une source ;
- aucune page ne contient un résumé redondant ou une appréciation de faisabilité ;
- les mesures proches sont réellement comparables ;
- le taux de retour vers les pages candidat, thème et programme augmente ;
- Search Console montre une progression des pages découvertes et utiles, sans hausse des pages
  explorées mais non indexées pour contenu insuffisant.
