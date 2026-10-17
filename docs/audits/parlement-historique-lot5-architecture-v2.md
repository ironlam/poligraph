# Parlement historique, lot 5 : architecture des affiliations, version 2.1

Statut : proposition, aucune implémentation. Aucune migration, aucun DDL ni DML, aucun import,
aucun recalcul. Les blocs SQL ci-dessous sont des propositions non exécutées.

Date des mesures : 2026-10-17, lecture seule (fichiers officiels téléchargés en local, requêtes SQL
en transaction `READ ONLY` pour les comptages de fiches et de votes).

Cette version remplace le rapport d'audit du même jour. Elle intègre les arbitrages validés et les
corrections demandées. Elle répond à une question précise : comment reconstruire l'histoire
parlementaire avec des preuves, et pas seulement comment rendre une jointure SQL possible.

**V2.1.** Corrections ciblées de la V2. Les sections modifiées portent la mention [V2.1]. Les
autres sont inchangées, sauf renvois corrigés.

## 0. Conventions de lecture

Chaque affirmation porte une étiquette.

| Étiquette | Sens                                                                             |
| --------- | -------------------------------------------------------------------------------- |
| [F]       | Fait sourcé : écrit dans une documentation officielle, citation à l'appui        |
| [M]       | Mesure : calculée par nous sur les fichiers officiels téléchargés, reproductible |
| [I]       | Inférence : déduite des mesures, pas écrite par la source                        |
| [U]       | Incertitude : non établie, traitée comme un risque                               |

Aucun total de lignes ni pourcentage de concordance ne vaut preuve d'exactitude. Les mesures
servent de base de référence (baseline) pour détecter une régression, pas pour conclure que les
attributions sont justes.

### 0.1 Erreurs de la V2 corrigées dans la V2.1 [V2.1]

| #   | Où (V2)     | Erreur                                                                                                                                                  | Correction                                             |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | 2.3         | Le tableau mélangeait des catégories qui se chevauchent : 116 votes de la 16e comptés comme « plusieurs mandats » relevaient du changement de référence | Catégories exclusives dont la somme égale le total     |
| 2   | 2.3         | « Même sigle, autre référence » : 4 043 en 16e. « `PO0` » : environ 2 300 votes en 17e                                                                  | 4 159 et 1 916 (recalcul exclusif)                     |
| 3   | 2.3         | « Plusieurs mandats le même jour » présenté parmi les désaccords                                                                                        | C'est un accord (qualités différentes du même organe)  |
| 4   | 2.2, 3, 5D  | Écart d'une identité entre « votants distincts » et « fiche + sans fiche », et « 611 sur 611 » sans population définie                                  | Populations définies et réconciliées (2.2)             |
| 5   | 6.3 règle 4 | Le coût de la règle « jour de bascule » comptait des votes qui ont une attestation de scrutin, donc non concernés                                       | Règle « jour de bord », coût recalculé (6.3)           |
| 6   | 9, 5F       | Renvoi à l'arbitrage A5 pour le masquage des positions, qui est l'arbitrage A4                                                                          | Renvois revus (12)                                     |
| 7   | 10.2        | « Se rend en quelques secondes » : non vérifié, et faux pour une page ISR                                                                               | Mécanismes réels du cache décrits (10.2)               |
| 8   | 4           | Le modèle ne gardait qu'une version par enregistrement et le référentiel `AnOrgan` n'est pas versionné                                                  | Modèle versionné (4)                                   |
| 9   | 2.2         | « Scrutins dans l'archive » : 4 106 en 16e, à côté de 602 911 votes qui ne couvrent que 4 105 scrutins                                                  | Fichiers, scrutins AN et Congrès distingués (2.2, 2.5) |

## 1. Ce que la documentation officielle établit, et ce qu'elle laisse ouvert

Sources : archive officielle `Schemas.zip` (MD5 `67a8dd5b74dea0cc688003b3400c879e`, conforme à
celui publié par l'Assemblée sur
[data.assemblee-nationale.fr/autres/schemas/donnees-legislatives](https://data.assemblee-nationale.fr/autres/schemas/donnees-legislatives)),
dont les XSD annotés et la documentation « Base de connaissances du Référentiel Législatif 0.9.8 ».
La documentation date de novembre 2016 (génération du 2016-11-25) : elle précède les 15e, 16e et
17e législatures. [U] Elle a pu devenir inexacte sur des points de détail.

### 1.1 Mandats (`Type_MandatAbstrait.xsd`)

- [F] « Les mandats représentent l'exercice de la fonction d'un acteur (acteurRef) au sein d'un
  organe (organeRef). »
- [F] `dateDebut` : « Date de début de la nomination de l'acteur ». Type `xs:date`, donc au jour,
  sans heure ni fuseau.
- [F] `datePublication` : « Date de publication de la nomination au journal officiel ». Nullable.
- [F] **`dateFin` : aucune définition dans le schéma.** Type `xs:date`, nullable. Rien n'indique si
  la date est incluse, ni ce que `null` signifie (en cours, ou inconnu).
- [F] `legislature` : « numéro de législature de l'Assemblée du mandat de député du titulaire
  durant la nomination (s'il existe) ».
- [F] `nominPrincipale` : faux si la période de la nomination est incluse dans une nomination
  (même organe et même acteur) de plus grande préséance, vrai sinon.
- [F] `preseance` : ordre d'importance des nominations d'un acteur à un même organe au titre de
  qualités différentes (exemple du schéma : « Président et membre »).
- [F] `codeQualite` : abrégé de la qualité, « constant au cours du temps » et « pioché dans une
  liste non écrite propre à l'organe ». Liste non publiée.

### 1.2 Organes (`Type_OrganeAbstrait.xsd`, `Type_OrganeParlementaire.xsd`)

- [F] `viMoDe/dateDebut` : « Date de création de l'organe ». Le schéma porte un `@TODO` : « Est-il
  normal que cette valeur soit à xsi:nil pour certains organes ? »
- [F] `viMoDe/dateAgrement` : « Date de publication de la création de l'organe parlementaire au
  journal officiel ».
- [F] `viMoDe/dateFin` : « Date de clôture de l'organe ».
- [F] `legislature` d'un organe parlementaire : numéro de législature pour les organes « non
  trans-législatures ». Pour les 12e et 13e, la valeur peut être nulle.
- [F] `libelleAbrege` : « Libellé abrégé de l'organe lorsqu'il existe ». Aucune garantie d'unicité
  ni de stabilité d'un organe à l'autre.
- [F] Il n'existe aucune relation documentée entre deux organes qui se succèdent (renommage,
  scission, fusion). `organeParent` existe mais n'a pas cette fonction.

### 1.3 Identifiants (`5.2 Identifiants uniques`)

- [F] Format `PO` (organe), `PA` (acteur), `PM` (mandat) suivi d'un entier.
- [F] La documentation interdit de déduire une information de la forme d'un identifiant : « il
  n'est donc pas correct [...] de faire substring(uid,1,2) ou d'appliquer une regexp à un uid pour
  extraire une information de législature ou de session ». Conséquence : aucun traitement ne
  lira la législature dans un `uid`.
- [U] Aucune garantie écrite de stabilité d'un `PA`, d'un `PO` ou d'un `PM` dans le temps.

### 1.4 Versioning (`6. Versioning des entités du référentiel (et absence de)`)

- [F] « Il semble clair que le référentiel ne fera pas de versioning technique. »
- [F] Pour reconstituer la fiche d'un député à une date, la documentation précise qu'on ne
  souhaite pas « les informations telles qu'elles étaient à l'époque » : ses nominations sont
  « celles en cours au moment choisi mais y compris celles saisies postérieurement à la date
  d'édition ».
- [I] Les intervalles d'AMO30 sont donc **la meilleure connaissance courante, corrigée
  rétroactivement**, et pas un journal de ce qui était connu à la date du vote. Une source qui ne
  se versionne pas peut changer sans trace. Chaque import doit donc conserver un instantané daté et
  haché (section 3).

### 1.5 Scrutins (`Vote/VotesEtScrutins.xsd`)

- [F] `ventilationVotes/organe/groupes/groupe/organeRef` identifie le groupe sous lequel les
  votants sont rangés.
- [F] `nombreMembresGroupe` : « Le nombre total de membres de groupes (inscrits dans tribun) et non
  pas le nombre de présents du groupe. »
- [F] Chaque `votant` porte `acteurRef` et `mandatRef`. Le schéma ne dit pas de quel mandat il
  s'agit.
- [F] `miseAuPoint` : décompte des corrections de position après le scrutin.
- [F] `modePublicationDesVotes` : avant le 8 avril 2014, seuls les dissidents étaient publiés
  nominativement. Hors périmètre (15e à 17e).
- [U] Rien n'écrit que le groupe d'un votant est celui **au jour du scrutin**. Le fait que le
  schéma parle de groupes « inscrits dans tribun » (le système de l'Assemblée) le suggère [I] et
  les mesures de la section 2 vont dans ce sens, sans que ce soit écrit.

### 1.6 Sénat

- [F] La page [data.senat.fr/les-senateurs](https://data.senat.fr/les-senateurs/) décrit
  `ODSEN_HISTOGROUPES` comme « Appartenances courantes et historiques aux groupes politiques ».
  Aucune définition de champ publiée sur cette page.
- [F] L'en-tête du CSV contient la requête SQL source : une ligne par (appartenance, fonction
  exercée).
- [U] Aucune documentation de la sémantique des dates (début, fin, inclusion, valeur nulle). Un
  export complet PostgreSQL du Sénat existe sur la même page : ses commentaires de colonnes n'ont
  pas été consultés.
- [F] Le JSON d'un scrutin public du Sénat (`scr2024-1.json`) ne porte que matricule, vote et
  siège. La page HTML donne un « Analyse par groupes politiques » par nom, sans identifiant.

## 2. Mesures de référence (baseline)

Fichiers : AMO30 (14 053 fichiers, dont 63 organes de type `GP`), scrutins AN des 15e, 16e et 17e
législatures. [M] pour tout ce qui suit.

### 2.1 Archive de la 15e législature vérifiée intégralement

Le premier téléchargement avait été repris en cours de route et le test d'intégrité signalait une
erreur. Retéléchargée sans reprise : taille `9 202 661` octets, égale au `content-length` du
serveur, `unzip -t` sans erreur, SHA-256
`ca00f314b6957c9b0f32951a79d393f35a6cfd9f09626a11730984c94985084b`. L'archive contient 4 417
scrutins (4 416 avec la première extraction, un fichier manquait), du n° 1 au n° 4 419, 2 numéros
absents de la plage, du 2017-07-04 au 2022-02-24. Aucun scrutin entre le 2022-02-25 et la fin de
la législature : non expliqué [U].

### 2.2 Volumes et identités [V2.1]

Populations, définies une fois pour toutes :

- **F** : acteurs distincts (`acteurRef`) présents dans les votes nominatifs des fichiers de scrutins.
- **F1** : acteurs de F dont l'identifiant est égal à `Politician.officialId` (nom de famille compatible).
- **F2** : acteurs de F sans fiche par `officialId`, mais dont l'identifiant est porté par un
  `ExternalId` de source Assemblée nationale.
- **F3** : acteurs de F sans aucune fiche.
- **V** : fiches PoliGraph qui ont des lignes `Vote` de l'Assemblée dans la législature.

| Tous chiffres [M]                                        | 15e     | 16e     | 17e       |
| -------------------------------------------------------- | ------- | ------- | --------- |
| Fichiers de scrutin dans l'archive                       | 4 417   | 4 106   | 8 877     |
| dont scrutins de l'Assemblée (AN)                        | 4 417   | 4 105   | 8 877     |
| dont scrutin du Congrès                                  | 0       | 1       | 0         |
| Votes nominatifs, scrutins AN seuls                      | 472 631 | 602 911 | 1 323 978 |
| **F**, acteurs distincts                                 | 651     | 617     | 652       |
| F1, fiche par `officialId`, nom compatible               | 181     | 412     | 612       |
| F2, fiche par `ExternalId` seul                          | 1       | 1       | 1         |
| F3, aucune fiche                                         | 469     | 204     | 39        |
| Contrôle F1 + F2 + F3                                    | 651     | 617     | 652       |
| **V**, fiches avec votes AN en base                      | 0       | 414     | 612       |
| dont `officialId` présent dans F                         | 0       | 405     | 611       |
| dont sans `officialId`                                   | 0       | 9       | 1         |
| Votes en base de ces fiches sans `officialId`            | 0       | 4 415   | 391       |
| Fiches de F1 sans aucun vote en base dans la législature | 181     | 7       | 1         |

Le scrutin du Congrès de la 16e (`VTCGR5L16V1`, 2024-03-04) est dans l'archive des scrutins mais
n'est pas un scrutin de l'Assemblée. Ses 902 votants listés ne sont ajoutés à aucun total : voir 2.5.

Lecture des écarts d'identité :

- **Le « 1 » de F2 n'est pas la même personne dans les trois colonnes.** Ce sont trois acteurs
  distincts (un par législature, identifiants relevés hors du dépôt) dont la fiche porte
  l'identifiant dans un `ExternalId` de l'Assemblée et un `officialId` vide. La V2 les avait
  omis du tableau : 181 + 469 = 650, pas 651. [M]
- **612 (17e) contre 611.** 612 fiches de F1 existent, 611 ont des votes en base. La fiche sans vote
  explique la différence. L'ancien « 611 sur 611 » désignait les fiches ayant des votes dans
  n'importe quelle législature et un `officialId` : 621 fiches avec votes AN, dont 611 avec
  `officialId` et 10 sans (9 en 16e, 1 en 17e). Les deux chiffres décrivent des populations
  différentes, ils ne se contredisent pas.
- **16e : 412 contre 405.** 412 fiches de F1, 405 avec votes en base pour la 16e. Les 7 autres
  existent grâce à d'autres législatures.
- **Les 9 fiches de la 16e sans `officialId`** ont 4 415 votes en base (1,1 % des 397 813 votes AN de
  la législature) et aucun `ExternalId` de l'Assemblée. Rien ne permet de les relier à un acteur de
  F sans rapprochement par nom, interdit ici. Résultat du résolveur : `UNRESOLVED_IDENTITY`
  (`NO_OFFICIAL_ID`). Leurs votes ne sont donc pas attestables.
- **La fiche de la 17e sans `officialId`** (391 votes) porte un `ExternalId` de l'Assemblée : candidate à un
  lien `LINKED_EXTERNAL_ID` après contrôle du nom (3 cas à mesurer en 5D, un par législature).
- **15e : 0 vote en base.** Les 181 fiches de F1 existent grâce aux autres législatures. Aucun
  vote de la 15e n'est à attribuer aujourd'hui.

### 2.3 Concordance, catégories exclusives [V2.1]

Pour chaque vote nominatif, une seule catégorie, dans cet ordre de priorité. E1 est le groupe
publié dans le scrutin, E2 l'ensemble des organes dont un mandat de groupe de l'acteur couvre la
date (bornes incluses, enregistrements d'un même organe regroupés).

| Catégorie                                                                   | 15e     | 16e     | 17e       |
| --------------------------------------------------------------------------- | ------- | ------- | --------- |
| 1. `organeRef` publié absent du référentiel (`PO0`)                         | 0       | 0       | 1 916     |
| 2. Aucun enregistrement de groupe ce jour-là pour l'acteur                  | 0       | 0       | 0         |
| 3a. Accord, un seul enregistrement                                          | 465 356 | 590 367 | 1 303 437 |
| 3b. Accord, plusieurs enregistrements du même organe (qualités différentes) | 7 198   | 8 164   | 18 254    |
| 4. Même sigle, autre `organeRef` (changement de référence)                  | 0       | 4 159   | 0         |
| 5. Groupe différent, désaccord résiduel                                     | 77      | 221     | 371       |
| 6. Plusieurs organes distincts valides le même jour                         | 0       | 0       | 0         |
| **Total, égal aux votes nominatifs**                                        | 472 631 | 602 911 | 1 323 978 |

Lecture :

- **3b est un accord.** Les enregistrements multiples d'un même organe sont des qualités différentes
  (« Membre » et « Président », « Membre » et « Membre apparenté »), `nominPrincipale` à 0 pour
  la préséance inférieure. [M] Superpositions de deux organes distincts : 0 sur les trois
  législatures. Détail des paires superposées d'un même organe : 15e, 10 paires aux dates identiques
  et 14 aux dates différentes ; 16e, 9 et 4 ; 17e, 12 et 6.
- **Catégorie 4.** Le groupe SOC de la 16e passe de `PO800496` à `PO830170` le 2023-10-19 dans les
  mandats, alors que des scrutins de 2024 portent encore l'ancien `organeRef`. La 17e a aussi un
  changement de référence côté mandats (UDR) sans effet mesuré côté scrutins.
- **Catégorie 1.** `PO0` : 146 entrées de groupe, 14 scrutins, 1 916 votes. Valeur de remplissage
  qui ne correspond à aucun organe. [I]
- **Catégorie 5.** Un scrutin range un député en non-inscrit alors qu'un mandat de groupe commence
  ce jour-là, ou le range dans un groupe un à deux jours avant le début enregistré du mandat.
- **Non-inscrits sans enregistrement.** Certains députés n'ont aucune ligne « Député non-inscrit »
  avant leur premier groupe, alors que le scrutin les range en non-inscrits. L'absence
  d'enregistrement n'est donc pas une non-inscription, et l'absence d'une non-inscription
  enregistrée n'est pas une preuve d'appartenance.

### 2.3.1 Jours de bord, par recouvrement [V2.1]

Un **jour de bord** est un jour égal à la `dateDebut` ou à la `dateFin` d'un enregistrement de
groupe de l'acteur, dans la législature. Ce n'est pas une catégorie exclusive : c'est un marqueur
qui traverse les catégories.

| [M]                                    | 15e          | 16e          | 17e            |
| -------------------------------------- | ------------ | ------------ | -------------- |
| Votes un jour de bord                  | 434 (0,09 %) | 398 (0,07 %) | 1 432 (0,11 %) |
| Catégorie 5 (résiduel) un jour de bord | 77 sur 77    | 221 sur 221  | 310 sur 371    |

Les 61 votes de la 17e hors jour de bord sont des scrutins qui rangent le député dans un groupe
dont le mandat est déjà terminé. Ils sortent en `CONFLICT`. Le marqueur remplace la notion de « jour
de bascule » de la V2, plus étroite (373, 73 et 757 votes), qui ne couvrait pas le premier jour d'un
groupe sans enregistrement précédent.

### 2.4 Lien entre un vote et le mandat de siège

[M] Pour les 2 399 520 votes nominatifs des trois législatures, `mandatRef` désigne chaque fois un
mandat de type `ASSEMBLEE` du même acteur. Les 100 % de ces mandats couvrent la date du scrutin,
bornes incluses. Aucun vote n'est hors de l'intervalle ainsi lu.

### 2.5 Mesures de la PR 5A-2, parseurs sur les fichiers officiels [M]

Mesures faites par `npm run validate:historical-groups`, qui lit les archives, applique les
parseurs purs et la classification de `official-validation.ts`, et compare à la baseline commitée
(`parlement-historique-lot5-baseline-5a2.json`, agrégats seuls). Les archives restent hors du dépôt.

| Archive      | Octets     | SHA-256                                                            | `Last-Modified`      |
| ------------ | ---------- | ------------------------------------------------------------------ | -------------------- |
| AMO30        | 13 703 948 | `be3233d5b8a037b396302180601067484588ecf0fcd22eb5d9955cd4c877fa77` | 2026-10-17 00:34 GMT |
| Scrutins 15e | 9 202 661  | `ca00f314b6957c9b0f32951a79d393f35a6cfd9f09626a11730984c94985084b` | 2022-06-09           |
| Scrutins 16e | 10 107 912 | `adc5e57d3ad5904fd11e176b531b3d525d4ecfdf78db9587f93a14452601126b` | 2024-06-28           |
| Scrutins 17e | 27 563 304 | `55af9beb247f6c346cffa4eff1ec29b298cdafb4dae32325f9e4e0cc8a1fafb6` | 2026-10-17 10:25 GMT |

Les archives AMO30 et de la 17e changent chaque jour. Les chiffres qui suivent sont ceux de ces
octets. Une autre archive donne un rapport de différences, pas un échec (voir « Reproductibilité »).

**Référentiel AMO30.** 14 053 fichiers : 10 819 organes (63 de type `GP`, 10 756 hors périmètre, 0
rejeté), 3 175 acteurs (0 rejeté), 59 déports (ignorés). 173 078 mandats : 7 772 de groupe, 3 960 de
siège (`ASSEMBLEE`), 161 346 hors périmètre, 0 rejeté. Somme égale au total. Mandats de groupe par
législature : 576 (12e), 1 347, 1 435, 1 686 (15e), 1 305 (16e), 1 423 (17e). 585 mandats de groupe
n'ont pas de date de fin dans le fichier.

**Organes non-inscrits.** Une non-inscription n'est attestée que si deux signaux indépendants
concordent : le nom de l'organe (sigle `NI` et libellé, qui doivent eux-mêmes s'accorder) et la
qualité de tous les mandats qu'il contient (« Député non-inscrit »). Résultat : 57 groupes, 6
organes non-inscrits, 0 organe non classé. En cas de désaccord, l'organe reste sans type, ses valeurs
sources sont gardées et le diagnostic est `NI_SIGNALS_CONFLICT` (ou `NI_SIGNAL_UNCONFIRMED` si le nom
dit « non-inscrit » et qu'aucun mandat ne le confirme).

**Scrutins.**

| [M]                                    | 15e     | 16e     | 17e       |
| -------------------------------------- | ------- | ------- | --------- |
| Fichiers                               | 4 417   | 4 106   | 8 877     |
| Scrutins AN, lus                       | 4 417   | 4 105   | 8 877     |
| Scrutin du Congrès, identifié à part   | 0       | 1       | 0         |
| Fichiers rejetés                       | 0       | 0       | 0         |
| Votes nominatifs (scrutins AN)         | 472 631 | 602 911 | 1 323 978 |
| Acteurs distincts                      | 651     | 617     | 652       |
| Scrutins dont les décomptes concordent | 4 387   | 4 101   | 8 876     |
| Scrutins `COUNT_MISMATCH`              | 30      | 4       | 1         |
| Votes conservés dans ces scrutins      | 6 105   | 785     | 218       |

Le Congrès de la 16e est compté dans les fichiers examinés, jamais dans les scrutins AN. Il utilise
les clés au singulier (`pour`, `contre`, `abstention`, `nonVotant`), ce que l'ancienne mesure ne
lisait pas. Ses 902 votants listés sont un comptage brut, non interprété, et ne sont additionnés à
aucun total de l'Assemblée. Un scrutin AN qui utiliserait ces clés serait rejeté
(`SINGULAR_KEYS_IN_AN_SCRUTIN`), pas lu à moitié.

**Trois notions séparées.** La conservation brute (toutes les attestations sont gardées, dans les
scrutins discordants comme ailleurs), la cohérence des décomptes (`COHERENT`, `COUNT_MISMATCH`,
`UNVERIFIABLE`) et l'admissibilité à la publication (les décomptes concordent). Un scrutin
`COUNT_MISMATCH` n'alimente aucune position publiable automatiquement. Il reste dans les contrôles
structurels de conservation, d'unicité et d'absence de perte.

**Écarts des décomptes.** 35 scrutins `COUNT_MISMATCH` : 30 en 15e, 4 en 16e, 1 en 17e. Sur pour,
contre et abstention seulement, ils sont 34 (30 et 4) ; celui de la 17e (le premier scrutin de la
législature, une motion de censure) ne diffère que sur les non-votants. Niveau des groupes : 17
groupes en 15e et 4 en 16e dont la liste nominative diffère du décompte du groupe, 0 en 17e.

**Mises au point (`miseAuPoint`).** Comptées et diagnostiquées, jamais appliquées. Scrutins avec
des votants listés dans ces blocs : 1 226 (15e), 929 (16e), 1 534 (17e), soit 2 616, 1 907 et 3 243
votants. Aucun bloc mal formé. Appliquées au calcul, elles n'expliquent aucun des écarts ci-dessus
(30 sur 30 et 4 sur 4 restent), donc l'incertitude U4 (la ventilation publiée reflète-t-elle les
corrections ?) n'est pas levée. Les attestations restent celles de la ventilation publiée.

**Formes irrégulières lues explicitement.** `mandats.mandat` objet, liste ou `null` ; `votant` objet
ou liste ; blocs de position `null`, objet ; blocs de mise au point objet, liste ou liste contenant
`null` ; décomptes officiels écrits `pour`, `contre` au singulier et `abstentions`, `nonVotants` au
pluriel ; identifiant d'acteur typé (`#text`) ; `legislature` et nombres en chaînes ; `organeRef`
d'un mandat parfois en liste (181 mandats hors groupe, jamais pour un groupe : un mandat de groupe
à plusieurs organes serait rejeté `ORGAN_REF_NOT_SINGLE`, jamais résolu en choisissant un élément).
Aucun acteur n'est listé deux fois dans un même scrutin.

**Catégories exclusives d'un vote** (2.3, reproduites à l'unité près par une classification qui
n'importe pas le résolveur) :

| [M]                               | 15e     | 16e     | 17e       |
| --------------------------------- | ------- | ------- | --------- |
| `ORGAN_ABSENT` (dont `PO0`)       | 0       | 0       | 1 916     |
| `NO_GROUP_RECORD`                 | 0       | 0       | 0         |
| `MULTIPLE_DISTINCT_ORGANS`        | 0       | 0       | 0         |
| `AGREE_SINGLE_RECORD`             | 465 356 | 590 367 | 1 303 437 |
| `AGREE_SAME_ORGAN_RECORDS`        | 7 198   | 8 164   | 18 254    |
| `SAME_SIGLE_OTHER_REF`            | 0       | 4 159   | 0         |
| `DIFFERENT_GROUP`                 | 77      | 221     | 371       |
| Somme, égale aux votes nominatifs | 472 631 | 602 911 | 1 323 978 |
| Votes un jour de bord             | 434     | 398     | 1 432     |
| dont `DIFFERENT_GROUP`            | 77      | 221     | 310       |

Le contrôle de somme est une invariante vérifiée à chaque exécution : une catégorie perdue fait
échouer la commande.

**Lien avec le mandat de siège.** Sur 2 399 520 votes, 0 sans référence de mandat, 0 mandat
inconnu, 0 mandat d'un autre acteur, 0 hors de l'intervalle fermé. 518 votes tombent le jour de la
`dateFin` du mandat de siège (5 en 15e, 0 en 16e, 513 en 17e) : couverts par la lecture fermée,
pas par la lecture exclusive.

**Chevauchements.** Deux organes distincts le même jour pour un acteur : 0 en 15e, 16e et 17e. Il y
en a 121 plus anciens (13e : 35, 14e : 86), dont 120 ne partagent qu'un seul jour (la fin d'un
organe et le début du suivant, que la lecture fermée transforme en chevauchement) et 1 dure
plusieurs jours (13e). Ils sont rapportés à part et ne bloquent pas : seules les législatures
couvertes par les archives de scrutins comptent. Paires d'un même organe : mêmes chiffres que 2.3.

**Limites éditoriales de ces mesures.** Elles décrivent la cohérence des fichiers entre eux, pas
l'exactitude des attributions. Aucun total ne vaut preuve. Le `Last-Modified` n'est pas lisible
dans l'archive : il est saisi à la main dans la baseline (la date de modification de 15e et 16e
n'est connue qu'au jour).

## 3. Identités officielles et identités PoliGraph

Principe : l'identité officielle est la clé de la preuve. La fiche PoliGraph est un rattachement
**optionnel** et **réversible** posé par-dessus.

| Notion               | Clé                     | Existe sans fiche PoliGraph |
| -------------------- | ----------------------- | --------------------------- |
| Acteur officiel (AN) | `acteurRef` (`PA…`)     | oui                         |
| Sénateur officiel    | matricule du Sénat      | oui                         |
| Organe officiel      | `organeRef` (`PO…`)     | oui (`AnOrgan` existe déjà) |
| Mandat officiel      | `PM…`                   | oui                         |
| Groupe PoliGraph     | `ParliamentaryGroup.id` | non applicable              |
| Fiche PoliGraph      | `Politician.id`         | non                         |

Constat [M] : 469 votants de la 15e, 204 de la 16e et 39 de la 17e n'ont aucune fiche. Leurs
affiliations seront stockées et exploitables comme preuves, mais **aucune fiche publique n'est
créée** (décision n° 5 de la validation du lot, distincte des arbitrages A1 à A14). Aucune table nouvelle ne porte de clé étrangère obligatoire vers
`Politician`.

Données personnelles : les enregistrements de personnes sans fiche se limitent à l'identifiant
officiel, au nom et au prénom (données publiées sous licence ouverte par l'institution). Pas de
date de naissance, pas de photo, pas de coordonnées. Ces tables ne sont lues par aucune page
publique ni aucune route de l'API v1 dans ce lot. [U] La doctrine RGPD du projet n'a pas de règle
écrite sur le stockage d'identités d'anciens parlementaires sans fiche : à confirmer (section 11).

## 4. Schéma de données révisé [V2.1] (proposition, non exécutée)

### 4.0 Principe : preuves immuables, projection courante, dérivé

| Couche                  | Contenu                                                                                                                           | Règle                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Preuves immuables**   | `SourceArtifact`, `OfficialSourceSnapshot`, `SnapshotDecision`, versions d'enregistrements, décisions d'identité et de continuité | Jamais de `DELETE`. Jamais de `UPDATE` de contenu. Seule exception : `toSeq`, posé une fois |
| **Projection courante** | Vues SQL « état courant » (`toSeq IS NULL`) et « état au snapshot S »                                                             | Jetable, recréable à tout moment depuis les preuves                                         |
| **Dérivé**              | `HistoricalResolutionRun`, `ScrutinOrganPosition`, `RunExclusion`                                                                 | Épingle ses entrées (4.8), plusieurs runs coexistent                                        |

Ce qui change par rapport à la V2 : une correction rétroactive de la source ne remplace rien. Elle
ajoute une version et ferme la précédente. Un run épinglé sur le snapshot 1 relit exactement ce qu'il
a lu, même après l'import du snapshot 2.

### 4.1 Fichiers sources et instantanés

```sql
-- Octets d'origine, adressés par leur empreinte
CREATE TABLE IF NOT EXISTS "SourceArtifact" (
  sha256          TEXT PRIMARY KEY,
  "byteSize"      BIGINT NOT NULL,
  "mediaType"     TEXT NOT NULL,          -- application/zip | text/csv
  "storageKind"   TEXT NOT NULL,          -- BLOB_PRIVATE | LOCAL_OFFLINE
  "storageRef"    TEXT NOT NULL,          -- clé d'objet, jamais une URL publique
  "storedAt"      TIMESTAMPTZ NOT NULL,
  "lastVerifiedAt" TIMESTAMPTZ
);

-- Un instantané = un flux, un fichier, un numéro d'ordre
CREATE TABLE IF NOT EXISTS "OfficialSourceSnapshot" (
  id               TEXT PRIMARY KEY,
  stream           TEXT NOT NULL,         -- AN_AMO30 | AN_SCRUTINS_L15 | _L16 | _L17 | SENAT_HISTOGROUPES
  seq              INT  NOT NULL,         -- 1, 2, 3 par flux, attribué à l'import
  "artifactSha256" TEXT NOT NULL REFERENCES "SourceArtifact"(sha256),
  url              TEXT NOT NULL,
  "fetchedAt"      TIMESTAMPTZ NOT NULL,
  "sourceAsOf"     TIMESTAMPTZ,           -- Last-Modified du serveur s'il le fournit, sinon NULL
  integrity        TEXT NOT NULL,         -- VERIFIED | FAILED, fait sur les octets, immuable
  "parserVersion"  TEXT NOT NULL,
  "stateHash"      TEXT NOT NULL,         -- empreinte de l'ensemble trié (clé, rawHash) après analyse
  "recordCounts"   JSONB NOT NULL,
  UNIQUE (stream, seq),
  UNIQUE (stream, "artifactSha256", "parserVersion")
);

-- Décisions sur un instantané : journal en ajout seul
CREATE TABLE IF NOT EXISTS "SnapshotDecision" (
  "decisionNo"  BIGSERIAL PRIMARY KEY,
  "snapshotId"  TEXT NOT NULL REFERENCES "OfficialSourceSnapshot"(id),
  status        TEXT NOT NULL,            -- QUARANTINED | RELEASED | REVOKED
  reason        TEXT NOT NULL,
  "decidedBy"   TEXT NOT NULL,
  "decidedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Intégrité, quarantaine, révocation : trois notions distinctes.**

| Notion          | Ce que c'est                                                                      | Qui la pose                                                         | Réversible                               | Effet                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intégrité**   | Fait sur les octets : taille égale au `content-length`, archive complète, SHA-256 | Le programme d'import, rejouable                                    | Non, c'est un constat                    | `FAILED` : l'instantané n'est pas analysé et ne peut jamais être `RELEASED`                                                                  |
| **Quarantaine** | Suspension sans jugement sur le contenu (doute, vérification en cours)            | Un humain, ou le programme si une revérification d'empreinte échoue | Oui, vers `RELEASED` ou `REVOKED`        | Aucun nouveau run ne peut s'y épingler. Les runs existants restent lisibles et sont marqués « à revoir »                                     |
| **Révocation**  | Jugement motivé : le contenu est jugé faux, ou retiré par la source ou par nous   | Un humain, motif obligatoire                                        | Non. Un nouvel instantané est nécessaire | Les runs épinglés sont marqués `INVALIDATED_BY_REVOCATION`. Toute activation publique qui en dépend est coupée dans la même opération (10.3) |

Un instantané sans décision est considéré `QUARANTINED` : rien n'est utilisable avant un
`RELEASED` explicite. Les archives AN changent chaque jour (`Last-Modified` des fichiers AMO30 et
des scrutins de la 17e : le 2026-10-17). L'import est donc manuel, jamais planifié.

**Retrouver ou restaurer les fichiers.** L'URL de l'Assemblée n'est pas une archive : elle est
réécrite en place. Les octets d'origine sont conservés sous leur empreinte (`SourceArtifact`),
avec une seconde copie hors ligne. Restauration : lire `storageRef`, recalculer le SHA-256, refuser
toute différence. Après restauration, l'analyse avec la `parserVersion` du snapshot doit redonner
le `stateHash` enregistré (4.7).

Volumes à prévoir [U] : 13,7 Mo pour AMO30, 10,1 Mo pour la 16e, 27,6 Mo pour la 17e, 9,2 Mo pour
la 15e, environ 61 Mo au total pour un jeu complet. La stratégie de stockage est l'arbitrage A9.

### 4.2 Versions d'enregistrements : le principe des intervalles de snapshots

Chaque table d'enregistrements sources porte `stream`, `fromSeq` et `toSeq`. Une ligne est valable
pour les snapshots `S` tels que `fromSeq <= S` et (`toSeq IS NULL` ou `S < toSeq`) : intervalle
**ouvert à droite** en numéros de snapshot, pour ne pas reproduire la question d'inclusion qu'on
reproche à la source.

Quatre opérations à l'import, par clé d'enregistrement :

| Opération     | Condition                                   | Effet                                                                  |
| ------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| **ADDED**     | Aucune ligne courante pour la clé           | `INSERT` avec `fromSeq = N`                                            |
| **UNCHANGED** | Ligne courante de même `rawHash`            | Aucune écriture                                                        |
| **CORRECTED** | Ligne courante de `rawHash` différent       | `toSeq = N` sur l'ancienne, `INSERT` de la nouvelle avec `fromSeq = N` |
| **REMOVED**   | Ligne courante, clé absente du snapshot `N` | `toSeq = N` sur l'ancienne, aucune successeure                         |

Une clé qui réapparaît après avoir été retirée est un nouvel `ADDED`. Un import ne s'applique que
sur un **flux complet** : un fichier partiel produirait de faux `REMOVED` (4.7).

### 4.3 Enregistrements de groupe

```sql
CREATE TABLE IF NOT EXISTS "GroupMembershipRecord" (
  source            TEXT NOT NULL,         -- AN | SENAT
  "sourceRecordId"  TEXT NOT NULL,         -- PM… | matricule:idAppartenance:idFonction
  stream            TEXT NOT NULL,
  "fromSeq"         INT  NOT NULL,
  "toSeq"           INT,
  "officialId"      TEXT NOT NULL,         -- PA… | matricule : pas de clé vers Politician
  chamber           "Chamber" NOT NULL,
  "groupRef"        TEXT NOT NULL,         -- organeRef | code groupe, valeur publiée
  legislature       INT,                   -- tel que publié, jamais lu dans un uid
  "qualityCode"     TEXT,                  -- Membre, Membre apparenté, Président, Député non-inscrit
  "isPrincipal"     BOOLEAN,               -- nominPrincipale
  precedence        INT,                   -- preseance
  "startDate"       DATE,
  "startState"      TEXT NOT NULL,         -- DATED | UNKNOWN
  "endDate"         DATE,
  "endState"        TEXT NOT NULL,         -- DATED | OPEN_AT_SNAPSHOT | UNKNOWN
  "publicationDate" DATE,
  "rawHash"         TEXT NOT NULL,
  PRIMARY KEY (source, "sourceRecordId", "fromSeq"),
  FOREIGN KEY (stream, "fromSeq") REFERENCES "OfficialSourceSnapshot"(stream, seq),
  FOREIGN KEY (stream, "toSeq")   REFERENCES "OfficialSourceSnapshot"(stream, seq),
  CHECK ("toSeq" IS NULL OR "toSeq" > "fromSeq"),
  CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate")
);
CREATE INDEX IF NOT EXISTS "GMR_actor_idx" ON "GroupMembershipRecord"(source, "officialId", "startDate");
```

**Définition de `OPEN_AT_SNAPSHOT` [V2.1].**

- **Observation** : la source ne publie pas de `dateFin` pour cet enregistrement dans le fichier du
  snapshot.
- **Portée** : l'enregistrement est « non terminé » **à la date de la source** du snapshot
  (`sourceAsOf`, c'est-à-dire la date de dernière modification du fichier côté serveur). Même principe
  que `Mandate.lastConfirmedAt` dans le schéma : pour un fichier publié, c'est la date de
  publication du fichier, pas l'instant où on l'a lu. Quand le serveur ne fournit pas cette date, la
  borne est `fetchedAt` et l'évidence le dit (`boundSource = FETCHED_AT`).
- **Au-delà de la borne** : ni vrai ni faux, inconnu. Une date de résolution postérieure à la borne
  donne `INSUFFICIENT: OPEN_BEYOND_SNAPSHOT`.
- **Ce que ce n'est pas** : un état « en cours aujourd'hui », ni l'équivalent de `isCurrent`, ni la
  preuve qu'aucun correctif ne suivra.
- **Version suivante** : si un snapshot ultérieur porte une `dateFin`, la version précédente est
  fermée (`toSeq`) et la nouvelle garde sa date. La précédente reste valable pour les runs épinglés
  sur le snapshot où elle a été observée.
- `UNKNOWN` est réservé aux cas où la source ne permet pas d'affirmer que la fin est ouverte : au
  Sénat, une fin vide sur une appartenance manifestement ancienne (124 lignes « UMP » sans fin dans
  `ODSEN_HISTOGROUPES` [M]).

Valeurs de `Last-Modified` relevées le 2026-10-17 [M] : AMO30 le 2026-10-17 00:34 GMT, scrutins de la
17e le 2026-10-17 10:25 GMT, de la 16e le 2024-06-28, de la 15e le 2022-06-09.

Un **non-inscrit** est un enregistrement comme un autre, attesté par la source (organe `NI`,
qualité « Député non-inscrit »). Il n'est jamais produit par déduction à partir d'une absence.

### 4.4 Acteurs, organes, attestations

Les trois tables suivent le principe 4.2 (`stream`, `fromSeq`, `toSeq`, `rawHash`) et n'ont aucune
clé vers `Politician`.

```sql
CREATE TABLE IF NOT EXISTS "OfficialActor" (
  source TEXT NOT NULL, "officialId" TEXT NOT NULL,
  stream TEXT NOT NULL, "fromSeq" INT NOT NULL, "toSeq" INT,
  "lastName" TEXT NOT NULL, "firstName" TEXT NOT NULL, "rawHash" TEXT NOT NULL,
  PRIMARY KEY (source, "officialId", "fromSeq")
);

-- Les organes de type GP du flux AMO30, versionnés. `AnOrgan` (lot 3) n'est pas versionné et
-- n'est pas lu par le résolveur : un run ne peut pas épingler une table qui s'écrase.
CREATE TABLE IF NOT EXISTS "OfficialOrganRecord" (
  "organeRef" TEXT NOT NULL, stream TEXT NOT NULL, "fromSeq" INT NOT NULL, "toSeq" INT,
  "codeType" TEXT NOT NULL, legislature INT, label TEXT NOT NULL, abbreviation TEXT,
  "startDate" DATE, "endDate" DATE, "rawHash" TEXT NOT NULL,
  PRIMARY KEY ("organeRef", "fromSeq")
);

CREATE TABLE IF NOT EXISTS "ScrutinVoterAttestation" (
  "scrutinExternalId" TEXT NOT NULL,         -- VTANR5L17V501
  "officialId"        TEXT NOT NULL,         -- PA…
  stream TEXT NOT NULL, "fromSeq" INT NOT NULL, "toSeq" INT,
  "publishedOrganRef" TEXT NOT NULL,         -- tel que publié, y compris PO0
  "publishedPosition" TEXT NOT NULL,         -- pour | contre | abstention | nonVotant
  "byDelegation"      BOOLEAN,
  "seatMandateRef"    TEXT,                  -- PM… du mandat de siège
  "sourceMember"      TEXT NOT NULL,         -- chemin du fichier JSON dans l'archive
  "memberHash"        TEXT NOT NULL,         -- empreinte du fichier du scrutin
  PRIMARY KEY ("scrutinExternalId", "officialId", "fromSeq")
);
```

Volume des attestations : 2 399 520 lignes pour les trois législatures, 1 926 889 pour les 16e et 17e,
par version. Le volume en octets n'est pas mesuré [U] (arbitrage A1).

### 4.5 Décisions d'identité et de continuité : journaux en ajout seul

Les décisions manuelles ne s'écrasent pas. Une décision est une ligne. Une révision est une nouvelle
ligne. La décision applicable à un run est la dernière ligne de chaque clé dont le numéro est
inférieur ou égal au plafond épinglé par le run (4.8).

```sql
CREATE TABLE IF NOT EXISTS "OfficialActorLinkDecision" (
  "decisionNo"   BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,
  "officialId"   TEXT NOT NULL,
  "politicianId" TEXT,           -- NULL permis, et sans clé étrangère : le journal doit survivre
                                 -- à la suppression ou à la fusion d'une fiche
  status         TEXT NOT NULL,  -- LINKED_OFFICIAL_ID | LINKED_EXTERNAL_ID | LINKED_MANUAL
                                 -- | AMBIGUOUS | NONE
  evidence       TEXT NOT NULL,
  "decidedBy"    TEXT NOT NULL,
  "decidedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "OrganContinuityDecision" (
  "decisionNo"   BIGSERIAL PRIMARY KEY,
  "fromOrganRef" TEXT NOT NULL,
  "toOrganRef"   TEXT NOT NULL,
  relation       TEXT NOT NULL,  -- RENAMED_SAME_GROUP | SUCCESSOR | SPLIT | MERGED
                                 -- | EDITORIAL_CONTINUITY | NOT_RELATED
  status         TEXT NOT NULL,  -- PROPOSED | VALIDATED | REJECTED
  evidence       TEXT NOT NULL,
  "evidenceUrl"  TEXT,
  "decidedBy"    TEXT NOT NULL,
  "decidedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ("fromOrganRef" <> "toOrganRef")
);
```

Règles inchangées de la V2 :

- Lien d'identité automatique **uniquement** quand `Politician.officialId` est égal à l'identifiant
  officiel ET que le nom de famille est compatible. Mesure de base : F1 compatible à 181, 412 et 612
  (section 2.2), 0 identifiant dupliqué en base.
- `LINKED_EXTERNAL_ID` (fiche portant l'identifiant dans un `ExternalId` de l'Assemblée sans
  `officialId`) : jamais automatique. Trois cas mesurés en 2.2, décision manuelle (arbitrage A12).
- Aucun lien par similarité de nom. `NONE` conserve l'acteur et ses preuves, sans créer de fiche.
- **Aucune décision de continuité écrite par un programme.** Un script peut au plus insérer
  `PROPOSED` avec ses éléments de preuve. Le même sigle n'est jamais une preuve : `NOT_RELATED`
  consigne les homonymes (SOC, RN, LR entre législatures) et empêche leur fusion.
- Seul `RENAMED_SAME_GROUP` validé et **dans une même législature** autorise le résolveur à
  réconcilier E1 et E2. `EDITORIAL_CONTINUITY` est ignoré du résolveur.
- Le lien entre un organe et un `ParliamentaryGroup` (`AnOrganGroupLink` de la V2) est **retiré du
  périmètre 5A à 5F**. Il n'est pas nécessaire aux positions historiques, indexées sur l'organe.
  `AnOrgan` et `ParliamentaryGroup` ne sont jamais fusionnés.

### 4.6 Immutabilité imposée par la base

Proposition de garde, à tester sur la base de préproduction : un déclencheur `BEFORE UPDATE` refuse
toute modification d'une table de versions sauf le passage de `toSeq` de `NULL` à une valeur, et un
déclencheur `BEFORE DELETE` refuse toute suppression. Le projet a déjà un déclencheur de ce genre
(`sync_vote_denorm_from_scrutin_trigger` sur `Vote`). Les journaux de décisions (4.5) et
`SnapshotDecision` refusent aussi `UPDATE` et `DELETE`.

### 4.7 Règles de versionnement

1. **Flux complet seulement.** Un snapshot couvre toute l'étendue de son flux. Un fichier partiel est
   rejeté à l'intégrité (4.1).
2. **Un snapshot par (octets, version de l'analyseur).** Mêmes octets, même analyseur : aucune
   ligne nouvelle. Mêmes octets, analyseur modifié : nouveau snapshot, et le rapport de différences
   l'attribue à l'analyseur.
3. **`stateHash`.** SHA-256 de la liste triée des triplets (genre, clé, `rawHash`) de l'état, chacun écrit comme un tableau JSON pour qu'un séparateur dans une clé ne puisse pas confondre deux états. [PR 1] Recalculé depuis les
   tables à l'état `S`, il doit égaler la valeur enregistrée. Un écart signale une altération.
4. **Deux voies de rejeu, qui doivent coïncider.** Voie base : état à `S` par intervalle. Voie
   fichier : restauration de l'artefact par empreinte, nouvelle analyse avec `parserVersion`. Même
   `stateHash`, sinon le snapshot passe en quarantaine.
5. **Rapport de différences entre deux snapshots.** Recalculé à la demande depuis les intervalles :
   ajouts, corrections, retraits par genre. Seul un résumé chiffré est stocké dans `recordCounts`.
6. **Garde-fou de retrait.** Un import qui produirait plus de 1 % de `REMOVED` sur un genre
   s'arrête avant écriture et exige un indicateur explicite après lecture du rapport.
7. **Aucune suppression**, jamais. Un enregistrement jugé faux est signalé par la révocation de son
   snapshot, pas effacé.

## 5. Hiérarchie des preuves

Pour répondre à « de quel groupe est l'acteur A au scrutin S », il existe deux preuves de nature
différente.

|                 | E1 : attestation du scrutin                                        | E2 : intervalle de mandat                                                      |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Nature          | Publiée avec le scrutin, à propos de ce vote précis                | Dérivée d'une période, corrigée rétroactivement                                |
| Précision       | Au vote                                                            | Au jour, avec bornes non définies par la source                                |
| Couverture      | Votants d'un scrutin nominatif                                     | Toute date, y compris sans scrutin                                             |
| Défauts mesurés | `PO0`, référence qui retarde sur le renommage (4 159 votes en 16e) | Dates de bascule décalées de un à quelques jours, non-inscrits parfois absents |
| Indépendance    | Fichier distinct                                                   | Fichier distinct                                                               |

Pour un vote qui figure dans un scrutin nominatif, **E1 est la preuve principale** : c'est
l'institution qui dit sous quel groupe elle a rangé ce votant pour ce vote. E2 est la
corroboration. Pour toute question sans scrutin nominatif (date quelconque, Sénat), E2 est la seule
preuve disponible, et le résultat porte ce niveau de preuve plus faible. [I] Cette hiérarchie repose
sur une lecture des mesures : la documentation officielle n'énonce pas que E1 vaut « au jour du
scrutin » (1.5).

Combinaison :

| E1                      | E2                                                | Résultat                                                     |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| organe valide           | même organe (ou lien `RENAMED_SAME_GROUP` validé) | `ATTESTED`, niveau `BOTH`                                    |
| organe valide           | aucun intervalle                                  | `ATTESTED`, niveau `SCRUTIN_ONLY`                            |
| organe valide           | autre organe, sans lien validé                    | `CONFLICT`                                                   |
| `PO0` ou organe inconnu | quel que soit E2                                  | `INSUFFICIENT` (E2 seul **n'est pas** utilisé pour trancher) |
| absent                  | intervalle unique, hors jour de bord              | `ATTESTED`, niveau `INTERVAL_ONLY`                           |
| absent                  | aucun intervalle                                  | `UNKNOWN`                                                    |

Précision [PR 1] : un jour de bord n'agit que **sans** attestation de scrutin (6.3, règle 4). Avec
attestation, le tableau s'applique tel quel, quel que soit le jour : accord de l'intervalle, `BOTH` ;
désaccord, `CONFLICT` ; aucun intervalle, `SCRUTIN_ONLY`. Les enregistrements dont les dates ne
permettent pas de placer le jour sont ignorés par l'attestation, jamais comptés contre elle.

## 6. Contrat du résolveur

### 6.1 Signature

```ts
resolveGroupAtDate(input: {
  chamber: "AN" | "SENAT";
  actor: { source: "AN" | "SENAT"; officialId: string } | { politicianId: string };
  civilDate: string;            // YYYY-MM-DD, jour civil Europe/Paris
  scrutinExternalId?: string;   // active E1 quand il est fourni
  asOf: { snapshotIds: string[]; dateSemanticsVersion: string };
}): Resolution
```

Un `politicianId` n'est accepté que s'il a un `OfficialActorLink` de statut `LINKED_*`. Sinon le
résultat est `UNRESOLVED_IDENTITY`. Le résolveur est une fonction pure : il reçoit ses preuves
déjà chargées, il ne lit ni `Mandate.isCurrent`, ni `currentPartyId`, ni
`MandateParliamentary`. Un test d'architecture vérifie ces absences (section 9).

### 6.2 Résultat : union exhaustive

| Statut                 | Contenu                                                                                                          | Quand                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------- |
| `ATTESTED_GROUP`       | `groupRef`, `level` (`BOTH`, `SCRUTIN_ONLY`, `INTERVAL_ONLY`), `evidence[]`, `viaLink?`, `diagnostics[]`         | Voir section 5                                                            |
| `ATTESTED_NON_INSCRIT` | idem, avec `transitional: boolean                                                                                | null`                                                                     | Organe `NI` attesté |
| `UNKNOWN`              | `reason: NO_RECORD`                                                                                              | Aucun enregistrement. Jamais interprété comme non-inscription             |
| `CONFLICT`             | `candidates[]` avec leurs preuves, `diagnostics[]`                                                               | E1 et E2 divergent sans lien validé, ou deux organes valides le même jour |
| `INSUFFICIENT`         | `reason` : `PO0`, `UNKNOWN_ORGAN`, `EDGE_DAY`, `START_DATE_UNKNOWN`, `END_STATE_UNKNOWN`, `OPEN_BEYOND_SNAPSHOT` | Preuve présente mais inutilisable                                         |
| `UNRESOLVED_IDENTITY`  | `reason` : `NO_OFFICIAL_ID`, `AMBIGUOUS_LINK`, `NO_LINK`                                                         | Aucun acteur officiel établi                                              |

Le résolveur ne renvoie **jamais** le groupe actuel en secours, ne comble jamais un trou entre
deux intervalles et ne déduit jamais une appartenance passée d'une appartenance actuelle.

### 6.3 Traitement des conflits et des cas à ne pas résoudre

1. **`PO0`, organe inconnu** : `INSUFFICIENT`. Même si l'intervalle donne une réponse unique, elle
   n'est pas retenue : une valeur de remplissage invalide l'attestation du scrutin entier pour ce
   votant.
2. **Changement de référence** : deux `organeRef` différents entre E1 et E2 = `CONFLICT`, sauf
   lien `RENAMED_SAME_GROUP` au statut `VALIDATED`. Alors résultat `ATTESTED_GROUP` avec
   `viaLink` renseigné, le lien est rendu visible dans la preuve.
3. **Sigle identique, références différentes, sans lien validé** : `CONFLICT`. Aucun rapprochement
   par sigle, libellé ou couleur.
4. **Jour de bord** [V2.1] : `civilDate` est égale au `startDate` ou à l'`endDate` d'un enregistrement
   de groupe de l'acteur, dans la législature.
   - **Avec attestation E1** : le jour de bord n'a pas d'effet propre. E1 décide, et un désaccord
     avec E2 sort en `CONFLICT` (règles 2 et 3).
   - **Sans attestation E1** : `INSUFFICIENT: EDGE_DAY`. C'est la seule situation où la règle coûte
     de la couverture : les questions posées pour une date sans scrutin nominatif (autre source,
     Sénat). Le coût de la V2 (373, 73, 757 votes) comptait des votes qui ont une attestation :
     il ne mesurait pas ce coût.
   - **Pourquoi cette règle** : 434 votes (0,09 %) en 15e, 398 (0,07 %) en 16e et 1 432 (0,11 %)
     en 17e tombent un jour de bord (2.3.1). Ils contiennent la totalité du désaccord résiduel de
     la 15e (77 sur 77) et de la 16e (221 sur 221), et 310 des 371 de la 17e.
5. **Plusieurs enregistrements d'un même organe** (« Membre » et « Président ») : un seul
   candidat, avec toutes les lignes sources en preuve. Ce n'est pas un conflit.
6. **Plusieurs organes valides le même jour** : `CONFLICT`. [M] Aucun cas dans AMO30 pour les 15e à
   17e, la règle protège contre une donnée future.
7. **Non-inscrit de transition** : un non-inscrit attesté dont l'intervalle se termine avant la
   constitution des groupes est renvoyé `ATTESTED_NON_INSCRIT` avec `transitional: true`, fait
   sourcé, sans interprétation politique. L'interface décide plus tard de ce qu'elle en affiche.
8. **Fin ouverte** [V2.1] : `OPEN_AT_SNAPSHOT` vaut jusqu'à la date de la source du snapshot
   (`sourceAsOf`, sinon `fetchedAt`, et l'évidence le dit), pas au-delà : une date postérieure donne
   `INSUFFICIENT: OPEN_BEYOND_SNAPSHOT` (définition en 4.3). Au Sénat, une fin vide sur une
   appartenance manifestement ancienne est `UNKNOWN` et donne `INSUFFICIENT: END_STATE_UNKNOWN`.
9. **Vote d'un acteur dont le mandat de siège ne couvre pas la date** : `CONFLICT`, à signaler à
   l'import (mesuré 0 cas, section 2.4).

10. **Vote valide et preuve d'intervalle indéterminée (E2 indéterminé)** [PR 1, revue]. Une
    attestation valide est une preuve directe du classement publié dans le scrutin : un intervalle
    qu'on ne sait pas placer ne l'invalide pas. Il ne disparaît pas non plus : il est porté par un
    diagnostic structuré `E2_INDETERMINATE`, qui garde, de façon déterministe, la référence, le groupe
    et le motif de chaque enregistrement, et un drapeau `couldContradict`. Un enregistrement peut
    contredire quand il nomme un autre groupe que celui du vote, sans décision de continuité
    validée (un organe inconnu peut contredire). Un enregistrement indéterminé du même groupe ne fait
    que s'accorder : il est signalé, il ne retient rien.

    | #   | Vote (E1)                        | Intervalle valide (E2)         | Intervalle indéterminé                     | Résultat                                                      |
    | --- | -------------------------------- | ------------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
    | 1   | valide                           | aucun pertinent                | aucun                                      | `ATTESTED`, `SCRUTIN_ONLY`, aucun diagnostic                  |
    | 2   | valide                           | aucun                          | un ou plusieurs                            | `ATTESTED`, `SCRUTIN_ONLY`, diagnostic `E2_INDETERMINATE`     |
    | 3   | valide                           | identique                      | aucun, ou qui ne peut que s'accorder       | `ATTESTED`, `BOTH` (diagnostic si indéterminé du même groupe) |
    | 4   | valide                           | identique                      | l'un d'eux pourrait nommer un autre groupe | `ATTESTED`, `SCRUTIN_ONLY`, diagnostic, corroboration écartée |
    | 5   | valide                           | autre groupe, sans lien validé | quelconque                                 | `CONFLICT`, avec le diagnostic                                |
    | 6   | valide                           | plusieurs groupes distincts    | quelconque                                 | `CONFLICT`, avec le diagnostic                                |
    | 7   | invalide (`PO0`, organe inconnu) | quelconque                     | quelconque                                 | `INSUFFICIENT`, aucun repli sur E2                            |
    | 8   | absent                           | quelconque                     | un ou plusieurs                            | `INSUFFICIENT` (politique prudente inchangée)                 |

    Au cas 4, le résultat garde `withheldCorroboration` : les références des intervalles valides qui
    s'accordent avec le vote mais n'ont pas été comptées comme corroboration. Les cas 1 et 2 donnent
    le même niveau et ne sont pas confondus : seul le cas 2 dit qu'une preuve existe qu'on n'a pas
    pu placer.

### 6.4 Biais de survivance

Le résolveur est indexé sur l'acteur officiel et sur la date, pas sur `Mandate.isCurrent`. Les
parlementaires partis y sont traités comme les autres. La correction du biais des calculs
persistés actuels n'est pas faite ici : `compute-group-positions.ts` n'est pas modifié (décision n° 4 de la validation du lot).

### 6.5 Contrat des runs et de la reproductibilité [V2.1]

Un run est un calcul **épinglé** : ses entrées sont désignées par numéro de snapshot et plafond de
décision, jamais par « l'état courant ». Deux exécutions avec les mêmes épingles et la même
configuration donnent le même résultat, octet pour octet.

**Ce que `HistoricalResolutionRun` fige.**

| Élément                      | Colonne                                        | Contenu                                                                   |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Instantanés sources          | `snapshotPins`, `snapshotStateHashes`          | un `seq` par flux et le `stateHash` correspondant, revérifié au démarrage |
| Référentiel d'organes        | inclus dans l'épingle `AN_AMO30`               | `OfficialOrganRecord`. `AnOrgan` n'est pas lu                             |
| Version de l'analyseur       | `parserVersion`                                | celle des snapshots épinglés                                              |
| Version du résolveur         | `resolverVersion`                              | chaîne incrémentée à toute modification de logique                        |
| Règles de dates              | `dateSemanticsVersion`, `config.dateSemantics` | `v1` : intervalle fermé ; traitement du jour de bord                      |
| Décisions d'identité         | `linkDecisionCutoff`                           | plus grand `decisionNo` applicable                                        |
| Décisions de continuité      | `continuityDecisionCutoff`, `decisionsHash`    | idem, plus l'empreinte de l'ensemble de décisions effectives              |
| Règles d'exclusion et motifs | `exclusionRulesVersion`, `config.exclusion`    | liste des règles, paramètres, motifs                                      |
| Seuil de publication         | `config.publication`                           | `maxExcludedPerGroup = 0`                                                 |
| Périmètre                    | `config.scope`                                 | flux et législatures                                                      |
| Entrées préparées            | `preparedInputsHash`                           | votes, identités, attestations et borne des fins ouvertes, hachés (6.7)   |
| Code                         | `codeVersion`                                  | SHA git, enregistré mais **hors** de `inputHash` (voir plus bas)          |

```sql
CREATE TABLE IF NOT EXISTS "HistoricalResolutionRun" (
  id                         TEXT PRIMARY KEY,
  "inputHash"                TEXT NOT NULL UNIQUE,
  status                     TEXT NOT NULL,     -- RUNNING | COMPLETED | FAILED
  "snapshotPins"             JSONB NOT NULL,    -- {"AN_AMO30": 2, "AN_SCRUTINS_L16": 1, ...}
  "snapshotStateHashes"      JSONB NOT NULL,
  "linkDecisionCutoff"       BIGINT NOT NULL,
  "continuityDecisionCutoff" BIGINT NOT NULL,
  "decisionsHash"            TEXT NOT NULL,
  "preparedInputsHash"       TEXT NOT NULL,
  "parserVersion"            TEXT NOT NULL,
  "resolverVersion"          TEXT NOT NULL,
  "dateSemanticsVersion"     TEXT NOT NULL,
  "exclusionRulesVersion"    TEXT NOT NULL,
  "configHash"               TEXT NOT NULL,
  config                     JSONB NOT NULL,    -- copie intégrale de la configuration
  "codeVersion"              TEXT NOT NULL,
  "outputHash"               TEXT,              -- posé à la fin, nul tant que RUNNING
  "statusCounts"             JSONB,
  "startedAt"                TIMESTAMPTZ NOT NULL,
  "finishedAt"               TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "ScrutinOrganPosition" (
  "runId" TEXT NOT NULL REFERENCES "HistoricalResolutionRun"(id),
  "scrutinExternalId" TEXT NOT NULL, "organeRef" TEXT NOT NULL,
  position TEXT NOT NULL,
  "forCount" INT NOT NULL, "againstCount" INT NOT NULL, "abstainCount" INT NOT NULL,
  "excludedCount" INT NOT NULL, "excludedByReason" JSONB NOT NULL,
  "officialMemberCount" INT,
  PRIMARY KEY ("runId", "scrutinExternalId", "organeRef")
);

-- Un vote exclu, avec la raison et les enregistrements en cause (clé et fromSeq)
CREATE TABLE IF NOT EXISTS "RunExclusion" (
  "runId" TEXT NOT NULL REFERENCES "HistoricalResolutionRun"(id),
  "scrutinExternalId" TEXT NOT NULL, "officialId" TEXT NOT NULL,
  status TEXT NOT NULL, reason TEXT NOT NULL, evidence JSONB NOT NULL,
  PRIMARY KEY ("runId", "scrutinExternalId", "officialId")
);
```

Les résultats « attesté » par vote ne sont pas stockés : ils se recalculent, et `outputHash` les
couvre. Les exclusions, elles, sont stockées : ce sont elles qu'on relit pour un audit.

Forme de la configuration (JSON canonique, hachée en `configHash`) :

```json
{
  "dateSemantics": {
    "version": "v1",
    "interval": "closed",
    "edgeDayWithoutScrutin": "INSUFFICIENT"
  },
  "evidence": { "placeholderOrganRefs": ["PO0"] },
  "exclusion": {
    "version": "1",
    "rules": [
      { "id": "PUBLISHED_ORGAN_UNKNOWN", "reasons": ["PO0", "UNKNOWN_ORGAN"], "action": "EXCLUDE" },
      { "id": "SOURCES_DISAGREE", "reasons": ["CONFLICT"], "action": "EXCLUDE" },
      { "id": "EDGE_DAY_NO_SCRUTIN", "reasons": ["EDGE_DAY"], "action": "EXCLUDE" },
      {
        "id": "DATE_UNDETERMINED",
        "reasons": ["START_DATE_UNKNOWN", "END_STATE_UNKNOWN"],
        "action": "EXCLUDE"
      },
      { "id": "OPEN_BEYOND_SNAPSHOT", "reasons": ["OPEN_BEYOND_SNAPSHOT"], "action": "EXCLUDE" },
      { "id": "NO_RECORD", "reasons": ["NO_RECORD"], "action": "EXCLUDE" },
      {
        "id": "IDENTITY_UNRESOLVED",
        "reasons": ["NO_OFFICIAL_ID", "AMBIGUOUS_LINK", "NO_LINK"],
        "action": "EXCLUDE"
      }
    ]
  },
  "continuity": { "relations": ["RENAMED_SAME_GROUP"], "sameLegislatureOnly": true },
  "scope": { "legislatures": [16, 17] },
  "publication": { "maxExcludedPerGroup": 0 }
}
```

**`inputHash`.** SHA-256 de la sérialisation canonique de `{snapshotPins, snapshotStateHashes,
linkDecisionCutoff, continuityDecisionCutoff, decisionsHash, preparedInputsHash, parserVersion,
resolverVersion, configHash}`. La colonne est `UNIQUE` : les mêmes entrées ne créent pas un second run. Le SHA git
n'y figure pas, volontairement : deux commits qui donnent le même résultat ne doivent pas produire
deux runs. En contrepartie, une logique modifiée sans nouveau `resolverVersion` est rattrapée par
les tests de référence (voir plus bas), qui épinglent un `outputHash` sur des données de test.

**Conditions de déterminisme.**

1. Aucune lecture hors des épingles : toute requête est filtrée par numéro de snapshot. Le résolveur
   ne lit ni `AnOrgan`, ni `Mandate`, ni `MandateParliamentary`, ni aucun état courant.
2. Aucune horloge, aucun aléa : la date d'un calcul n'entre dans aucun résultat.
3. Ordre canonique explicite : tri par (flux, clé) avant tout parcours. Sérialisation canonique :
   clés triées, aucun espace, dates `YYYY-MM-DD`, entiers sans notation exponentielle.
4. `outputHash` : SHA-256 de la sérialisation canonique des résultats par vote triés par (scrutin,
   acteur), puis des positions, puis des exclusions.
5. Vérifications au démarrage : chaque instantané épinglé est `RELEASED` (sinon refus, y compris en
   quarantaine), son `stateHash` recalculé égale l'enregistré, `decisionsHash` recalculé égale la
   valeur épinglée.
6. Mode vérification : relancer un run existant ne le modifie pas, recalcule `outputHash` et exige
   l'égalité.

**Statut dérivé d'un run.** Pas de table : « à revoir » si un instantané épinglé est en quarantaine,
`INVALIDATED_BY_REVOCATION` s'il en a un de révoqué, relu depuis `SnapshotDecision` à chaque lecture.

### 6.6 Tests de non-régression d'une correction rétroactive [V2.1]

Jeu d'essai **synthétique** (identifiants fictifs, aucun nom réel) : un snapshot 1 et un snapshot 2
dérivé du premier par six modifications connues. Scrutins d'essai avec leurs attestations.

| Modification du snapshot 2 | Nature                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| c1                         | `dateFin` d'un enregistrement avancée de cinq jours (CORRECTED)                           |
| c2                         | nouvel enregistrement de groupe pour un acteur (ADDED)                                    |
| c3                         | enregistrement retiré (REMOVED)                                                           |
| c4                         | un groupe change de `organeRef`, et une décision de continuité est ajoutée après le run 1 |
| c5                         | enregistrement strictement inchangé (UNCHANGED)                                           |
| c6                         | correction d'orthographe du nom d'un acteur                                               |

| #   | Test                                                                                                                                                                            | Phase  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T1  | Run 1 sur le snapshot 1, import du snapshot 2, **rejeu des entrées du run 1** : `outputHash` identique à l'enregistré                                                           | 5E     |
| T2  | Run 2 sur le snapshot 2 : les votes qui diffèrent du run 1 sont exactement ceux touchés par c1 à c4, aucun autre                                                                | 5E     |
| T3  | Un vote attesté par intervalle seul au run 1 devient `UNKNOWN` au run 2 après c3, jamais attesté en silence                                                                     | 5E     |
| T4  | Après c1, un accord E1/E2 du run 1 devient `CONFLICT` au run 2, jamais `ATTESTED`                                                                                               | 5E     |
| T5  | La décision de continuité ajoutée après le run 1 : le rejeu du run 1 ignore la décision (plafond épinglé), le run 2 l'applique et renseigne `viaLink` sur les seuls votes de c4 | 5E     |
| T6  | Import du snapshot 2 deux fois : 0 insertion, 0 fermeture, `stateHash` identique                                                                                                | 5C     |
| T7  | Mêmes enregistrements dans un autre ordre : même `stateHash`, même `outputHash`                                                                                                 | 5C, 5E |
| T8  | Changement de `dateSemantics` (interprétation d'essai « exclusive ») : `inputHash` différent, mêmes épingles, ancien run intact                                                 | 5E     |
| T9  | Run demandé sur un snapshot en quarantaine, sans décision ou révoqué : refus, avec la raison                                                                                    | 5E     |
| T10 | Même octets, analyseur modifié : nouveau snapshot, différences attribuées à l'analyseur, aucune source modifiée                                                                 | 5C     |
| T11 | Révocation du snapshot 2 : run 2 `INVALIDATED_BY_REVOCATION`, run 1 intact, activation dépendante coupée                                                                        | 5F     |
| T12 | Base de préproduction : `UPDATE` de contenu et `DELETE` refusés, `toSeq` posé une fois, un second `UPDATE` refusé                                                               | 5B     |
| T13 | Restauration : copie locale supprimée, artefact relu par empreinte, nouvelle analyse : même `stateHash`                                                                         | 5C     |
| T14 | Modification volontaire de la logique du résolveur sans changer `resolverVersion` : le test de référence échoue                                                                 | 5E     |

T1 à T9 et T14 ont une version qui ne porte que sur des fonctions pures et des données d'essai : ni
base ni réseau. Elles entrent dans la première PR (section 14). T10 exige l'analyseur, T11 et T12 la
base de préproduction, T13 les fichiers : ils viennent avec les phases indiquées.

### 6.7 Frontière de confiance de `executeRun` [PR 1, revue]

`executeRun` reçoit deux sortes d'entrées, qui ne sont pas traitées de la même façon.

**Lu et vérifié ici.** Les affiliations, les organes et les décisions de continuité sont lus par la
fonction elle-même, à travers les épingles (`stateAt`, `effectiveDecisions`). Avant de calculer :
chaque enregistrement du snapshot épinglé doit avoir pour empreinte celle qu'il porte, l'ensemble
doit avoir l'empreinte d'état épinglée, et la version du résolveur épinglée doit être celle du code.

**Préparé ailleurs, déclaré et vérifié contre les épingles.** Les votes, avec leurs identités et leurs
attestations, sont préparés par la couche qui assemblera un run (phase 5F). La fonction ne peut ouvrir
ni fichier, ni journal, ni table : elle ne peut pas vérifier d'où ils viennent. Elle exige donc :

- une **déclaration de provenance** (`InputProvenance`) : les flux d'où viennent les attestations
  avec le numéro de snapshot lu et son empreinte d'état, le plafond de décisions d'identité, et les
  décisions d'identité en vigueur à ce plafond ;
- que cette déclaration **égale les épingles** : mêmes flux (tous ceux que le run épingle, sauf le flux
  de preuves lu ici), mêmes numéros, mêmes empreintes, même plafond ;
- que les décisions d'identité déclarées, avec les décisions de continuité du magasin, aient pour
  empreinte `decisionsHash` ;
- que les entrées préparées elles-mêmes (votes, identités, attestations, borne des fins ouvertes)
  aient pour empreinte `preparedInputsHash`, épinglée dans le run.

Un écart donne une liste de codes stables (`checkRunInputs`) et un refus (`RunInputContractError`).

| Changement                                                                         | Effet                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Un vote, une identité ou une attestation modifiés **après** le calcul des épingles | `PREPARED_INPUTS_HASH_MISMATCH`, refus                                                |
| Les mêmes modifications **avant** le calcul des épingles                           | `preparedInputsHash` différent, donc un autre run : jamais un rejeu identique         |
| Un enregistrement du magasin altéré sans que son empreinte ait changé              | `RECORD_HASH_MISMATCH`                                                                |
| Un magasin qui a perdu un enregistrement, ou lu à un autre snapshot                | `PINNED_STATE_HASH_MISMATCH`                                                          |
| Un snapshot ou une décision postérieurs, hors des épingles                         | Sans effet : c'est le rejeu T1                                                        |
| Un run épinglé sur une autre version du résolveur                                  | `RESOLVER_VERSION_MISMATCH` : l'ancien calcul ne se rejoue pas avec une autre logique |

**Ce qui reste de confiance, et incombe à la couche d'assemblage** : que la déclaration soit vraie. Elle
se construit à partir des objets mêmes avec lesquels les votes ont été lus, jamais à partir de
constantes, et les épingles se calculent depuis les entrées préparées une fois qu'elles sont
définitives. Une couche qui mentirait dans sa déclaration ne peut pas être détectée par cette
fonction. Cette frontière est la raison pour laquelle l'assemblage est une phase à part, avec ses
propres critères d'acceptation.

## 7. Sémantique des dates et incertitudes restantes

### 7.1 Règles retenues

- Toutes les dates sont des jours civils `DATE`, sans heure. La date d'un scrutin est celle de
  `dateScrutin` (`xs:date`). Aucune conversion UTC.
- `dateDebut` et `dateFin` sont stockés **tels que publiés**. L'interprétation vit dans le
  résolveur et porte un numéro (`dateSemanticsVersion`). Changer d'interprétation produit un
  nouveau run, pas une migration de données.
- Interprétation `v1` : intervalle fermé aux deux bouts, `[dateDebut, dateFin]`.

### 7.2 Statut de l'inclusion de `dateFin` : hypothèse, pas fait

- [F] Le schéma ne définit pas `dateFin` pour un mandat (1.1).
- [M] Pour les mandats de siège : 2 399 520 votes, tous couverts par l'intervalle fermé, dont 518
  émis le jour même de la `dateFin` du mandat de siège (5 en 15e, 0 en 16e, 513 en 17e). Une lecture
  exclusive aurait exclu ces 518 votants.
- [M] Pour les mandats de groupe, sur les votes de jour de fin qui séparent les deux lectures : 607
  où seule la lecture fermée retrouve le groupe du scrutin, 0 où seule la lecture exclusive le
  retrouve, 306 où aucune ne le retrouve.
- [I] La lecture fermée est la plus probable. Ce n'est pas démontré : un recoupement statistique ne
  remplace pas une définition. Autre limite : [M] aucun vote n'a lieu le jour de la `dateDebut` d'un mandat
  de siège (0 sur 2,4 millions), si bien que l'inclusion de `dateDebut` ne se teste pas ainsi.
- Traitement : hypothèse H1 consignée dans `dateSemanticsVersion = v1`, **testée à chaque import**
  (critère 5C), et les jours de bord restent `INSUFFICIENT` sans attestation (6.3, règle 4).
  Une demande de précision à l'Assemblée nationale (data.assemblee-nationale.fr) est à faire. Elle
  n'a pas été envoyée.

### 7.3 Autres incertitudes

| #   | Incertitude                                                                                        | Traitement                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Sémantique de `dateDebut` d'un mandat de groupe : date d'effet, de déclaration ou d'enregistrement | Les 268 votes de la 17e rangés dans un groupe avant son `dateDebut` enregistré montrent un décalage. Jours de bord `INSUFFICIENT` sans attestation |
| U2  | Valeur de `datePublication` quand elle est nulle                                                   | Stockée, jamais utilisée pour borner                                                                                                               |
| U3  | Stabilité des `PA`, `PO`, `PM` dans le temps                                                       | `rawHash` et diagnostic de divergence à chaque import                                                                                              |
| U4  | Les groupes de E1 valent-ils au jour du vote, avant ou après `miseAuPoint`                         | E1 jamais utilisé seul pour compter des voix sans recoupement avec `decompteVoix` (critère 5F)                                                     |
| U5  | Documentation de 2016, antérieure aux législatures étudiées                                        | Aucune règle ne s'appuie sur un texte seul : chacune est mesurée                                                                                   |
| U6  | Sénat : sémantique des dates non publiée                                                           | Piste Sénat séparée (10.6)                                                                                                                         |
| U7  | Absence de scrutins du 2022-02-25 au 2022-06-21 dans l'archive de la 15e                           | À confirmer avant de présenter la 15e                                                                                                              |

## 8. Import idempotent et validation [V2.1]

### 8.1 Règles d'import

1. **Sources figées** : URL en constante, hôtes autorisés limités à `data.assemblee-nationale.fr`
   et `data.senat.fr`, protocole HTTPS, extraction des archives par le module existant
   (`src/lib/parsing/unzip`). Aucune entrée utilisateur ne compose une URL ni un chemin.
2. **Intégrité avant tout** : taille égale à `content-length`, test d'archive, SHA-256. Un import ne
   reprend jamais un téléchargement partiel (cas vécu sur la 15e : une reprise avait produit une
   archive signalée en erreur et une extraction à un fichier de moins).
3. **Dry-run par défaut.** L'écriture exige un indicateur explicite, jamais activé par un cron. Le
   script affiche la base visée (`.env` et `.env.prod` pointent la même instance).
4. **Idempotence** : mêmes octets, même analyseur, aucune ligne écrite. Les quatre opérations de 4.2
   s'appliquent par clé. Deuxième exécution sur le même instantané : 0 insertion, 0 fermeture.
5. **Une correction n'écrase rien.** Même clé, `rawHash` différent : l'ancienne version est fermée
   (`toSeq`), la nouvelle est ajoutée. Le rapport de différences est produit **avant** l'écriture et
   relu : l'import s'arrête sur plus de 1 % de retraits d'un genre (4.7).
6. **Aucune suppression.** Un retrait est une fermeture de version.
7. **Transaction par flux.** Pas d'écriture partielle.
8. **Aucune écriture hors des tables nouvelles.** Les sync existants (`deputes.ts`,
   `senateurs.ts`) ne sont pas modifiés.
9. L'import s'exécute en CLI, à la main, depuis `scripts/`. Pas de route HTTP, pas de fonction
   Inngest dans ce lot, donc aucune nouvelle surface d'attaque.
10. Les originaux sont déposés dans `SourceArtifact` **avant** toute écriture de lignes : une ligne
    ne doit jamais référencer un fichier qu'on ne saurait pas restaurer.

### 8.2 Validations bloquantes avant écriture

| Contrôle                                                               | Seuil                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| `startDate > endDate`                                                  | 0                                              |
| Doublon de clé `(source, sourceRecordId)` dans le fichier              | 0                                              |
| `organeRef` de mandat absent des organes du même snapshot              | 0 (liste en cas d'écart)                       |
| Mandat de groupe sans acteur dans le fichier                           | 0                                              |
| Chevauchement de deux organes différents pour un acteur                | 0 attendu (mesuré 0), tout cas est listé       |
| Votant dont `mandatRef` n'est pas un mandat `ASSEMBLEE` du même acteur | 0 (mesuré 0)                                   |
| Votant dont le mandat de siège ne couvre pas la date, bornes incluses  | 0 (mesuré 0)                                   |
| Vote sur un jour hors de l'intervalle de siège en lecture exclusive    | informatif, égal à la baseline (518)           |
| `stateHash` recalculé depuis les tables différent de celui du snapshot | 0                                              |
| `organeRef` publié absent des organes (`PO0`)                          | pas bloquant, compté et exclu (baseline 1 916) |

### 8.3 Rapport de recoupement (non bloquant, jamais agrégé en un seul pourcentage)

Par scrutin et par législature : catégories `BOTH`, `SCRUTIN_ONLY`, `INTERVAL_ONLY`, `CONFLICT`,
`INSUFFICIENT` (par raison), `UNKNOWN`, avec la liste des scrutins concernés. La baseline de
référence est celle de 2.3 : toute différence est signalée, y compris dans le sens favorable.

## 9. Critères d'acceptation mesurables, phases 5A à 5F [V2.1]

Aucune phase ne s'exécute sans validation explicite de la précédente. Les chiffres « baseline »
sont ceux de la section 2.

### 5A. Types, analyse et rejeu purs, sans base de données

- Types métier, sérialisation canonique, fonctions de différences et de versions, résolveur pur :
  aucun import de `@/lib/db`, `@/generated/prisma`, `next/*` ni d'`ExternalId`, vérifié par un test.
- Le parseur pur lit 100 % des mandats `GP` de AMO30 (12e à 17e, 7 772 mandats, PR 5A-2, mesures en 2.5). Pour chaque
  ligne : acceptée ou rejetée avec une raison. Somme des deux = nombre de lignes du fichier.
- Les tests reproduisent **à l'unité près** les catégories exclusives de 2.3 (15e, 16e, 17e) sur les
  fichiers réels, hors dépôt. Les fichiers eux-mêmes ne sont jamais commités.
- Tests T1 à T5, T7, T8, T9 et T14 (6.6) passent sur le jeu synthétique.
- Les cinq archives (AMO30, scrutins 15e, 16e, 17e, et le CSV du Sénat) sont consignées avec taille,
  SHA-256 et `Last-Modified`. Baseline : archive de la 15e `ca00f314…085b`, 9 202 661 octets.

### 5B. Schéma

- SQL idempotent (`IF NOT EXISTS`) dans `prisma/migrations/manual/`, avec son script de retrait
  séparé, appliqué par `prisma db execute`. Pas de `db:push`.
- Comparaison avant et après du schéma des tables existantes : différence vide.
- Aucune clé étrangère partant d'une table existante vers une table nouvelle.
- T12 sur la base de préproduction (`.env.staging`) : `UPDATE` de contenu refusé, `DELETE` refusé,
  `toSeq` posé une fois, un second refus.
- `prisma validate` et `tsc --noEmit` passent. Aucune lecture applicative.

### 5C. Import brut AN

- Dry-run puis écriture : 16e et 17e d'abord, 15e ensuite.
- Pour chaque flux : `SourceArtifact` écrit avant les lignes, snapshot `seq = 1`, `stateHash`
  recalculé depuis les tables égal à l'enregistré.
- Nombre de lignes écrites = nombre de lignes du parseur. Deuxième exécution : 0 insertion, 0
  fermeture (T6).
- Tous les contrôles de 8.2 respectés. Les catégories de 2.3 reproduites à l'unité près.
- T13 : restauration d'un artefact par empreinte et nouvelle analyse, même `stateHash`.
- T10 sur un fichier d'essai : analyseur modifié, différences attribuées à l'analyseur.
- Taille des tables relevée en octets avant de poursuivre (arbitrage A1).
- Aucun instantané n'est utilisable avant une décision `RELEASED` consignée.

### 5D. Identités et continuité

- Chaque acteur de F a une décision de statut défini. Baseline (2.2) : F1 = 181, 412, 612 liés
  automatiquement avec nom compatible ; F2 = 1, 1, 1 en `LINKED_EXTERNAL_ID` après décision
  manuelle ou `AMBIGUOUS` ; F3 = 469, 204, 39 en `NONE`, aucune fiche créée.
- Fiches avec votes en base sans `officialId` : 9 (16e, 4 415 votes) et 1 (17e, 391 votes), toutes en
  `UNRESOLVED_IDENTITY` tant qu'aucune décision manuelle n'existe.
- 0 acteur lié à deux fiches, 0 fiche liée à deux acteurs du même `source`, 0 lien automatique sans
  nom de famille compatible.
- 0 ligne de continuité écrite par un programme, hors `PROPOSED`. Chaque décision validée a une
  preuve et un auteur déclaré.
- Liste de revue manuelle remise avant validation : changements de référence connus (SOC en 16e, UDR
  en 17e, AD vers UDR), les 14 scrutins à `PO0`, un acteur sans ligne de non-inscription avant son
  premier groupe.

### 5E. Résolveur et runs

- Fonction pure, exhaustivité de l'union vérifiée par le typage. Test d'architecture : aucun import
  de `Mandate`, `isCurrent`, `currentParty`, `MandateParliamentary`, `AnOrgan`.
- Propriétés : sans enregistrement d'un acteur, `UNKNOWN`. Sans intervalle mais avec E1,
  `SCRUTIN_ONLY`. Sans E1 un jour de bord, `INSUFFICIENT`.
- Jeu de cas : changement de référence sans lien (`CONFLICT`), avec lien validé (`viaLink`), `PO0`
  (`INSUFFICIENT`), jour de bord, « Membre » et « Président » (un seul candidat), acteur sans fiche,
  non-inscrit de transition, `OPEN_BEYOND_SNAPSHOT`.
- T1 à T5, T7, T8, T9, T14 passent, plus T2 mesuré sur les fichiers réels : le nombre de votes qui
  changent entre deux runs est publié, pas seulement « aucun écart ».
- Rejeu sur les 2 399 520 votes : répartition par statut publiée. Tout vote avec E1 valide, sans
  lien et en désaccord avec E2, sort en `CONFLICT`. Zéro `ATTESTED` en désaccord avec E1.
- Mode vérification d'un run : `outputHash` identique, deux exécutions.

### 5F. Positions historiques indexées par organe

- Pour chaque couple (scrutin, `organeRef`) : votes attestés + votes exclus par motif = votes
  nominatifs du groupe dans le fichier, sans perte.
- Comparaison avec `decompteVoix` du groupe pour le scrutin : écart listé scrutin par scrutin,
  jamais moyenné.
- Une position n'est publiable que si `excludedCount = 0` (arbitrage A4). Sinon elle est masquée
  avec son motif.
- Aucune ligne de `ScrutinGroupPosition`, `ParliamentaryGroupStats` ni `PoliticianParticipation`
  modifiée : somme de contrôle avant et après. `AN_GROUP_STATS_PUBLISHABLE` reste à `false`.
- T11 : révocation d'un snapshot d'essai, run invalidé, activation dépendante coupée.
- Aucune lecture publique : l'activation est une phase distincte (10.3), non comprise dans 5F.

### Activation (hors 5A à 5F)

Critères propres, mesurés sur la base de préproduction avant toute activation en production :

- Propagation de l'extinction : délai mesuré, sur au moins 30 sondes espacées dans le temps, jusqu'à
  ce que 100 % des réponses soient revenues à l'état éteint. Valeur mesurée consignée dans ce
  document. Cible proposée : 60 secondes. [U] Cette cible n'est pas une garantie, elle dépend de la
  plateforme.
- Coût de l'extinction : nombre de pages régénérées relevé, périmètre borné.
- Comportement en cas d'erreur de lecture du réglage : éteint, vérifié par injection de panne.
- Arrêt d'urgence : chacun des deux niveaux (10.3) testé.

## 10. Activation, déploiement et retour arrière [V2.1]

Cette section décrit une conception. **Aucun interrupteur n'est créé, aucune table de réglage, aucune
route.** Rien ne s'active avant la phase d'activation, qui exige une validation explicite.

### 10.1 Principe

Ajouter, ne jamais remplacer. Les tables nouvelles n'ont aucun lien entrant depuis les tables
existantes. Les surfaces publiques existantes continuent de lire `ScrutinGroupPosition` tant que
l'activation n'a pas eu lieu, et le garde-fou de `group-attribution.ts` reste en place.

### 10.2 Les mécanismes de cache réels du projet

Relevés dans `origin/main` et dans la documentation de Next installée.

| Constat [F]                                                                                                                                                                                                                                    | Source                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| La page d'un scrutin est en ISR : `export const revalidate = 86400`, « 24h backstop ». Le listing est à `revalidate = 300`                                                                                                                     | `src/app/parlement/votes/[slug]/page.tsx:68`, `.../votes/page.tsx:8` |
| Les lectures de positions de groupe sont des fonctions `"use cache"` avec `cacheTag("votes")` et `cacheLife("synced")`. Le profil `synced` vaut `stale 3600, revalidate 86400, expire 604800`                                                  | `src/lib/data/groupes.ts:28`, `next.config.ts:31`                    |
| Le tag `"votes"` couvre une surface très large du site. Une purge globale de ce tag a déjà mis la production en pause (plafond de dépense Vercel, 2026-07-29)                                                                                  | historique d'exploitation du projet                                  |
| Il existe un modèle `FeatureFlag` et `isFeatureEnabled()`. `getFeatureFlags()` est en `"use cache"`, `cacheLife("synced")`, tag `feature-flags` : **le réglage est lu avec une fraîcheur de 24 h** tant que le tag n'est pas purgé             | `src/lib/feature-flags.ts`                                           |
| La route d'administration qui bascule un flag appelle `revalidateTags(["feature-flags"])` avec le profil `"minutes"` **puis `revalidatePath("/", "layout")`**, qui purge le layout racine, donc le site entier                                 | `src/app/api/admin/feature-flags/[id]/route.ts`                      |
| Cette route écrit dans `auditLog` sans `userId` ni `userEmail`. L'authentification est `isAuthenticated()`, un booléen : **aucune identité d'administrateur n'existe dans le journal**                                                         | même fichier, `src/lib/api/with-admin-auth.ts`                       |
| `revalidateTag(tag, profil)` marque les données périmées et sert l'ancienne valeur pendant que la nouvelle se calcule. `revalidateTag(tag, { expire: 0 })` ne sert **jamais** de valeur périmée : le prochain accès recalcule                  | documentation Next 16.3.4 installée, `revalidateTag.md`              |
| Avec le gestionnaire de cache par défaut, un résultat `"use cache"` en environnement serverless n'est pas réutilisé de façon fiable entre requêtes. Un nouveau déploiement ne reprend pas ces entrées (la clé contient l'identifiant de build) | documentation Next, `use-cache.md`                                   |
| `package.json` déclare `next ^16.4.0`, le `node_modules` local contient 16.3.4                                                                                                                                                                 | `package.json`, `node_modules/next/package.json`                     |

Conséquences :

1. **Un réglage lu dans le rendu d'une page ISR n'agit qu'à la régénération de la page.** Par défaut,
   jusqu'à 24 h. Un interrupteur en base ne se « bascule » donc pas en quelques secondes : c'était
   faux dans la V2.
2. Pour agir plus vite, il faut purger. La seule purge acceptable est **étroite** : un tag dédié
   `historical-groups`, jamais `"votes"`, jamais `revalidatePath("/", "layout")`.
3. Le mécanisme existant des `FeatureFlag` ne convient pas, pour quatre raisons : sa route purge
   le site entier à chaque bascule ; son cache dure 24 h ; il peut être basculé depuis l'écran
   générique `/admin/feature-toggles` sans aucune précondition ; il ne porte pas un run, un
   périmètre et une validation.
4. [U] La documentation consultée est celle de la version installée (16.3.4), pas de la version
   déclarée. Les sémantiques de `revalidateTag` et de `use cache` sont à relire après `npm install`.
5. [U] Le comportement réel de la propagation d'une purge de tag entre instances et régions sur
   Vercel n'est pas vérifié ici. Il se mesure en préproduction (critères d'activation, section 9).

### 10.3 Stratégie d'activation

**Réglage dédié.** Une table à part, une ligne par surface (page de scrutin, listing, fiche du
député) et une ligne `GLOBAL` : `enabled` (faux par défaut), `activeRunId`, `scope` (législatures),
`version`, `updatedAt`. Pas de réutilisation de `FeatureFlag`.

**Désactivation par défaut, trois couches, toutes nécessaires pour être « actif ».**

1. Une constante dans le code, livrée à `false`. Mettre `true` est un changement de code relu et
   déployé à la main : l'activation ne peut pas arriver par accident.
2. Le réglage de surface : ligne absente ou `enabled = false`, c'est éteint.
3. Le réglage global `killed`, vrai = tout éteint, quel que soit le réglage de surface.

**Lecture.** Une fonction de lecture du réglage, tag **`historical-groups`**, fraîcheur 24 h comme le
reste (pas de profil court : il augmenterait le coût d'écriture ISR, déjà identifié comme un poste
coûteux). Tout ce qui rend des données historiques (lectures de positions par organe, bloc de la
page de scrutin) porte le **même** tag. Une purge de ce seul tag atteint donc le réglage et les
pages qui en dépendent, et rien d'autre.

**Propagation entre instances.** Pas de dépendance à la mémoire d'une instance : la décision est
prise à la génération de la page, qui est mise en cache par la plateforme, et invalidée par tag.
[U] Mesure obligatoire en préproduction (section 9).

**Délai maximal de désactivation.** Défini comme la somme du délai d'exécution de l'action d'arrêt
et de la propagation de la purge, mesurée. Deux bornes :

- **Nominal** : après `revalidateTag("historical-groups", { expire: 0 })`, le prochain accès à chaque
  page concernée recalcule sans servir l'état précédent. Délai à mesurer, cible proposée 60 secondes.
- **Pire cas** : si la purge échoue, la page régénère à l'échéance ISR, **24 h** au plus.

**Arrêt d'urgence global, deux niveaux indépendants.**

1. `GLOBAL.killed = true` : une action d'administration, un seul appel de purge de tag étroit. Dépend
   de la base et de la purge.
2. Variable d'environnement `HISTORICAL_GROUPS_KILL=1`, lue avant tout le reste : indépendante de la
   base. Elle exige un redéploiement manuel depuis le dashboard Vercel, ce qui change aussi
   l'identifiant de build, donc repart d'un cache de fonctions vide [F pour `use cache`, U pour le
   cache ISR].

**Erreur de lecture du réglage : fermé.** La fonction de lecture **lève** l'erreur au lieu de renvoyer
une valeur par défaut (une erreur levée n'est pas mise en cache). L'appelant non mis en cache
l'attrape, retourne « éteint » et signale l'incident à Sentry avec une empreinte fixe, une fois par
minute au plus. Jamais de repli vers « dernier état connu allumé ». Limite connue : une page
régénérée pendant une panne de lecture peut garder la version éteinte jusqu'à sa prochaine
régénération. C'est l'affichage actuel, sûr, avec son encart d'indisponibilité.

**Autorisation.** Routes dédiées sous `/api/admin/historical-read/`, protégées par `withAdminAuth()`,
`withValidation(schéma)`, sans réutiliser la route des `FeatureFlag`.

- **Allumer** : exige des préconditions vérifiées côté serveur. Run `COMPLETED`. Tous les instantanés
  épinglés `RELEASED` à cet instant. Run non invalidé. Empreinte du rapport de validation de 5F
  fournie et égale à celle enregistrée. Confirmation explicite (`confirmRunId`). Un périmètre
  limité. Un champ `decidedBy` renseigné.
- **Éteindre** : session d'administration seule, sans précondition.
- **Limitation de fréquence** : une bascule par surface et par intervalle de dix minutes, pour ne pas
  rejouer le schéma de purges répétées. L'arrêt d'urgence y échappe.

**Journal d'audit.** Une ligne `auditLog` par changement : action (`ENABLE`, `DISABLE`, `KILL`),
`entityType = "HistoricalReadSetting"`, surface, avant et après, `runId`, périmètre, adresse IP,
agent. **Limite assumée** : l'authentification ne porte pas d'identité (constat du tableau). Le champ
`decidedBy` est déclaratif, pas authentifié. Le journal prouve qu'une action a eu lieu et d'où elle
est venue, pas qui l'a faite. Arbitrage A11.

**Coût.** L'activation et l'extinction purgent un tag étroit, jamais le layout racine. Le périmètre
d'une activation est borné (liste de législatures), et croît par étapes. Une purge de ce tag
régénère les pages concernées à leur prochaine visite : le coût est proportionnel au trafic de ces
pages, à relever à la première activation.

### 10.4 Ordre de déploiement

1. 5A à 5E sans effet visible. Rien ne lit les tables nouvelles en production.
2. 5F : positions calculées sous un `runId`, lecture éteinte. Revue sur un échantillon en
   préproduction (`.env.staging`, base distincte).
3. Mesures de la section « Activation » des critères (propagation, coût, panne de lecture, arrêt).
4. Création du réglage dédié et des routes : PR séparée, validée séparément.
5. Activation par surface et par périmètre, chaque fois une décision datée.

### 10.5 Retour arrière

| Action                                            | Effet                                                                                             | Destructif |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| Éteindre la surface                               | Retour à l'état actuel après purge du tag étroit. Nominal : délai mesuré. Pire cas : 24 h         | non        |
| Arrêt d'urgence niveau 1 (`GLOBAL.killed`)        | Idem pour toutes les surfaces                                                                     | non        |
| Arrêt d'urgence niveau 2 (variable + déploiement) | Indépendant de la base, nécessite un déploiement manuel                                           | non        |
| Ne plus lire un `runId`                           | Les positions du run restent stockées, plus lues                                                  | non        |
| Mise en quarantaine d'un instantané               | Aucun nouveau run ne s'y épingle                                                                  | non        |
| Révocation d'un instantané                        | Runs épinglés invalidés, activation dépendante coupée dans la même opération                      | non        |
| Suppression des tables                            | Seulement sur décision séparée, après copie des artefacts. Aucune raison technique de la demander | oui        |

La base de développement et la base de production sont la même instance (`.env` et `.env.prod`).
Tout script d'import doit refuser de tourner sans l'indicateur d'écriture et afficher la base
visée. Aucune étape n'écrit ailleurs que dans les tables nouvelles.

### 10.6 Piste Sénat, séparée

Le Sénat ne reprend ni le modèle de preuve E1 (aucun groupe dans le JSON de scrutin) ni les mêmes
validations. Règles propres :

- Pas de preuve au scrutin utilisable de façon fiable : le HTML publie les groupes par nom de
  sénateur, sans identifiant. Un recoupement par nom est un rapprochement flou, interdit ici sans
  validation.
- 1 064 appartenances sur 3 584 sans date de début, 347 sans date de fin dont 124 « UMP » [M].
  `endState = UNKNOWN` dans ces cas, réponse `INSUFFICIENT`.
- Une ligne par appartenance et fonction : on conserve toutes les lignes, on regroupe à la lecture.
- Le renouvellement par série est une information de mandat (`Mandate.senateSeries`), pas une
  information de groupe. Aucune règle de groupe n'en est déduite.
- Les votes du Sénat en base couvrent 2024 et 2025 seulement (340 sénateurs). Le périmètre utile est
  borné.
- À établir avant d'écrire une ligne : les commentaires de colonnes de l'export PostgreSQL du Sénat,
  et la sémantique des dates, par demande au Sénat si besoin.

## 11. Menace, données personnelles et sécurité

- Pas de nouvelle route ni de nouvelle surface d'entrée : import en CLI, tables lues par aucun
  contrôleur public dans ce lot.
- SSRF : hôtes autorisés figés (8.1). Traversée de chemin : extraction par le module existant,
  dossier temporaire neuf, aucune entrée utilisateur.
- Contrôle d'accès : les décisions manuelles d'identité et de continuité passent par
  `withAdminAuth()`, `withValidation(schema)` et `db.auditLog`. [V2.1] L'authentification du projet
  ne porte aucune identité d'administrateur : l'auteur d'une décision est un champ déclaratif
  (arbitrage A11).
- [V2.1] Les décisions d'identité ne portent pas de clé étrangère vers `Politician` : le journal
  survit à une fusion ou une suppression de fiche, avec un contrôle des identifiants orphelins.
- Dépôt public : ce document ne contient ni nom de personne, ni titre d'affaire, ni donnée
  personnelle. Les identifiants cités sont des références de cas à relire, pas des fiches.
- Données personnelles : minimisation (3). [U] Confirmer que le stockage de noms et prénoms
  d'anciens parlementaires sans fiche, issus d'une licence ouverte, est compatible avec la doctrine
  du projet, qui n'a pas de règle écrite sur ce point.

## 12. Décisions [V2.1]

Les renvois ci-dessous (A1 à A13) sont ceux utilisés dans tout le document. Les numéros A1 à A8 sont
ceux de la V2, A9 à A13 sont nouveaux. A2 est modifié.

### 12.1 Retenues, appliquées sauf objection

| #   | Décision                                                                                                               | Pourquoi                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A5  | Décisions de continuité et d'identité **en base**, journaux en ajout seul, sans fichier dans le dépôt                  | Décisions éditoriales, datées, signées. Un fichier public exposerait les relecteurs         |
| A6  | Le résolveur prend l'identifiant officiel en entrée principale ; `politicianId` est converti par le journal d'identité | Les acteurs sans fiche doivent rester résolubles                                            |
| A8  | 15e après les 16e et 17e, et seulement une fois l'absence de scrutins du 2022-02-25 au 2022-06-21 expliquée            | 469 acteurs sur 651 sans fiche, aucun vote en base                                          |
| A14 | `AnOrganGroupLink` de la V2 retiré du périmètre 5A à 5F                                                                | Inutile aux positions indexées par organe. Évite une relation à signification non démontrée |

### 12.2 Ouvertes, avec la position recommandée

| #   | Question                                                                                                      | Position                                                                                                                                                                   | À trancher avant |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| A1  | Stocker `ScrutinVoterAttestation` (1,9 million de lignes, par version) ou la relire dans les archives         | **Stocker**, 16e et 17e d'abord. Mesurer la taille en octets. Si elle dépasse le budget, se restreindre aux votes en désaccord                                             | 5C               |
| A9  | Où garder les fichiers d'origine                                                                              | **Stockage d'objets privé, plus une copie hors ligne.** Vérifier que le Blob du projet accepte l'accès privé : l'usage actuel est public (`export-territoires-release.ts`) | 5C               |
| A10 | Rétention des artefacts                                                                                       | **Ne jamais supprimer** un artefact référencé par un run publié. Imports manuels seulement, donc volume borné (environ 61 Mo par jeu complet)                              | 5C               |
| A3  | `dateFin` inclusive : l'adopter en `v1`, ou refuser de résoudre tant que l'Assemblée n'a pas répondu          | **Adopter en `v1`** avec le traitement du jour de bord (6.3). Risque borné : 0,07 à 0,11 % des votes un jour de bord                                                       | 5E               |
| A12 | Les trois fiches `LINKED_EXTERNAL_ID` (une par législature)                                                   | **Décision manuelle**, après contrôle du nom. Jamais automatique                                                                                                           | 5D               |
| A13 | Demandes de précision à l'Assemblée (sens de `dateDebut` et `dateFin`) et au Sénat (dates, export PostgreSQL) | **À envoyer par le mainteneur avant 5E.** Aucune réponse n'est présumée                                                                                                    | 5E               |
| A7  | Non-inscrit de transition : affiché sur le site, avec quel libellé                                            | **Après 5E.** Le modèle l'expose déjà comme fait sourcé                                                                                                                    | 5F               |
| A2  | Mécanisme d'activation (modifié)                                                                              | **Réglage dédié en base + purge d'un tag étroit + arrêt d'urgence à deux niveaux**, pas `FeatureFlag`, pas de variable d'environnement seule (10.3)                        | Activation       |
| A4  | Position publiée quand une partie des votes du groupe est exclue                                              | **Masquer dès qu'un vote est exclu** (`maxExcludedPerGroup = 0`), assouplissable plus tard avec mention visible                                                            | 5F               |
| A11 | Identité de l'auteur d'une décision, l'authentification n'en portant aucune                                   | **Champ déclaratif `decidedBy`** et journal d'audit, avec la limite écrite. Ajouter des identités d'administration est un chantier à part                                  | Activation       |

## 13. Ce qui n'a pas été fait [V2.1]

- Aucune migration, aucun DDL ni DML, aucune écriture, aucun import, aucun recalcul, aucune création
  de réglage ou d'interrupteur.
- Aucune demande de précision envoyée à l'Assemblée ni au Sénat.
- L'export PostgreSQL du Sénat n'a pas été téléchargé.
- La taille en octets des tables proposées n'est pas mesurée. Le stockage privé des archives n'est
  pas vérifié.
- Le comportement des `miseAuPoint` par rapport à la ventilation n'a pas été étudié.
- La propagation réelle d'une purge de tag sur Vercel n'a pas été mesurée.
- La documentation de Next consultée est celle de la version installée (16.3.4), pas de la version
  déclarée (`^16.4.0`).
- Les trois cas `LINKED_EXTERNAL_ID` n'ont pas fait l'objet d'un contrôle de nom.
- Les aspects RGPD de la section 11 n'ont pas été validés.

## 14. Première PR du lot 5 [V2.1]

Titre de travail : « Socle du lot 5 : types métier, résolveur pur et tests (5A) ». Livrée en PR
brouillon, relue avant toute fusion.

### 14.1 Périmètre

Strictement additif : un document, un module sans effet de bord, ses tests. Rien n'est branché.

| Ajout                                                      | Contenu                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/audits/parlement-historique-lot5-architecture-v2.md` | Ce document, version 2.1 relue                                                                                                                                                                                                                                                                                                                           |
| `src/lib/parlement/historical-groups/types.ts`             | Types : identifiants de marque (`OfficialActorId`, `GroupRef`, `ScrutinId`), `CivilDate`, `StartState`, `EndState`, `GroupMembershipEvidence`, `ScrutinAttestationEvidence`, `Resolution` (union exhaustive), motifs, `RunConfig`, `ExclusionRule`. Sans importer `@/generated/prisma` : la chambre est une union de deux littéraux, `"AN"` et `"SENAT"` |
| `.../civil-date.ts`                                        | Lecture stricte d'un `xs:date`, comparaison de jours civils, aucune conversion de fuseau                                                                                                                                                                                                                                                                 |
| `.../canonical.ts`                                         | Sérialisation canonique, SHA-256 (`node:crypto`), `stateHash`, `inputHash`, `outputHash`                                                                                                                                                                                                                                                                 |
| `.../versioning.ts`                                        | `diffSnapshots` (ADDED, UNCHANGED, CORRECTED, REMOVED), `stateAt(rows, seq)` par intervalle ouvert à droite, garde-fou de retraits                                                                                                                                                                                                                       |
| `.../date-semantics.ts`                                    | Interprétation `v1` (intervalle fermé), détection du jour de bord, borne de `OPEN_AT_SNAPSHOT`                                                                                                                                                                                                                                                           |
| `.../resolver.ts`                                          | `resolveGroupAtDate` pur : reçoit ses preuves déjà chargées, applique la hiérarchie E1/E2 de la section 5 et les règles de 6.3                                                                                                                                                                                                                           |
| `.../run-contract.ts`                                      | Validation de `RunConfig`, calcul de `inputHash`, vérification des préconditions d'un run (snapshots `RELEASED`, `stateHash`)                                                                                                                                                                                                                            |
| `src/lib/parlement/historical-groups/__tests__/`           | Tests ci-dessous, avec un jeu synthétique `__fixtures__/` (identifiants fictifs, aucun nom réel)                                                                                                                                                                                                                                                         |

### 14.2 Tests

| Fichier                   | Couvre                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `civil-date.test.ts`      | `2024-02-29` valide, `2024-02-31` rejeté, jamais d'heure, jamais d'UTC                                                                                                                                                                                                                           |
| `canonical.test.ts`       | Ordre des clés sans effet, mêmes entrées même empreinte, une valeur modifiée change l'empreinte                                                                                                                                                                                                  |
| `versioning.test.ts`      | Les quatre opérations, `stateAt` aux deux bords, retour d'une clé retirée, garde-fou à 1 %, T6 et T7 (versions pures)                                                                                                                                                                            |
| `date-semantics.test.ts`  | Intervalle fermé aux deux bouts, jour de bord, `OPEN_AT_SNAPSHOT` jusqu'à la borne et `OPEN_BEYOND_SNAPSHOT` au-delà                                                                                                                                                                             |
| `resolver.test.ts`        | Une entrée par ligne du tableau de 5 et par règle de 6.3 : `PO0`, changement de référence avec et sans lien, même sigle sans lien, « Membre » et « Président », deux organes simultanés, non-inscrit de transition, absence d'enregistrement (`UNKNOWN`), identité non résolue. Propriétés de 5E |
| `run-determinism.test.ts` | T1 à T5, T8, T9, T14 sur le jeu synthétique à deux instantanés. `outputHash` de référence épinglé                                                                                                                                                                                                |
| `architecture.test.ts`    | Aucun fichier du module n'importe `@/lib/db`, `@/generated/prisma`, `next/*`, `Mandate`, `isCurrent`, `currentParty`, `MandateParliamentary`, `AnOrgan`                                                                                                                                          |

Cette PR couvre la première moitié de la phase 5A (types, versions, résolveur, tests purs). La seconde
moitié, l'analyseur AMO30 et la mesure sur les fichiers réels, fait l'objet d'une PR suivante.

### 14.3 Ce que la PR ne contient pas

- Aucune modification de `prisma/schema.prisma`, aucun SQL, aucun script, aucune route, aucun réglage.
- Aucune modification de `an-organes.ts` ni d'un fichier existant : la lecture stricte des dates y est
  privée, elle est réécrite à part dans `civil-date.ts` plutôt que d'ouvrir un fichier du lot 3. Le
  doublon est signalé en commentaire, à résorber dans une PR de ménage séparée.
- Pas d'analyseur AMO30 ni de lecture de fichiers : ils font l'objet de la PR suivante.
- Aucun fichier officiel dans le dépôt.

### 14.4 Critères d'acceptation de la PR

- `vitest` sur le dossier du module, `tsc --noEmit` (filtré sur `.next/`) et le lint passent.
- Diff purement additif : fichiers nouveaux et le document.
- Chaque ligne des tableaux de 5 et de 6.3 a au moins un test dont l'échec est possible : chaque test
  est écrit pour échouer si la règle correspondante est retirée (revue par mutation à la main sur
  trois règles).
- L'`outputHash` de référence est épinglé dans un test, pour que toute modification de logique
  sans nouveau `resolverVersion` fasse échouer la CI (T14).
- Les tests de garde existants du dépôt (architecture, `ci-critical-guards`) passent.
- Zéro ligne personnelle dans les lignes ajoutées (dépôt public).
- Message de commit au format du projet : titre impératif court, une phrase de pourquoi au plus.

### 14.5 Décisions à prendre avant cette PR

Aucune parmi A1 à A13 ne bloque cette PR. Elle encode les positions retenues (`dateSemantics v1`,
masquage strict, journaux en ajout seul) sous forme de paramètres de `RunConfig`, modifiables sans
toucher au code appelant.

Validés : le périmètre 14.1, le chemin `src/lib/parlement/historical-groups/` et la décision de ne
pas toucher `an-organes.ts`.

### 14.6 Écarts avec le périmètre annoncé, constatés à l'implémentation [PR 1]

La PR livrée suit 14.1, avec ces différences, toutes demandées par la validation ou nées du test :

| Écart                                                                                              | Raison                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exclusion.ts`, `publication.ts`, `identity.ts`, `run-execution.ts` ajoutés                        | La décision d'exclusion (analyse) et la décision de publication (éditorial) sont séparées, et les tests de déterminisme ont besoin d'une exécution de run pour vérifier des résultats métier |
| `versioning.ts` porte aussi les journaux de décisions (`effectiveDecisions`)                       | Le test T5 exige un plafond de décision appliqué sans horloge                                                                                                                                |
| `transitional` vaut `boolean \| null`                                                              | Sans enregistrement de non-inscription, ou sans date de formation des groupes, on ne peut pas l'affirmer : `null`, pas `false`                                                               |
| `RunConfig.evidence.placeholderOrganRefs`                                                          | La liste des références de remplissage (`PO0`) est une donnée du run, pas une constante cachée dans le résolveur                                                                             |
| Règle d'exclusion `DATE_UNDETERMINED` ajoutée à la configuration d'exemple                         | La validation de complétude a révélé que `START_DATE_UNKNOWN` et `END_STATE_UNKNOWN` n'étaient couverts par aucune règle de l'exemple de 6.5                                                 |
| Empreinte d'état : lignes en tableaux JSON, plus `genre\|clé\|rawHash`                             | Un séparateur dans une clé ne doit pas pouvoir confondre deux états                                                                                                                          |
| `RunPins.preparedInputsHash`, `InputProvenance`, `checkRunInputs`, `RunInputContractError` ajoutés | Revue de la PR : les votes et identités sont préparés hors de la fonction, la frontière est écrite (6.7) et vérifiée contre les épingles                                                     |
| Diagnostic `E2_INDETERMINATE` et `RESOLVER_VERSION` portée à `2`                                   | Revue de la PR : un intervalle indéterminé ne s'efface plus derrière un vote valide (6.3, règle 10). La logique change, donc la version                                                      |
| `__fixtures__/golden.ts`                                                                           | Empreintes de référence par version du résolveur (T14)                                                                                                                                       |
| Aucun type ne reprend un nom de table ou de colonne                                                | La représentation SQL reste à décider en 5B. Les intervalles de snapshots sont modélisés comme un concept (`RecordVersion`), pas comme un schéma                                             |

## 15. PR 5A-2 : parseurs et validation sur fichiers officiels

Deuxième moitié de la phase 5A, sans migration ni écriture en production.

| Élément                                          | Rôle                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `source-shape.ts`                                | Lecture des formes XML converties en JSON (objet, liste, `null`, `#text`, nombres en chaînes)         |
| `parse-amo30.ts`                                 | Organes, mandats de groupe, mandats de siège, classement non-inscrit à deux signaux                   |
| `parse-scrutin.ts`                               | Attestations, décomptes officiels, Congrès identifié à part, mises au point comptées                  |
| `official-validation.ts`                         | Catégories exclusives, jours de bord, lien au siège, chevauchements, invariantes, contrôles bloquants |
| `scripts/validate-historical-groups.ts` et `lib` | Lecture des archives, comparaison à la baseline, rapport JSON                                         |
| `parlement-historique-lot5-baseline-5a2.json`    | Agrégats, tailles et SHA-256 complets, aucune identité                                                |

**Reproductibilité.** Même SHA-256 et même référentiel que la baseline : comparaison stricte, tout
écart est un échec (`STRICT_MISMATCH`). Une archive dont les octets diffèrent (ou lue contre un autre
AMO30) : `CHANGED_INPUT`, liste des chiffres qui changent, jamais un échec. La baseline est un
instantané de ces quatre fichiers, pas une vérité mouvante : pour la rejouer strictement, il faut
conserver les octets d'AMO30.

**Ce qui fait échouer la commande.** Archive illisible, tronquée ou corrompue ; nom d'entrée absolu,
parent (`..`), avec antislash, doublon ou lien symbolique ; dépassement des limites (entrées, taille
par entrée, taille totale, taux de compression) ; dossier inattendu ; invariante de somme rompue ;
contrôle bloquant de 8.2 non nul ; différence sur octets identiques.

**Sûreté.** Aucune extraction sur disque : les entrées sont lues en mémoire, une à une, donc il n'y a
pas de sortie à confiner. Ni réseau, ni base, ni secret, ni option pour en passer un. Les noms des
acteurs ne sont jamais lus : aucun rapport ne peut en porter.

**Ce que la PR ne contient pas.** Aucune modification de Prisma, de SQL, des synchronisations, de
calculs persistés ou de statistiques publiées. Aucun import. Le résolveur de la PR 1 n'est pas
modifié et n'est pas importé par la classification.
