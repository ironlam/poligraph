# Territoires : protocole de sélection et de saisie des décisions

Date : 14 octobre 2026. Statut : **version 2.1, arrêtée par la rédaction (v2 le 13 octobre 2026, Kourou ajoutée le 14)**. Publiée
sur `/methodologie/decisions-territoires`. Les points encore ouverts (mapping des sources) sont
listés au §8 et bloquent la collecte, pas le protocole.

Références : cadrage produit et UX du 8 octobre (§6.1 à §6.4), plan d'implémentation (lot 2).

## 1. Ce que le pilote publie

Des notices de décisions collectives adoptées par un conseil municipal ou communautaire, chacune
rattachée à l'institution qui l'a adoptée, datée et prouvée par un document officiel, avec
l'endroit exact où la preuve se trouve dans ce document.

Le pilote publie une sélection documentée. Ce n'est pas un relevé exhaustif : le nombre de
décisions référencées ne mesure ni l'activité ni la performance d'un conseil, et la page le dit.

Trois couches se superposent (§3). Seule la première produit des notices rédigées par Poligraph.
Les deux autres renvoient vers la source officielle ou passent par le même circuit de relecture.

## 2. Choix des treize communes

**Liste arrêtée le 13 octobre 2026.** Les critères ci-dessous ont servi à la construire. La liste retenue
est publiée avec, pour chaque commune, le critère qui l'a fait entrer.

| #   | Commune            | Dép. | Population | Strate          | Source ouverte                |
| --- | ------------------ | ---- | ---------- | --------------- | ----------------------------- |
| 1   | Taugon             | 17   | 772        | moins de 1 000  | jeu SCDL, mis à jour 09/2026  |
| 2   | Bouloc             | 31   | 4 618      | 1 000 à 9 999   | jeu SCDL, 08/2026             |
| 3   | Boé                | 47   | 5 846      | 1 000 à 9 999   | jeu de délibérations, 10/2025 |
| 4   | Neuville-sur-Saône | 69   | 7 812      | 1 000 à 9 999   | 09/2026                       |
| 5   | Cogolin            | 83   | 12 301     | 10 000 à 99 999 | 09/2026                       |
| 6   | Rillieux-la-Pape   | 69   | 31 389     | 10 000 à 99 999 | 08/2025                       |
| 7   | La Possession      | 974  | 36 568     | 10 000 à 99 999 | jeu SCDL, 08/2026             |
| 8   | Saint-Herblain     | 44   | 50 973     | 10 000 à 99 999 | 07/2026                       |
| 9   | Villejuif          | 94   | 60 183     | 10 000 à 99 999 | 09/2026                       |
| 10  | Antibes            | 06   | 77 637     | 10 000 à 99 999 | 07/2026                       |
| 11  | Brest              | 29   | 142 346    | 100 000 et plus | jeu SCDL, 10/2026             |
| 12  | Saint-Étienne      | 42   | 173 136    | 100 000 et plus | 01/2026                       |
| 13  | Kourou             | 973  | 24 824     | 10 000 à 99 999 | pages de PDF, 06/2026         |

Populations et dates de mise à jour relevées le 12 octobre 2026. Les populations sont à re-vérifier
sur le millésime légal en vigueur avant publication.

Points non réglés :

- **Deux communes ultramarines de bassins différents** : La Possession (974, jeu SCDL) et Kourou
  (973, 122 PDF de délibérations sur le site de la commune, pas de jeu ouvert : saisie depuis les
  documents). Kourou a été ajoutée le 14 octobre 2026 en treizième commune, sans en retirer une
  autre. Son maire en base n'a qu'un mandat, depuis le 26 mars 2026 : la profondeur couverte est
  « depuis mars 2026 ».
- **Les cas d'épreuve** du critère 5 ne se lisent pas dans les fichiers ouverts. Ils sont constatés
  commune par commune, et la liste peut changer si un cas reste sans exemple.
- **Équilibre politique** : contrôlé après coup le 13 octobre 2026, jamais utilisé pour choisir
  (critère 6). Nuance de la liste élue en 2026 (ministère de l'Intérieur) : gauche 4 (PS, NFP à
  deux reprises, DVG), centre 2 (DVC à deux reprises), droite 3 (LR, DVD à deux reprises), divers
  ou sans nuance 4 (DIV à trois reprises dont Kourou, Taugon sans nuance). Aucune concentration. Limite : c'est
  la nuance de la liste, pas l'appartenance déclarée du maire.

### Critères

1. **Tailles différentes.** Au moins une commune par strate : moins de 1 000 habitants, 1 000 à
   9 999, 10 000 à 99 999, 100 000 et plus. Population légale INSEE, millésime indiqué.
2. **Outre-mer inclus.** Au moins une commune d'un département d'outre-mer (971, 972, 973, 974,
   976), de préférence deux de bassins différents. Les collectivités d'outre-mer se traitent à
   part : Saint-Barthélemy, Saint-Martin et Wallis-et-Futuna n'ont pas de commune, les TAAF et
   Clipperton non plus. Elles sortent du pilote par construction, et la page le signale au lieu
   de les taire. Saint-Pierre-et-Miquelon, la Polynésie française et la Nouvelle-Calédonie ont
   des communes, mais les règles de publicité de leurs actes diffèrent de celles du CGCT
   métropolitain : à vérifier commune par commune avant de les retenir.
3. **Sources accessibles.** Les délibérations ou le recueil des actes sont publiés en ligne
   et consultables sans compte. Depuis le 1er juillet 2022, la publication électronique est la
   règle, mais les communes de moins de 3 500 habitants peuvent en choisir une autre : pour
   elles, vérifier la disponibilité avant de les retenir. Un jeu ouvert non mis à jour depuis
   2025 écarte la commune (Marseillan, Le Pré-Saint-Gervais et Lys-Saint-Georges l'ont été).
4. **Période institutionnelle établissable.** Le maire en fonction est établi dans Poligraph, et
   les dates de début et de fin des mandats couverts sont connues au jour près. Sans cela, les
   décisions de la commune s'afficheraient sous « période institutionnelle non établie ».
5. **Cas d'épreuve couverts** (cadrage §6.4). L'ensemble des treize communes doit contenir au
   moins : un changement de maire sans nouvelle élection générale ; une réélection de la même
   personne ; une décision adoptée sous un maire et publiée sous son successeur ; un acte
   intercommunal concernant la commune ; un résultat collectif sans votes individuels.
6. **Aucun critère politique.** Ni l'étiquette du maire ni la couleur du conseil n'entrent dans le
   choix. Une fois la liste établie, contrôler qu'elle ne se concentre pas sur une famille
   politique ; si c'est le cas, revoir le choix sur les critères 1 à 5, jamais en visant une
   étiquette.
7. **Pas de commune choisie pour une actualité.** Une commune ne rejoint pas le pilote parce
   qu'une affaire, une polémique ou un fait divers la met en avant.

### Biais assumé : les communes qui publient

Le pilote ne peut contenir que des communes dont les actes sont en ligne et lisibles par machine.
Ce sont, en moyenne, des communes plus grandes, mieux équipées et plus transparentes que celles
qui ne publient pas. Le pilote ne dit donc rien de la France des communes qui ne publient pas, et
ses résultats ne se généralisent pas. La page l'écrit en clair.

Le jeu de communes de recette (`territoires-recette.md`) sert aux tests d'affichage. Il ne
constitue pas la liste du pilote.

## 3. Choix des actes : trois couches

Choisir à la main « les actes importants » introduirait un biais éditorial. Se limiter à des
matières communes garantit un traitement identique, mais fait perdre à l'habitant ce qui est
propre à sa commune (un équipement, un projet d'aménagement, un litige local). D'où trois couches.

| Couche              | Contenu                                                                                                                             | Revue humaine            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1. Socle commun     | Les mêmes matières pour toutes les communes (liste ci-dessous), en notices documentées avec l'endroit exact de la preuve            | Oui, chaque notice       |
| 2. Liste officielle | Un lien « Toutes les délibérations, source officielle » vers le jeu ouvert ou le recueil des actes de la collectivité. Aucune copie | Une vérification du lien |
| 3. Actes signalés   | Un habitant signale une délibération précise avec le lien du document. Elle passe par le même circuit de relecture                  | Oui, chaque notice       |

### Couche 1 : matières du socle

Nomenclature des matières de la préfecture (ACTES), telle qu'elle apparaît dans les jeux ouverts
relevés le 12 octobre 2026. Socle arrêté par la rédaction le 13 octobre 2026 :

| Code     | Matière                                                      | Dans le socle                                  |
| -------- | ------------------------------------------------------------ | ---------------------------------------------- |
| 1.1      | Commande publique, marchés publics                           | Oui                                            |
| 2.1      | Urbanisme, documents d'urbanisme                             | Oui                                            |
| 3.1      | Domaine et patrimoine, acquisitions                          | Oui                                            |
| 3.2      | Domaine et patrimoine, aliénations                           | Oui                                            |
| 7.1      | Finances locales, décisions budgétaires                      | Oui                                            |
| 7.5      | Finances locales, subventions                                | Oui, aux personnes morales seulement           |
| 8.4      | Compétences par thèmes, aménagement du territoire            | Oui                                            |
| 8.8      | Compétences par thèmes, environnement                        | Oui                                            |
| 4.x      | Fonction publique                                            | Non : actes nominatifs sur des agents          |
| 5.2, 5.3 | Fonctionnement des assemblées, désignation des représentants | Non : procédural, sans effet sur les habitants |
| 9.1      | Autres domaines                                              | Non : catégorie fourre-tout, hétérogène        |

Une notice n'est créée que si la matière figure dans le socle, quelle que soit la commune. Le
socle est le même pour les treize, publié avec sa date, et ne change pas en cours de collecte.

### Pourquoi pas toutes les délibérations d'un fichier ouvert

- **Données personnelles** : les objets de délibération citent parfois des personnes nommées
  (protection fonctionnelle, litiges, aides à des particuliers). Republier la liste brute
  demanderait un tri ligne à ligne.
- **Volume** : une grande commune en produit plusieurs centaines par an, pour une relecture qui
  n'apporte rien de plus que le lien officiel de la couche 2.

### Ce qui n'est pas un critère de sélection

Ni le nombre de voix contre, ni l'absence d'unanimité, ni la présence d'un élu nommé. Un tri sur
« votes non unanimes » se lirait comme un signal politique et ne serait pas neutre.

### Profondeur et indicateurs

La règle est la même pour toutes les communes, et la profondeur couverte est affichée (par exemple
« depuis mars 2020 »). Un acte n'est jamais retenu ou écarté pour ce qu'il dit d'un élu.

Les comptes tirés des jeux ouverts (issue, votes) ne sont qu'un indice de travail pour la
relecture. Une notice ne porte jamais une issue déduite automatiquement : la personne qui relit
la confirme sur le document.

## 4. Sources admissibles

| Admis                                            | Jamais admis seul                               |
| ------------------------------------------------ | ----------------------------------------------- |
| Délibération publiée par la collectivité         | Ordre du jour (il ne prouve pas l'adoption)     |
| Procès-verbal de séance approuvé                 | Article de presse, communiqué, réseau social    |
| Liste des délibérations affichée après la séance | Tract, site de groupe d'élus, blog              |
| Recueil des actes administratifs                 | Copie d'un document sans l'original consultable |

Le document doit être en ligne, à une adresse http ou https. Une archive (par exemple Internet
Archive) peut s'ajouter pour le cas où le site de la commune déplace le fichier. Poligraph ne
télécharge jamais le document depuis ses serveurs : il affiche le lien.

## 5. Règles de saisie

- **Objet** : l'intitulé de la source, repris tel quel ou raccourci sans changer le sens. Aucun
  qualificatif ajouté, aucun résumé généré par une IA.
- **Référence** : le numéro de délibération quand la source en donne un.
- **Date d'adoption** : la date de la séance. Si la source ne donne que le mois ou l'année, la
  précision le dit, et la décision ne se rattache à un maire que si la période entière tombe dans
  son mandat.
- **Date de publication et prise d'effet** : saisies seulement si la source les donne. Une date
  de publication ne remplace jamais la date d'adoption.
- **Résultat** : adoptée ou rejetée, seulement si la source l'établit. La formulation de la source
  (« adoptée à l'unanimité ») peut être citée. Aucun vote individuel n'est saisi dans ce lot.
- **Localisation** : la page et le numéro du point dans le document.
- **Autorité** : le conseil qui a adopté l'acte. Une décision du conseil communautaire reste
  attribuée à ce conseil, même si elle ne concerne qu'une commune.
- **Une décision, une notice** : avant de saisir, chercher si la notice existe déjà.

## 6. Revue et publication

1. La personne qui saisit crée la notice en brouillon, puis l'envoie en revue.
2. La relecture ouvre le document source à l'endroit indiqué et vérifie chaque champ. Elle publie
   en indiquant son nom, ou renvoie en brouillon, ou rejette avec un motif.
3. Une notice publiée ne se modifie pas : on la dépublie avec un motif, on la corrige, et elle
   repasse en revue. L'historique garde chaque étape.

La relecture par une autre personne que celle qui a saisi est la règle visée. **Limite
technique** : l'administration n'a qu'un compte partagé, le nom du relecteur est donc déclaratif.
La séparation des rôles repose sur l'organisation de la rédaction tant qu'il n'y a pas de comptes
nominatifs.

Entretien : chaque lien est revérifié tous les six mois (arrêté le 13 octobre 2026).
Un lien mort est remplacé par l'archive ou par la nouvelle adresse ; à défaut, la notice est
dépubliée.

## 7. Ce qui n'est jamais fait

- Attribuer une décision collective au maire ou à un conseiller. Être en fonction à une date n'est
  pas avoir voté.
- Déduire un vote individuel d'un résultat, même unanime, ou d'une appartenance à une liste.
- Classer ou comparer des communes ou des conseils par nombre de décisions.
- Ingérer automatiquement des délibérations, à l'échelle nationale ou locale.
- Saisir une donnée fictive ou de test dans la base de production.
- Publier une notice sans source consultable et sans localisation dans la source.

## 8. Avant la première collecte

- [x] Liste des treize communes arrêtée, avec le critère de chacune (§2).
- [x] Seconde commune ultramarine trouvée (Kourou, 14 octobre 2026).
- [x] Équilibre politique des treize contrôlé et consigné (§2).
- [x] Liste des matières du socle arrêtée (§3).
- [x] Fréquence de revérification fixée (§6).
- [ ] Table de correspondance « jeu ouvert vers institution » complétée pour les treize (Kourou : pas de jeu ouvert, saisie depuis les PDF).
- [x] Protocole publié sur le site, avec sa date (page `/methodologie/decisions-territoires`).
