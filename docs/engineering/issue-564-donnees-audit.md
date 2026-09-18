# #564 : données, import et audit comparatif (brouillon de PR 1)

État du 17 septembre 2026. Ce document accompagne la première PR demandée par
[Lamine](https://github.com/ironlam/poligraph/issues/564#issuecomment-5666062880).
Il ne fixe pas le périmètre définitif et n'active aucun indicateur public.

## Ce que contient cette PR

- Conservation du code et du libellé officiels du type de scrutin, distincts du
  classement interne `Scrutin.type`.
- Origine des dossiers issue des actes de dépôt initial, avec référence, règle,
  empreinte et provenance. Les contradictions et informations absentes restent
  `INDETERMINEE`. Le libellé de procédure mixte n'est pas une preuve d'origine.
- Décomptes officiels par `organeRef` à la date du scrutin, dans une table séparée
  des anciennes positions de groupe. Les valeurs manquantes restent nulles.
- Modes de rattrapage des métadonnées des enregistrements existants, sans
  réécriture des votes individuels, avec simulation sans écriture en base.
- Audit reproductible hors base, comparaison avec/sans `SPS` et liste des exclusions.

Les concordances, les pages publiques et leurs tris restent inchangés. Aucune
migration ni synchronisation de production n'a été exécutée pour préparer ce brouillon.

## Pourquoi tester SPS indépendamment de Datan

Le [règlement et la fiche officielle sur les votes](https://www.assemblee-nationale.fr/dyn/synthese/fonctionnement-assemblee-nationale/travail-legislatif/les-votes-a-l-assemblee-nationale)
décrivent le vote solennel comme une organisation du scrutin décidée par la
Conférence des présidents, notamment pour favoriser la présence des députés.
Ce critère décrit une procédure, pas l'origine d'un texte.

Un indicateur limité aux SPS mesure donc un sous-ensemble des votes sur les projets
gouvernementaux. Il peut être pertinent pour étudier les votes solennels, mais il
ne peut pas être présenté comme couvrant tous les votes d'ensemble. La proximité
d'un résultat avec Datan n'est ni un critère de sélection ni une validation.

Le contrôle de l'objet du vote reste nécessaire dans les deux variantes. L'audit
trouve notamment des SPS sur une partie budgétaire (n°438 et n°4241), des
déclarations du Gouvernement et un article de résolution. Ils ne deviennent pas
des votes sur l'ensemble d'un projet par le seul fait d'être SPS.

## Résultat sur les archives téléchargées le 17 septembre 2026

Les fichiers contiennent 8 434 scrutins de la XVIIe législature et 3 129 dossiers.
L'archive des dossiers inclut aussi des dossiers initiés sous une législature
précédente. L'audit les conserve pour les rattachements.

| Population                                                | Sans filtre SPS | Avec filtre SPS |
| --------------------------------------------------------- | --------------: | --------------: |
| Titres candidats : vote sur l'ensemble d'un projet        |              42 |              32 |
| Origine confirmée et rattachement direct `voteRef` unique |              35 |              29 |
| Candidats dont le lien dossier doit encore être vérifié   |               7 |               3 |

Les 35 scrutins confirmés portent sur 24 dossiers distincts. Chaque lecture compte
séparément : on compare des scrutins, pas des lois dédupliquées. Les décomptes
par groupe de ces 35 scrutins sont complets et leurs sommes correspondent aux
totaux officiels POUR/CONTRE/ABSTENTION. Cela ne valide pas encore une
correspondance avec les groupes internes de Poligraph.

Ces chiffres décrivent les archives sources, **pas l'état de la base de production**.
Le corpus confirmé est conservateur : les sept rapprochements par séance ou titre
ne sont pas déclarés faux, mais leur vérification reste une étape explicite.

### Six scrutins confirmés écartés par le seul filtre SPS

| Scrutin officiel                                                | Objet abrégé pour repérage                             | Lecture          |
| --------------------------------------------------------------- | ------------------------------------------------------ | ---------------- |
| [518](https://www.assemblee-nationale.fr/dyn/17/scrutins/518)   | Finances de fin de gestion 2024                        | CMP              |
| [1203](https://www.assemblee-nationale.fr/dyn/17/scrutins/1203) | Adaptation au droit de l'Union européenne              | CMP              |
| [2104](https://www.assemblee-nationale.fr/dyn/17/scrutins/2104) | Transfert à l'État des enseignants de Wallis-et-Futuna | Première lecture |
| [3055](https://www.assemblee-nationale.fr/dyn/17/scrutins/3055) | Emploi des salariés expérimentés et dialogue social    | CMP              |
| [6180](https://www.assemblee-nationale.fr/dyn/17/scrutins/6180) | Restitution de biens culturels                         | Première lecture |
| [7401](https://www.assemblee-nationale.fr/dyn/17/scrutins/7401) | Habilitation de l'assemblée de Martinique              | Première lecture |

L'export fournit les intitulés officiels intégraux. Les quatre autres candidats
ordinaires, n°2900, 2935, 3936 et 6346, figurent dans la liste des liens à vérifier,
pas dans ces six scrutins confirmés.

### Sept liens à vérifier avant un calcul définitif

| Scrutin | Type | Dossier proposé par le résolveur | Preuve actuellement disponible |
| ------- | ---- | -------------------------------- | ------------------------------ |
| 844     | SPS  | DLR5L16N49726                    | Séance unique                  |
| 2900    | SPO  | DLR5L17N52002                    | Séance unique                  |
| 2935    | SPO  | DLR5L17N52040                    | Séance unique                  |
| 3936    | SPO  | DLR5L17N53135                    | Rapprochement de titre         |
| 6346    | SPO  | DLR5L17N52635                    | Rapprochement de titre         |
| 6736    | SPS  | DLR5L17N54083                    | Rapprochement de titre         |
| 7454    | SPS  | DLR5L17N54218                    | Rapprochement de titre         |

Le cas n°844 explique pourquoi le rattrapage des origines ne doit pas filtrer les
dossiers sur `L17` dans leur identifiant. Un scrutin de la XVIIe législature peut
concerner un dossier initié sous la XVIe.

## Reproduire l'audit sans base de données

Télécharger et conserver les deux archives officielles, sans les ajouter au dépôt :

- [Scrutins](https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip)
- [Dossiers](https://data.assemblee-nationale.fr/static/openData/repository/17/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip)

```sh
npm run audit:government-support -- --scrutins=.tmp/issue-564/scrutins.zip --dossiers=.tmp/issue-564/dossiers.zip
```

Sous PowerShell, utiliser `npm.cmd` pour transmettre correctement les options.
Le script ne charge pas `.env`, n'importe pas le client DB et ne fait pas d'appel
réseau. Il écrit uniquement `audit.json` et `audit.md` sous `.tmp/issue-564/audit`
(ou le dossier fourni avec `--out`). Il refuse les JSON corrompus, doublons et
scrutins d'une autre législature au lieu de produire un rapport partiel silencieux.

L'export JSON conserve une ligne pour chaque scrutin, son origine et sa preuve,
son rattachement, les anomalies, les décomptes et les indicateurs d'appartenance
aux deux corpus. Le rapport Markdown liste tous les candidats à vérifier et les
scrutins écartés par SPS. Il ne calcule pas un taux de soutien.

Empreintes SHA-256 du jeu étudié :

```text
Scrutins.json.zip (26 317 479 octets)
ea35fe7b440e4c4223bc7b795c66d7927c9f9f32f7b991a1b3bbae362b2ae1fa
Dossiers_Legislatifs.json.zip (10 424 991 octets)
7cfb714379fffdc607c71f21121c095fdebbda567ae007eba989c86c146af782
```

Les URL sont évolutives. Les conserver seules ne permet pas de reproduire ces
chiffres : il faut conserver les archives correspondant aux empreintes.

## Plan de rattrapage, exécution réservée au mainteneur

1. **Préparation.** Sauvegarder la base. Geler les synchronisations concurrentes.
   Conserver les archives et empreintes. Refaire l'audit ci-dessus. Sur une copie
   de la base, inventorier les identifiants présents/absents et tester la migration.
2. **Migration additive.** Examiner puis appliquer
   `20260917100000_add_government_support_sources`. Pas de suppression de colonne,
   pas de réécriture de `Vote`. La nouvelle table de décomptes est interne, RLS
   activée et accès direct `PUBLIC/anon/authenticated` retiré. Aucun taux à zéro
   n'est initialisé. Régénérer Prisma et redémarrer les processus.
3. **Simulation des métadonnées.** Exécuter les deux modes ci-dessous sur la copie
   de base, puis en production uniquement sur décision du mainteneur. Ils lisent
   la base pour identifier les enregistrements existants, mais n'écrivent pas en
   mode simulation. Garder les journaux et investiguer tout élément manquant.

   ```sh
   npm run sync:legislation -- --leg=17 --origin-only --dry-run
   npm run sync:scrutins-an -- --leg=17 --official-groups-only --dry-run
   ```

4. **Application contrôlée.** Après comparaison des simulations, reprendre les
   mêmes commandes sans `--dry-run`. Ne pas lancer la synchronisation générale
   pour ce rattrapage. Les dossiers terminés et les dossiers antérieurs présents
   dans l'archive restent concernés. Les enregistrements absents de la base sont
   comptés et ignorés, pas créés implicitement.
5. **Reprise et contrôles.** Le traitement est séquentiel, un dossier ou scrutin
   à la fois. Une relance reprend par identifiant officiel et produit les mêmes
   valeurs métier ; les horodatages d'observation peuvent changer. Le snapshot
   de décomptes est remplacé atomiquement par scrutin, indépendamment du hash des
   votes individuels. Le mode groupes force la relecture de l'archive et ne doit
   pas marquer l'import nominatif comme terminé. En cas d'erreur, corriger et
   relancer avant toute exploitation publique.
6. **Réconciliation.** Comparer les données importées aux archives : valeurs et
   sommes des décomptes, doublons, groupes inconnus, origines et rattachements.
   Vérifier les sept liens ci-dessus. Aucun résultat partiel n'est mis en service
   par cette PR. Réactiver les synchronisations seulement après contrôle.
7. **Retour arrière.** Avant tout consommateur public, désactiver les nouvelles
   écritures en revenant au code précédent, mais laisser les colonnes additives
   et la table en place. Ne pas supprimer des votes pour annuler cet import.
   En cas de mauvaise donnée source, restaurer les seules métadonnées concernées
   depuis la sauvegarde ou réimporter une archive validée. Toute suppression de
   schéma demanderait une migration dédiée et une vérification des consommateurs.

Les commandes de synchronisation téléchargent les archives courantes : le
mainteneur doit vérifier leur empreinte au moment du rattrapage et refaire l'audit
si la version diffère. Ce brouillon ne prétend pas avoir testé une migration sur
PostgreSQL ni vérifié le contenu de la base distante.

## Décisions et travaux pour la deuxième PR

- Confirmer avec Lamine le périmètre : tous les votes d'ensemble gouvernementaux,
  ou seulement les SPS avec un libellé explicite. Ne pas régler ce choix sur un taux.
- Valider les liens non directs et la correspondance historique `organeRef` vers
  les groupes Poligraph, avec législature et période d'existence. Il n'existe pas
  encore de référence AN sur `ParliamentaryGroup` ; aucun nom approché n'est utilisé
  pour contourner ce manque dans cette PR. Les non-inscrits doivent aussi être
  distingués d'un groupe parlementaire constitué.
- Implémenter la position dominante, les égalités exclues, les dénominateurs et
  motifs visibles, les snapshots de calcul complets et les tests correspondants.
- Remplacer les cartes AN selon l'accord, conserver les concordances sur les
  fiches, publier la méthode et les listes justificatives dans la même livraison.

La deuxième PR dépend de ces validations. Aucune modification du Sénat n'est prévue.
