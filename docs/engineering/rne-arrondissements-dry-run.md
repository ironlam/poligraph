# RNE arrondissements : dry-run et succession

Le service des arrondissements est distinct de `syncRNEMaires`. Le verrou
de #893 ne le protège pas. Sur la base `bf01c27b`, une succession clôt le
mandat précédent avant de vérifier `dryRun`, y compris en simulation.

Consigne opérationnelle : ne pas utiliser cet importeur, dry-run compris,
sur une révision dépourvue du correctif. Cette consigne ne prouve pas que
les processus et les machines d'exécution ont été arrêtés ou actualisés.

## Correctif

- Aucune mutation ni transaction en dry-run, y compris lors d'une succession.
- Clôture et création du mandat (avec fiche DRAFT si nécessaire) dans la même
  transaction. Une erreur doit sortir du callback pour annuler la transaction.
- Clôture conditionnée au caractère encore courant du mandat observé.
- Une même date sert à clôturer le prédécesseur et ouvrir le successeur.
- Compteurs réels incrémentés après la transaction ; compteurs dry-run
  prévisionnels uniquement.

Les tests utilisent des doubles de base et de réseau. Ils couvrent le dry-run
de succession avec fiche connue ou nouvelle, les deux chemins de création,
les erreurs et l'interdiction des mutations hors transaction. Ils ne constituent
pas un test du rollback PostgreSQL réel, ni une validation des données publiques.

## Confinement opérationnel restant à établir

Avant de déclarer le confinement acquis, identifier le responsable des
environnements d'exécution, inventorier leurs révisions et processus, vérifier
les anciens runs GitHub (actifs ou en attente), puis actualiser les checkouts.
Ne pas relancer un ancien run. Vérifier le verrou de #893 avec une base fictive
sur les révisions effectivement utilisées.

L'étape RNE de `sync:full` échoue volontairement avec #893. Les étapes suivantes
peuvent néanmoins écrire : ne pas relancer automatiquement l'orchestrateur ou
sa reprise depuis RNE. Une fin en erreur n'implique pas l'absence de mutations.

## Conditions de reprise du service maires

Ce correctif ne lève pas #893. Sa levée exige séparément : identité et historique
validés, absence de clôtures sur import partiel ou incomplet, atomicité des
écritures et fusions, revue de la signification/date/provenance des affiliations,
audit des altérations passées et réparations sourcées. Un code commune ne doit
pas être traité comme identifiant de personne dans le resolver.

La concurrence entre imports, les dates manquantes et le rapprochement du
titulaire courant sur son seul nom restent hors de ce correctif ciblé.
Fusionner ce correctif ne constitue pas une autorisation de lancer un import
réel, ni une preuve de confinement global.
