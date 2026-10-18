# Lot 5C : cadrage technique de l'import brut des archives de l'Assemblée

Statut : cadrage et plan de PR. **Aucun code, aucune migration, aucune exécution.** Le lot 5B est
fusionné (PR #1132, `288b6fa`, vérifié par le contenu sur `main`). Les décisions de clôture du 5B
sont reprises telles quelles : gardes par ligne conservées, index `active_key` conservé
provisoirement, optimisation des index renvoyée à un benchmark comparatif séparé, aucune migration
distante, aucun import officiel.

Références : `parlement-historique-lot5-architecture-v2.md` (sections 4 et 8),
`parlement-historique-lot5b-schema.md`, `parlement-historique-lot5b-execution.md`.

## 1. Ce que la lecture du 5A et du 5B apprend avant de concevoir

Sept écarts entre ce que le schéma attend et ce que le code livré produit. Ils changent le plan, donc
ils passent avant l'importeur.

| #   | Constat (vérifié dans le code)                                                                                                                                                       | Conséquence                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Rien ne calcule `rawHash`.** `versioning.ts` le reçoit déjà calculé, aucun parseur ne le produit                                                                                   | Il faut définir ce que l'on hache. Proposition : `hashOf` de la projection canonique de la ligne, et `memberHash` (octets du fichier JSON) en plus, pour qu'un changement dans un champ non projeté reste visible |
| 2   | **La cohérence des décomptes n'est stockée nulle part.** Le parseur de scrutin la calcule (`COHERENT`, `COUNT_MISMATCH`, `UNVERIFIABLE`) mais le schéma n'a pas de colonne pour elle | Sans elle, un run lu depuis la base ne saurait pas qu'un scrutin discordant ne doit alimenter aucune position publiable. C'est **le point P0 du lot** : voir 3.1                                                  |
| 3   | Le parseur ne lit ni `preseance`, ni `datePublication`, ni `parDelegation`, alors que le schéma a `precedence`, `publicationDate` et `byDelegation`                                  | Les colonnes resteraient vides alors que la source les publie. Extension du parseur, donc nouvelle `parserVersion`                                                                                                |
| 4   | `memberHash` n'existe que sur `ScrutinVoterAttestation` ; les quatre autres tables de versions n'ont que `sourceMember`                                                              | Un changement d'un fichier d'acteur dans un champ non projeté ne laisserait aucune trace en base (il resterait dans l'archive). À décider : 3.2                                                                   |
| 5   | `parserVersion` est une constante de `scripts/lib/historical-groups-validation.ts`, hors du module pur                                                                               | Elle doit vivre dans le module et correspondre à une étiquette git, sinon « rejouer avec la `parserVersion` du snapshot » (architecture 4.7) n'a pas de code à rejouer                                            |
| 6   | `sourceAsOf` (le `Last-Modified` du serveur) n'est lisible ni dans l'archive ni par la commande de validation : saisi à la main dans la baseline                                     | Le télécharger doit le consigner. C'est le seul moyen de borner `OPEN_AT_SNAPSHOT`                                                                                                                                |
| 7   | `recordCounts` est un `jsonb` dont le contenu n'est pas défini                                                                                                                       | Fixer son schéma : il porte les rejets, le Congrès et les compteurs par genre, donc les chiffres que `verify` comparera                                                                                           |

## 2. Architecture de l'importeur

### 2.1 Quatre programmes, un seul qui écrit

Le principe : **celui qui a le réseau n'a pas la base, celui qui a la base n'a pas le réseau.**

| Programme         | Réseau           | Base          | Écrit                            | Rôle                                                                         |
| ----------------- | ---------------- | ------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `fetch-archives`  | oui, hôtes figés | non           | un dossier local et un manifeste | Télécharge sans reprise, vérifie taille et SHA-256, consigne `Last-Modified` |
| `store-archives`  | stockage seul    | non           | le stockage privé                | Dépose les octets sous leur empreinte, vérifie à la relecture                |
| `import-an`       | non              | oui           | la base (avec `--apply`)         | Analyse, compare, planifie, applique                                         |
| `verify-snapshot` | non              | lecture seule | rien                             | Contrôles de cohérence (section 4)                                           |

Le manifeste (`manifest.json`) relie les deux mondes : pour chaque archive, `sha256`, `byteSize`,
`url`, `fetchedAt`, `sourceAsOf`, `contentLength`, `storageRef`. L'importeur ne reçoit que des
fichiers locaux et ce manifeste : aucune URL ne compose un chemin, aucune entrée utilisateur ne
compose une requête.

### 2.2 Phases de `import-an`

1. **Cible.** Preuve d'identité de la base visée (section 6). Échec = arrêt avant toute lecture
   utile.
2. **Intégrité.** Taille, SHA-256 et structure de chaque archive contre le manifeste ; limites ZIP
   et refus d'entrée douteuse du lot 5A-2 (`historical-groups-archive.ts`), réutilisés.
3. **Analyse.** Parseurs purs. Compteurs d'acceptés, rejetés et hors périmètre. **Tout rejet
   arrête l'import** sans l'indicateur `--accept-rejections`, qui consigne le motif et le nombre.
   Le Congrès est compté, jamais écrit.
4. **Contrôles bloquants** de 8.2 (section 4).
5. **Plan.** État courant lu en base (`toSeq IS NULL`), puis `diffAgainstCurrent` par genre : `ADDED`,
   `UNCHANGED`, `CORRECTED`, `REMOVED`. Garde-fou : plus de 1 % de retraits sur un genre arrête
   l'import (`exceedsRemovalGuard`).
6. **Rapport.** JSON sans donnée personnelle : compteurs, différences par genre, empreintes
   (`stateHash` prévu, `inputHash` du plan), diagnostics éditoriaux (section 8). Son SHA-256 est le
   jeton de confirmation.
7. **Application**, seulement avec `--apply --confirm <sha256 du rapport>`. Le plan est **recalculé**
   dans la transaction : un état de base qui a bougé depuis le rapport change son empreinte et
   l'application refuse.

### 2.3 Dry-run par défaut, garanti par la connexion

Le dry-run n'est pas « un `if` qui n'écrit pas ». Il ouvre une transaction `READ ONLY` sur une
connexion dont `default_transaction_read_only = on` : un défaut du code ne pourrait pas écrire, la
base le refuserait (SQLSTATE `25006`). Un test d'intégration compare `pg_stat_user_tables`
(`n_tup_ins`, `n_tup_upd`, `n_tup_del`) avant et après un dry-run.

### 2.4 L'application : une transaction par flux, sans publication

- Un verrou consultatif de session par flux (`pg_try_advisory_lock`) : un second importeur refuse
  explicitement au lieu d'attendre.
- Ordre : artefact (si absent), snapshot (le numéro suivant, les gardes de 5B le vérifient), fermeture
  des versions (`CORRECTED`, `REMOVED`) **avant** l'insertion des nouvelles, puis les `ADDED`.
- Avant le `COMMIT` : `stateHash` recalculé **depuis les lignes de la base** et comparé à celui
  du plan, comptes par genre comparés à `recordCounts`. Écart = `ROLLBACK`.
- **L'importeur ne publie jamais.** Le snapshot reste sans décision, donc considéré `QUARANTINED`
  (architecture 4.1). La publication (`RELEASED`) est un geste humain distinct, après `verify-snapshot`.
- Lots d'insertion par `INSERT ... SELECT unnest(...)` de quelques milliers de lignes, dans la même
  transaction. Connexion directe (`DIRECT_URL`), jamais le pooleur : `statement_timeout` y est
  appliqué par le serveur et les sessions y fuient (`docs/engineering/db-statement-timeout.md`).
  `statement_timeout` du rôle d'import porté par le rôle lui-même (section 5).

### 2.5 Idempotence

| Situation                                                | Comportement                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mêmes octets, même `parserVersion`, déjà importés        | Aucune écriture. Le rapport dit « déjà au snapshot N » et `verify-snapshot` est lancé                                                            |
| Mêmes octets, `parserVersion` nouvelle                   | Nouveau snapshot (la contrainte `(stream, artifact, parserVersion)` l'exige). Le rapport attribue les différences à l'analyseur, pas à la source |
| Octets différents (AMO30 et la 17e changent chaque jour) | Nouveau snapshot, différences par genre, garde-fou de retrait                                                                                    |
| Même diff rejoué après un échec                          | Rien n'a été validé, donc rien à reprendre : l'échec d'une transaction ne laisse aucun état partiel                                              |

### 2.6 Alternative écartée pour l'instant : l'import repris par morceaux

Les gardes de 5B permettent d'écrire un snapshot en plusieurs transactions, tant qu'il est le dernier,
`VERIFIED` et sans décision. Un import repris est donc possible, avec un snapshot incomplet qui reste
en quarantaine. **Non retenu en première intention** : il ajoute un état (snapshot partiel visible) et
une logique de reprise, pour un bénéfice qui dépend d'une durée non mesurée (le benchmark du 5B donne
environ 9 min pour la 17e sur un conteneur sans réglage). À reconsidérer seulement si la mesure sur
une base jetable aux réglages réalistes (section 7) montre des coupures de connexion ou un dépassement.

## 3. Deux compléments de schéma, en migration distincte (5C-0)

Le schéma de 5B est fusionné. Ces ajouts sont **additifs**, écrits comme une nouvelle migration
manuelle, validés sur base jetable avant tout autre usage, et ne modifient aucune table de 5B.

### 3.1 Cohérence des décomptes : `ScrutinCountCheck` (P0)

Une table de versions comme les autres (mêmes gardes, mêmes contraintes d'exclusion), clé
`(stream, scrutinExternalId)` : `countCoherence` (`COHERENT`, `COUNT_MISMATCH`, `UNVERIFIABLE`),
`mismatchedGroups`, `syntheseMismatch`, `syntheseMismatchPCA`, les décomptes officiels de synthèse
(pour, contre, abstentions, non-votants), `miseAuPointListedVotants`, `sourceMember`, `memberHash`,
`rawHash`. Les décomptes **par groupe** restent dans l'archive : seule la conclusion et la synthèse
sont persistées, ce qui suffit à écarter un scrutin discordant et à auditer le motif.

Pourquoi en base et pas recalculé : un run lit la base, pas l'archive (architecture 6.5, condition 1).
Sans cette table, la règle « un scrutin discordant n'alimente aucune position publiable » ne pourrait
pas être appliquée sans relire l'archive, donc sans sortir du contrat de reproductibilité.

### 3.2 Empreinte de fichier sur les autres tables de versions (à décider)

Ajouter `memberHash` à `OfficialActor`, `OfficialOrganRecord`, `GroupMembershipRecord` et
`SeatMandateRecord`, comme `ScrutinVoterAttestation`. **Recommandé** : le coût est faible (une colonne
`text` de 64 caractères sur 15 000 lignes) et il rend un changement non projeté détectable en base.
Alternative : s'en remettre à l'archive restaurée, ce qui rend la détection dépendante du stockage.

### 3.3 Colonnes déjà là, à remplir

`precedence`, `publicationDate`, `byDelegation` : extension du parseur (5C-1).

## 4. Contrôles de cohérence entre les tables et les fichiers

`verify-snapshot <stream> <seq>` est en lecture seule (connexion `READ ONLY`) et s'exécute avant toute
publication. Elle échoue sur la première classe de défaut, avec la liste.

| Contrôle                                                                                                          | Seuil                                                                        | Source du contrôle                             |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| `stateHash` recalculé depuis les lignes à `seq`                                                                   | égal à `OfficialSourceSnapshot.stateHash`                                    | tables                                         |
| **Deux voies de rejeu** : archive restaurée, ré-analysée avec la `parserVersion` du snapshot, `stateHash` calculé | égal à celui de la base                                                      | archive + tables                               |
| Comptes par genre                                                                                                 | égaux à `recordCounts`                                                       | tables                                         |
| Mandat de groupe vers organe, au même snapshot                                                                    | 0 orphelin                                                                   | tables (pas de clé étrangère possible, 5B 3.5) |
| Attestation vers acteur, organe publié (hors `PO0`), mandat de siège, au même snapshot                            | 0 orphelin, `PO0` compté et non bloquant                                     | tables                                         |
| `startDate > endDate`, doublon de clé, recouvrement de deux organes distincts (législatures couvertes)            | 0                                                                            | tables                                         |
| Mandat de siège de chaque vote : même acteur, couvre la date (bornes incluses)                                    | 0 hors intervalle fermé, l'écart du jour de fin égal à la baseline           | tables                                         |
| Catégories exclusives (2.3 du document) et jours de bord                                                          | égaux à la baseline pour des octets identiques, rapport de différences sinon | `official-validation.ts` sur les lignes lues   |
| Échantillon de N lignes tirées au hasard par genre, comparées champ par champ au fichier restauré                 | 0 écart                                                                      | archive + tables                               |
| Conservation : acceptés + rejetés + hors périmètre = fichiers de l'archive                                        | égalité                                                                      | `recordCounts`                                 |

Le contrôle des catégories réutilise `classifyVote` : la classification reste **indépendante du
résolveur** (elle ne l'importe pas, un garde d'architecture le vérifie déjà), ce qui garde le
recoupement réel.

## 5. Restauration depuis un stockage privé

Principe : **l'URL de l'Assemblée n'est pas une archive.** Elle est réécrite en place (`Last-Modified`
du 17 octobre pour AMO30 et la 17e), et rien ne garantit qu'elle conserve une ancienne version.

### 5.1 Adressage et immutabilité

Objet nommé par son empreinte : `historical-groups/artifacts/<sha256>.zip`. Jamais écrasé (le nom
contient le contenu). `SourceArtifact.storageKind` vaut `BLOB_PRIVATE` ou `LOCAL_OFFLINE`, la clé
`storageRef` n'est jamais une URL (la base le refuse déjà). Deux copies au minimum : stockage privé et
copie hors ligne. Les archives sont des données ouvertes : « privé » vise l'intégrité, la disponibilité
et l'absence de lien public, pas la confidentialité.

### 5.2 Choix du stockage (arbitrage A9, à trancher)

| Option                                   | Pour                                                                                | Contre                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vercel Blob privé                        | Déjà dans le projet (`@vercel/blob`), mais **pour des portraits publics seulement** | Magasin privé à créer, jeton distinct, accès privé à confirmer dans le tableau de bord (je ne l'ai pas vu) |
| Bucket privé Supabase                    | Même fournisseur que la base, droits par rôle                                       | Dépendance au fournisseur de la base elle-même : une panne ou une erreur de projet touche les deux         |
| Copie hors ligne seule (chiffrée ou non) | Aucune dépendance                                                                   | Pas de restauration automatisée                                                                            |

Recommandation : un bucket privé **hors du projet de la base** plus la copie hors ligne. À confirmer
avec vous avant d'écrire un adaptateur : je ne propose pas de configuration que je n'ai pas vue.

### 5.3 Restauration

`restore-archive <sha256>` : lecture de `storageRef`, taille et SHA-256 recalculés, **refus de toute
différence**, extraction en mémoire (pas de dossier), puis ré-analyse avec le code de la
`parserVersion` du snapshot. Ce code doit être récupérable : chaque `parserVersion` publiée correspond
à une étiquette git `historical-groups-parser/<version>`, créée au moment du merge qui change la version.
Un **exercice de restauration** fait partie des critères d'acceptation : sur base jetable, importer,
supprimer la copie locale, restaurer depuis le stockage, rejouer, retrouver le `stateHash`.

### 5.4 Cas de panne

| Panne                                     | Effet                                                                                                                      | Traitement                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Dépôt réussi, transaction de base échouée | Objet orphelin dans le stockage                                                                                            | Inoffensif (adressé par contenu). Réutilisé au prochain essai |
| Transaction réussie, dépôt jamais fait    | **Interdit** : l'ordre impose le dépôt et sa relecture vérifiée avant toute écriture de ligne (architecture 8.1, règle 10) | `import-an` refuse un `storageRef` non relu                   |
| Objet corrompu à la restauration          | Refus explicite                                                                                                            | Récupérer la seconde copie ; `lastVerifiedAt` ne bouge pas    |
| Stockage indisponible                     | Pas d'import ; les snapshots déjà en base restent lisibles                                                                 | Aucun repli sur l'URL de l'Assemblée                          |

## 6. Un rôle PostgreSQL dédié à l'import

Le rôle applicatif habituel (le propriétaire des tables) **ne reçoit pas `BYPASSRLS`** et n'est pas
utilisé pour l'import. Le contrat SEC-02 du dépôt pose déjà un rôle serveur `BYPASSRLS` en contrat,
donc le motif existe ; la question est de savoir si l'importeur en a besoin.

### 6.1 Deux manières de donner l'accès au rôle d'import

| Approche                                                                   | Pour                                                                                                                                                                                        | Contre                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Politiques RLS `TO` le rôle d'import** (`USING (true) WITH CHECK (...)`) | Aucun attribut de contournement ; permet de **restreindre les valeurs** : sur `SnapshotDecision`, `WITH CHECK (status = 'QUARANTINED')`, donc l'importeur ne peut techniquement pas publier | Une politique par table et par commande ; il faut vérifier que SEC-02 et SEC-03 acceptent une politique visant un rôle précis                                                                               |
| `BYPASSRLS` sur un rôle dédié                                              | Une ligne                                                                                                                                                                                   | Contourne tout, y compris les restrictions de valeurs ; **la création peut exiger un droit que le rôle `postgres` de Supabase n'a peut-être pas** (à vérifier sur la préproduction, je ne l'ai pas observé) |

**Recommandation : les politiques.** L'effet notable est qu'une publication par l'importeur devient
impossible, et plus seulement interdite par convention (`decidedByKind` repose sur la déclaration de
l'appelant, 5B 4).

### 6.2 Privilèges

`SELECT, INSERT` sur les tables alimentées, `UPDATE ("toSeq")` sur les tables de versions, usage de la
séquence des décisions, `SELECT` sur `OfficialSourceSnapshot` et `SnapshotDecision` (les gardes les
lisent avec les droits de l'écrivain, mesuré en 5B). **Aucun** `DELETE`, `TRUNCATE`, DDL, droit sur
les tables de runs, ni sur les journaux d'identité et de continuité. Le rôle de lecture de
`verify-snapshot` est distinct et en lecture seule.

### 6.3 Exploitation

- `NOLOGIN` en temps normal ; `LOGIN` avec `VALID UNTIL` pour la durée de l'opération, puis retour à
  `NOLOGIN`. Mot de passe propre au rôle, dans un fichier local dédié (pas `.env`), jamais dans les
  variables de Vercel, renouvelé après chaque usage.
- Réglages portés par le rôle : `statement_timeout` adapté à l'opération (le défaut serveur de deux
  minutes ne suffit pas), `idle_in_transaction_session_timeout`, `CONNECTION LIMIT` à 2,
  `application_name = 'hg-import'`.
- Création du rôle : manuelle, dans le tableau de bord (c'est la pratique du projet), dans une
  migration manuelle distincte (5C-0), jamais mêlée à un import.

## 7. Preuve d'isolation de la préproduction par rapport à la production

`.env` et `.env.prod` visent la même base de production ; seul `.env.staging` est distinct. Cette
phrase est une **déclaration**, pas une preuve. Le protocole ci-dessous la transforme en preuve avant
toute écriture sur la préproduction, et se rejoue à chaque session.

| #   | Étape                                                                                                                                                                                                                                                                           | Écrit                                   | Résultat attendu                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Empreintes sans secret.** Pour chaque fichier d'environnement, extraire hôte, port, base, utilisateur, référence de projet, n'imprimer que des empreintes SHA-256 tronquées et les quatre derniers caractères de la référence                                                 | rien                                    | Les empreintes de préproduction diffèrent de celles de `.env` et `.env.prod`, sur l'hôte **et** la base **et** la référence                            |
| 2   | **Marqueur de base.** La préproduction porte `hg.environment = 'staging'` posé à la main (`ALTER DATABASE ... SET`) ; la production n'en porte pas                                                                                                                              | un réglage de base sur la préproduction | `current_setting('hg.environment', true)` vaut `staging` sur la cible, `NULL` sur la production                                                        |
| 3   | **Preuve par jeton aléatoire.** Poser un jeton aléatoire comme réglage de base sur la préproduction, le relire côté préproduction, puis le chercher en **lecture seule** côté production                                                                                        | un réglage, retiré ensuite              | Présent à un endroit, absent à l'autre : deux catalogues distincts, que l'égalité de deux chaînes de connexion ne prouve pas                           |
| 4   | **Identité du serveur** quand le rôle peut la lire (`system_identifier`)                                                                                                                                                                                                        | rien                                    | Différente de celle de la production, ou non lisible (consigné tel quel)                                                                               |
| 5   | **Variables hébergées.** Lister les noms et cibles des variables de Vercel et de GitHub, sans valeurs                                                                                                                                                                           | rien                                    | Aucune variable de production ne contient une chaîne de la préproduction, et inversement. À confirmer dans les tableaux de bord : je ne les ai pas vus |
| 6   | **Garde de l'importeur.** `import-an` exige `--target staging`, l'empreinte attendue en variable et le marqueur de l'étape 2, avant sa première écriture                                                                                                                        | rien                                    | Un refus avec toute autre cible, même si une variable d'environnement la fournit                                                                       |
| 7   | **Chaînes automatiques.** Le flux `staging-migrate.yml` applique `prisma migrate deploy` à chaque poussée sur la branche `staging` touchant `prisma/**`. Vérifier qu'aucune migration du lot n'y entre par mégarde, et qu'aucun flux n'écrit en production depuis cette branche | rien                                    | Le SQL manuel du lot n'est exécuté par aucun flux                                                                                                      |

Les empreintes et les sorties sont consignées dans le rapport d'import, **sans** hôte, utilisateur ni
mot de passe. L'étape 3 écrit sur la préproduction : elle suppose donc l'accord d'écriture sur celle-ci,
et se fait d'abord à blanc sur deux conteneurs locaux pour valider le protocole lui-même.

## 8. Tests de concurrence et de reprise après échec

À écrire sur le conteneur jetable (même garde que 5B : URL épinglée, marqueur, variables de
production exclues). Les cas de 5B (huit écrivains, publication contre écrivain, successeur contre
écrivain, fin de run) ne sont pas répétés.

| Cas                                                                                                                         | Attendu                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Deux `import-an` sur le même flux                                                                                           | Le second refuse (verrou de session), explicitement, sans attendre                                                     |
| Deux `import-an` sur deux flux                                                                                              | Les deux réussissent, sans interblocage                                                                                |
| `import-an` pendant une publication du snapshot précédent                                                                   | Attente puis succès, ou refus propre, jamais d'écriture dans un snapshot gelé                                          |
| Connexion coupée en cours de transaction (processus tué, puis `pg_terminate_backend`, puis conteneur mis en pause)          | Aucun snapshot, aucune ligne : retour à l'état d'avant. Un nouvel essai donne le même `stateHash`                      |
| Coupure après `COMMIT`, avant l'affichage du rapport                                                                        | Le rejeu détecte « déjà au snapshot N », `verify-snapshot` passe                                                       |
| Dépôt au stockage réussi, base en échec                                                                                     | Objet orphelin, réutilisé à l'essai suivant                                                                            |
| `stateHash` recalculé qui diffère                                                                                           | `ROLLBACK`, code de sortie non nul, aucune ligne                                                                       |
| Base modifiée entre le rapport et `--apply`                                                                                 | Refus : l'empreinte du plan a changé                                                                                   |
| Garde-fou de retrait dépassé                                                                                                | Arrêt avant écriture ; reprise seulement avec l'indicateur explicite et un rapport relu                                |
| Mêmes octets, `parserVersion` nouvelle                                                                                      | Nouveau snapshot, différences attribuées à l'analyseur                                                                 |
| Correction rétroactive (1 % d'enregistrements changés)                                                                      | Fermeture avant insertion, `verify-snapshot` passe                                                                     |
| Dry-run                                                                                                                     | Aucune écriture (compteurs de `pg_stat_user_tables` inchangés), refus d'un `INSERT` forcé par la connexion `READ ONLY` |
| Importeur avec le rôle dédié : tentative de `RELEASED`, de `DELETE`, de `TRUNCATE`, de DDL, d'accès aux journaux d'identité | Toutes refusées                                                                                                        |
| Archive tronquée, corrompue, avec nom douteux, doublon                                                                      | Refus à l'intégrité, avant toute connexion en écriture                                                                 |

## 9. Mesure des volumes, durées et coûts sur base jetable

Trois jeux, dans cet ordre, **sur le conteneur local uniquement** :

1. **Synthétique** (comme 5B), pour comparer des variantes sans bruit : avec et sans `active_key`,
   `shared_buffers` et `maintenance_work_mem` réalistes, lots d'insertion de 1 000, 5 000 et 20 000
   lignes. Cela porte le **benchmark comparatif séparé** que vous avez demandé pour les index.
2. **Forme réelle** : mêmes volumes (2 399 520 attestations, 7 772 mandats de groupe, 3 960 mandats de
   siège, 63 organes, 3 175 acteurs), loi de distribution relevée sur les fichiers.
3. **Fichiers officiels** passés dans le vrai chemin (`fetch`, `store`, `import`, `verify`) sur la
   base jetable. **Demande de validation distincte** : cela ne touche aucune base partagée, mais c'est
   le premier import officiel, et vous avez réservé ce geste.

Mesures consignées : durée par phase, débit, pic de mémoire de l'importeur, taille des tables et des
index, WAL produit, durée de `verify-snapshot`, durée d'une correction rétroactive de 1 %. Une ligne
de **coût** : espace disque (environ 1,5 Go pour un jeu complet, à rapprocher du quota de la
préproduction et de la production, que je ne connais pas) et temps de connexion directe.

## 10. Préserver les contrôles éditoriaux

L'importeur **ne résout rien** : il conserve des preuves et signale. Aucun de ces contrôles n'est
déplacé dans l'importeur, chacun reste là où il est testé.

| Contrôle              | Dans l'import                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PO0`                 | Stocké tel que publié (`publishedOrganRef = 'PO0'`), compté dans le rapport, jamais remplacé. Test : `PO0` est lu et réécrit à l'identique                                                                                                                                |
| Conflits E1/E2        | Hors de l'import. Les deux sources sont stockées séparément (attestations et mandats). La classification de 5A-2 ne fait que les compter, le résolveur tranche, `CONFLICT` reste `CONFLICT`                                                                               |
| Dates incertaines     | `startState`, `endState` conservés (`UNKNOWN`, `OPEN_AT_SNAPSHOT`) ; `sourceAsOf` consigné à l'import pour borner la validité d'une fin ouverte. Aucune date inventée, aucune interprétation                                                                              |
| Scrutins discordants  | Toutes les attestations conservées. `ScrutinCountCheck` porte `COUNT_MISMATCH` (3.1) : la décision de publication la lira. **P0**                                                                                                                                         |
| Rapprochement par nom | Aucune lecture de nom, aucune colonne de nom (5B), aucune requête sur `Politician`. Un garde d'architecture interdit l'import de `db` ou de `Prisma` Politician dans le planificateur. Les liens d'identité restent des décisions du journal, jamais un effet de l'import |
| Mises au point        | Comptées (`miseAuPointListedVotants`), jamais appliquées. L'incertitude U4 reste ouverte                                                                                                                                                                                  |
| Congrès               | Compté dans `recordCounts`, jamais écrit comme scrutin de l'Assemblée                                                                                                                                                                                                     |

## 11. Plan de PR du lot 5C

Six PR, dans cet ordre, chacune en brouillon, sans exécution distante. Une PR ne démarre qu'après
validation de la précédente.

### 5C-0 : compléments de schéma et rôle d'import (migration manuelle, non exécutée)

- **Contenu** : table `ScrutinCountCheck` (3.1), `memberHash` sur les quatre autres tables si
  décidé (3.2), rôle d'import avec ses politiques (6), mêmes gardes que 5B, mêmes tests de conformité,
  générateur commun.
- **Critères d'acceptation** : le SQL passe les gardes SEC-02, SEC-03 et SEC-06 ; la comparaison de
  catalogues de 5B s'étend aux nouveaux objets ; tests d'intégration sur conteneur jetable (versions,
  refus de divergence, importeur sans `BYPASSRLS` qui écrit mais ne publie pas, ne supprime pas, ne
  lit pas les journaux d'identité) ; deuxième application sans effet ; rollback refusé si des lignes
  existent.

### 5C-1 : parseur étendu et empreintes

- **Contenu** : lecture de `preseance`, `datePublication`, `parDelegation` ; `rawHash` et `memberHash`
  canoniques ; `parserVersion` dans le module, avec son étiquette git ; schéma de `recordCounts`.
- **Critères d'acceptation** : `PARSER_VERSION_CHANGED` sur la baseline (le statut prévu en 5A-2) ; sur
  octets identiques, mêmes catégories exclusives à l'unité près ; un champ modifié dans un fichier
  change son `memberHash`, un champ non projeté ne change pas son `rawHash` ; déterminisme (aucune
  horloge, aucun réseau, garde d'architecture inchangé).

### 5C-2 : planificateur pur et rapport

- **Contenu** : projection des lignes, `diffAgainstCurrent` par genre, garde-fou de retrait,
  contrôles bloquants, rapport et son empreinte, aucun accès base ni réseau.
- **Critères d'acceptation** : rejouer un plan donne le même rapport octet pour octet ; propriétés :
  appliquer deux fois le même snapshot ne produit rien, l'ordre des fichiers ne change rien ;
  `stateHash` du plan égal à celui de `computeStateHash` ; 37 mutations volontaires du code détectées
  (comme en 5A-1).

### 5C-3 : téléchargeur, stockage, restauration (sans base)

- **Contenu** : `fetch-archives` (hôtes figés, HTTPS, taille égale à `content-length`, aucune
  reprise), `store-archives` avec une interface d'adaptateur et un adaptateur local, `restore-archive`,
  manifeste. L'adaptateur du stockage privé réel attend l'arbitrage A9.
- **Critères d'acceptation** : serveur de test local (aucun réseau en CI) : téléchargement tronqué,
  redirection vers un hôte non autorisé, `content-length` faux, archive corrompue, tous refusés ;
  exercice de restauration réussi sur fixtures ; aucune connexion à une base dans ce code (garde
  d'architecture).

### 5C-4 : exécuteur de base, dry-run, application, vérification

- **Contenu** : `import-an` (dry-run `READ ONLY`, `--apply --confirm`), `verify-snapshot`,
  `release-snapshot` séparé, verrou de session, rôle d'import.
- **Critères d'acceptation** : tous les cas de la section 8 passent sur conteneur jetable ; le dry-run
  n'écrit rien (compteurs) ; l'importeur ne publie pas ; `verify-snapshot` détecte une altération
  injectée (ligne modifiée par le propriétaire en transaction annulée, `stateHash` différent) ;
  mêmes garde-fous d'environnement que 5B.

### 5C-5 : protocole d'isolation et mesures

- **Contenu** : script du protocole de la section 7 (étapes 1 à 4 et 6), jeux de mesure de la
  section 9, rapport d'exécution, runbook de la préproduction (sans l'exécuter).
- **Critères d'acceptation** : le protocole échoue (refus explicite) quand on lui donne deux fois la
  même base, le réussit sur deux conteneurs distincts ; rapport de mesures avec chiffres et limites ;
  runbook relu.

### Au-delà : trois validations distinctes, pas des PR

1. Premier import des fichiers officiels sur base **jetable locale** (étape 3 de la section 9).
2. Répétition sur la **préproduction** (écritures, donc accord explicite et protocole de la section 7
   rejoué).
3. **Production** : décision séparée, geste manuel, aucun agent n'y exécute de migration ni d'import.

## 12. Risques

### P0 : bloquent le lot

| Risque                                                                                                                                                                   | Parade                                                                                                                                      | Preuve exigée                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Écrire sur la production en croyant viser la préproduction** (les trois fichiers d'environnement existent, deux visent la production)                                  | Protocole de la section 7 ; garde de l'importeur (cible, empreinte, marqueur) ; rôle d'import distinct sans accès aux tables hors lot       | Refus avec toute autre cible, preuve par jeton                                            |
| **Publier un snapshot incomplet ou altéré**                                                                                                                              | L'importeur ne publie pas (politique `WITH CHECK`), `verify-snapshot` avant `RELEASED`, `stateHash` recalculé depuis la base avant `COMMIT` | Test de refus de publication par le rôle d'import ; altération injectée détectée          |
| **Perdre l'information « scrutin discordant »** : un run lu en base attribuerait des votes à un groupe sur des listes qui ne concordent pas avec les décomptes officiels | `ScrutinCountCheck` (3.1) persistée et versionnée ; la publication la lit                                                                   | Les 35 scrutins discordants de la baseline (30, 4, 1) retrouvés en base, aucun admissible |
| **`rawHash` mal défini** : de fausses `CORRECTED` à chaque import (bruit) ou de vraies corrections invisibles                                                            | Définition canonique unique (5C-1), `memberHash` en plus, tests sur octets identiques et sur un champ non projeté                           | Deux imports des mêmes octets : 0 correction ; un champ projeté modifié : exactement une  |
| **Archive non restaurable** (URL réécrite, objet corrompu, code d'analyse perdu)                                                                                         | Stockage adressé par contenu, deux copies, étiquette git par `parserVersion`, exercice de restauration                                      | Exercice réussi, `stateHash` retrouvé                                                     |
| **Rapprochement par nom ou repli vers le groupe actuel qui se glisse dans l'import**                                                                                     | Aucune colonne de nom, aucune lecture de `Politician` ou de `ParliamentaryGroup`, gardes d'architecture sur le planificateur et l'exécuteur | Tests d'architecture qui échouent sur un import interdit                                  |
| **`BYPASSRLS` sur le rôle applicatif**                                                                                                                                   | Politiques `TO` le rôle d'import ; vérification du catalogue : le rôle applicatif n'a pas l'attribut                                        | Requête de catalogue consignée                                                            |

### P1 : à traiter avant la préproduction

| Risque                                                                                                                                        | Parade                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Transaction de 9 minutes ou plus : coupure de connexion, dépassement de `statement_timeout` du rôle, pooleur                                  | Connexion directe, réglages portés par le rôle, mesure avec des réglages réalistes ; alternative reprise par morceaux gardée en réserve (2.6) |
| Garde-fou de retrait de 1 % déclenché à tort (AMO30 peut légitimement se réduire)                                                             | Rapport lisible, indicateur explicite, jamais automatique                                                                                     |
| Volume : environ 1,5 Go pour un jeu complet, dont 341 Mo pour l'exclusion des attestations, face à un quota de base inconnu                   | Mesure, puis décision sur `active_key` dans le benchmark comparatif ; vérifier le quota avant la préproduction                                |
| La préproduction diffère de la production (rôles, extensions, droits par défaut), donc une répétition qui réussit ne prouve pas la production | Comparer les catalogues des deux, en lecture seule ; `btree_gist` et le rôle d'import vérifiés des deux côtés                                 |
| Création du rôle d'import impossible ou différente sur Supabase (`BYPASSRLS` en particulier)                                                  | Approche par politiques (6.1) ; test du rôle sur la préproduction avant tout import                                                           |
| Secrets : mot de passe du rôle d'import dans l'historique, les journaux ou une variable hébergée                                              | Fichier local dédié, `VALID UNTIL`, renouvellement ; le dépôt est public, les rapports n'ont ni hôte ni mot de passe                          |
| Évolution de l'analyseur qui change des empreintes sans changement de source                                                                  | `parserVersion` obligatoire, étiquette git, nouveau snapshot attribué à l'analyseur                                                           |
| Une publication qui arrive pendant un import ou un run                                                                                        | Verrous consultatifs de 5B (testés) ; test de bout en bout dans 5C-4                                                                          |

### P2 : à suivre

| Risque                                                    | Note                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Optimisation des index (`active_key`, exclusion)          | Benchmark comparatif séparé, décision après mesure                        |
| Rétention des rapports d'import et des empreintes         | Stockage privé, sans donnée personnelle                                   |
| Sénat                                                     | Piste séparée : autre source, autre schéma de dates (architecture 10.6)   |
| Observabilité (durée par phase, alertes d'un import long) | Journal local, pas de service tiers                                       |
| Couverture des branches PL/pgSQL                          | Chaque fonction est exercée ; pas les branches. Mesure possible plus tard |
| Législatures antérieures à la 15e                         | Hors périmètre du lot                                                     |

## 13. Décisions à prendre

| #   | Question                                                                           | Recommandation                                                                                                                 |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C1  | `ScrutinCountCheck` en table de versions (3.1)                                     | Oui, en 5C-0, avant l'importeur                                                                                                |
| C2  | `memberHash` sur les quatre autres tables (3.2)                                    | Oui                                                                                                                            |
| C3  | `rawHash` : projection canonique plus `memberHash` du fichier (tableau 1, ligne 1) | Oui                                                                                                                            |
| C4  | Stockage privé des archives (A9, 5.2)                                              | Bucket privé hors du projet de la base, plus copie hors ligne. **À confirmer avec vous : je n'ai pas vu les tableaux de bord** |
| C5  | Accès du rôle d'import : politiques `TO` le rôle, ou `BYPASSRLS` dédié (6.1)       | Politiques                                                                                                                     |
| C6  | Une transaction par flux, ou import repris par morceaux (2.4, 2.6)                 | Une transaction par flux, reprise par morceaux en réserve                                                                      |
| C7  | Tout rejet d'analyse arrête-t-il l'import (2.2, phase 3)                           | Oui, sauf indicateur explicite et consigné                                                                                     |
| C8  | Étiquette git par `parserVersion` (5.3)                                            | Oui, `historical-groups-parser/<version>`                                                                                      |
| C9  | Preuve par jeton écrite sur la préproduction (7, étape 3)                          | Oui, après accord d'écriture, d'abord à blanc sur deux conteneurs                                                              |
| C10 | Premier import des fichiers officiels sur base jetable locale (9, jeu 3)           | Demande de validation distincte, à formuler quand 5C-4 est fusionnée                                                           |

## 14. Ce qui n'est pas dit ici

- Rien n'a été exécuté, ni lu sur une base partagée. Les chiffres de volume viennent du benchmark de
  5B (conteneur sans réglage).
- Les capacités de Supabase et de Vercel citées (rôles, `BYPASSRLS`, magasin privé, quotas) sont des
  points **à confirmer dans les tableaux de bord** : je ne les ai pas observés.
- Les compléments de schéma de la section 3 ne sont pas écrits : ils attendent votre accord sur C1 et C2.
