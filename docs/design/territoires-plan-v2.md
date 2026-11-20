# Territoires v2 : plan validé

Date : 14 novembre 2026. Statut : validé en revue, implémentation à lancer par le lot A.

Prolonge [`territoires-plan-implementation.md`](territoires-plan-implementation.md) (10 octobre 2026)
sans le remplacer. Le document complet, avec maquettes mobile, est un artifact privé :
https://claude.ai/artifact/9GCXgys9GBfjz8A6bahg5e. Toutes les données des maquettes sont fictives.

## 1. Constat (production, 14 novembre 2026)

- 34 969 communes, dont 10 099 indexables (1 000 habitants et plus, maire établi).
- 516 474 lignes du répertoire national des élus, dont 154 342 avec une fonction (rang d'adjoint ou
  de vice-président, sans intitulé de délégation, sans nuance ni groupe politique).
- 0 décision de conseil publiée, 0 donnée financière, aucun résultat régional, départemental,
  législatif ou européen par commune.
- 2 présidents de région ou de département reliés à une fiche `Politician`, sur 119.
- Mobile : bandeau commune de 740 px, page de 5 900 px, ancres masquées par la barre d'onglets.

## 2. Ligne éditoriale

Chaque page (commune, département, région) répond à six questions, dans cet ordre :

1. Qui sont mes élus ? (bloc « Vos élus » : exécutif, composition par liste)
2. Qu'est-ce qui vient de changer ? (fil daté)
3. Avec quel argent ? (comptes de la collectivité)
4. Comment a-t-on voté ici ? (élections)
5. Qui me représente à Paris ? (derniers votes des parlementaires)
6. Comment agir ? (bloc « Agir »)

Règles : une phrase réponse par gabarit testé, jamais par un modèle de langage ; euros par habitant
d'abord ; pas d'adjectif d'appréciation ; mêmes blocs et même ordre pour toutes les collectivités ;
jamais de titre qui interroge l'utilité d'une institution (« à quoi sert ») ; « Vos élus » et non
« Qui décide ».

## 3. Décisions prises le 14 novembre 2026

| N°  | Décision                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D21 | D17 amendée : un seul repère autorisé à côté d'un chiffre de budget, la moyenne de la strate officielle publiée par le producteur. Ni rang, ni autre territoire nommé.                                                                                                                                                 |
| D22 | `ConseilMembre` reste sans lien pour les conseillers municipaux. Les exécutifs (présidents, maires) sont reliés à `Politician` par le résolveur d'identité v2, verdict SAME ou validation humaine, décision tracée.                                                                                                    |
| D23 | Composition d'un conseil : sièges par liste « à l'élection de 2026 » (2021 pour régions et départements), sans étiquette de parti déduite, avec la réserve des démissions. Trois intensités de marine, légende à pastille, « autres listes » au-delà de trois.                                                         |
| D24 | D18 maintenue pour la proximité de personne ou de parti. Exception : une affaire dont les faits touchent la collectivité apparaît sur sa page, rattachée à la main par un modérateur avec sa source, lue par les filtres publics. Ni compteur de bandeau ni entrée dans le fil. Mesurer le volume avant de construire. |
| D25 | Exécutif détaillé seulement dans les communes indexables ; en dessous, la liste du répertoire telle qu'aujourd'hui.                                                                                                                                                                                                    |
| D26 | Bloc « Vos parlementaires ont voté » : les trois derniers scrutins de type `FINAL` ou `MOTION`, titre explicatif approuvé sinon titre officiel, sans fenêtre en jours. Le drapeau `isKeyVote` n'est pas utilisé (environ 300 par trimestre depuis janvier 2026).                                                       |
| D27 | Routine IA de veille des 119 régions et départements : écrit par une route dédiée (`withMachineAuth`, jeton à droit unique « créer un brouillon », Zod strict, hôte de la source vérifié contre un registre fermé, idempotence, plafond, `auditLog`, drapeau de coupure). Jamais de SQL direct.                        |
| D28 | Comptes : famille distincte « Les comptes de la collectivité », dans `TerritoireRepere` mais hors du bloc « Le territoire en chiffres ». Cinq pages de méthode écrites avant le premier import.                                                                                                                        |
| D29 | Parrainages présidentiels : pages sous `/elections/presidentielle-2027/parrainages`, importeur et gabarits construits sur la liste 2022 dès décembre 2026. On écrit « a présenté », jamais d'absence nominative.                                                                                                       |

| D30 | Agendas des candidats : rendez-vous publics annoncés sur le site officiel de chaque candidat, relevés par la routine de veille (liste fermée, brouillon, publication humaine), affichés sur la fiche et dans le fil du territoire. Libellé « annoncé par le candidat » jusqu'à confirmation par une source de presse autorisée. Jamais d'absence nominative. |
| D31 | Fils sociaux : Bluesky lu côté serveur par l'interface publique, dans un bloc séparé « Publications du candidat, non vérifiées par Poligraph », jamais repris dans le fil, les compteurs, la recherche ou l'API. X : lien vers le compte seulement. Sous réserve d'écrire d'abord la nuance avec le principe « sources vérifiées » d'AGENTS.md. |

Ouvert : presse régionale dans un bloc « Dans la presse » (conditions de réutilisation non lues).

## 4. Design

- Signatures : code du territoire en grand chiffre contour dans le bandeau ; « échelle des
  territoires » (commune, intercommunalité, département, région, compétences légales, quatre liens) ;
  mesures en marine avec repère en demi-teinte ; une ligne de source par bloc.
- Mobile : bandeau de 360 px au plus (fil d'Ariane court, nom, phrase réponse, trois faits sur une
  ligne) ; cinq onglets fixes d'un mot, sans défilement horizontal, vérifiés à 320 px ; tout ce qui
  dépasse cinq lignes est replié ou renvoyé vers une sous-page.
- Composants serveur à créer dans `src/components/territoires/` : `TerritoireBandeau` (fusionne
  `CommuneHero`, `DepartementHero`, `RegionHero`), `TerritoireOnglets`, `FilTerritoire`,
  `EchelleTerritoires`, `Executif`, `CompositionConseil`, `BudgetResume`, `Agir`, `MesureBarre`,
  `LigneSource`. Une story Storybook chacun.

## 5. Lots

Unité : une PR de moins de 400 lignes avec ses tests.

| Lot | Période                | Contenu                                                                                                                                                                                                                                          |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | nov. à déc. 2026       | Refonte mobile et identité, sans nouvelle source : bandeau unique et phrase réponse, onglets, ligne de source, `Executif`, `CompositionConseil`, `EchelleTerritoires`, bloc `Agir` en texte fixe, images Open Graph.                             |
| B   | déc. 2026 à janv. 2027 | Maillage et fil : rattachement des 119 présidents puis des maires, table `TerritoireEvenement`, bloc des votes et « vote par département » côté scrutin, liens fiche vers territoire, adresses lisibles des communes avec 308 par Route Handler. |
| P   | déc. 2026 à mai 2027   | Parrainages (2022 puis 2027), résultats 2027 par commune, pages circonscription.                                                                                                                                                                 |
| C   | janv. à mars 2027      | Comptes (OFGL) dans `TerritoireRepere`, pages de méthode, sous-pages `/budget`, notices des rapports des chambres régionales des comptes.                                                                                                        |
| D   | mars à juin 2027       | Législatives et européennes 2024, régionales et départementales 2021 par commune ; pages intercommunalité et canton ; conseillers communautaires.                                                                                                |
| E   | 2e semestre 2027       | Routine de veille (pilote sur 10 collectivités), flux RSS par département, modèle des listes régionales pour mars 2028.                                                                                                                          |

### Lot A, ordre proposé des PR

1. `TerritoireBandeau` et gabarit de phrase réponse (fonction pure, tests : maire non établi, statut
   particulier, plusieurs circonscriptions), appliqué à la page commune.
2. `TerritoireOnglets` et `LigneSource`, volet « Sources de cette page ».
3. Bandeau appliqué aux pages département et région ; index des communes déplacé sous un onglet.
4. `Executif` à partir de `ConseilMembre.functionLabel` (rang seulement).
5. `CompositionConseil` à partir des sièges par liste des municipales 2026.
6. `EchelleTerritoires` : compétences légales en configuration sourcée, relue à la main.
7. Bloc `Agir` : texte fixe sourcé, tribunal administratif par département.
8. Images Open Graph alignées, vérifiées sous Satori.

### État au 17 novembre 2026

- Lot A : en production (PR #1300 à #1314), corrections de longueur comprises. Page commune de Brest :
  6 974 px à 390 px de large, contre 8 345 après la première livraison.
- Lot B : en production (PR #1324 à #1338, #1341, #1345). Anciennes adresses de commune redirigées en
  308 sans paramètre parasite.
- Non visibles en production au 17 novembre : la reprise des faits de 2026 dans le fil
  (`TerritoireEvenement` contient 0 ligne) et la création des fiches des présidents de conseil
  (12 présidents reliés sur 118).
- Prochain lot : P, parrainages sur la liste 2022.

### État au 20 novembre 2026

- Lot P, étape 2022 : en production (PR #1366 à #1382, #1388 à #1390). 13 427 présentations, 64
  candidats, totaux identiques au fichier. 9 177 communes résolues sur 9 180 maires et maires
  délégués. 3 781 élus reliés à une fiche, aucun conseiller départemental ou régional.
- Indexation : tableau de bord, 110 pages département et 17 pages candidat (seuil de 100
  présentations) au sitemap ; page 2027 d'attente et page de méthode en `noindex,follow`.
- Fil : 68 219 événements en base (PR #1394). Fiches des présidents de conseil : PR #1395.
- Prochain lot : C, comptes de la collectivité (OFGL), pages de méthode d'abord (D28).

### Parrainages, liste 2022 (vérifiée le 17 novembre 2026)

Jeu « Parrainages des candidats à l'élection présidentielle française de 2022 », Conseil
constitutionnel, data.gouv.fr, domaine public, en CSV, JSON et tableur. 13 427 présentations, 64
candidats, 29 libellés de mandat. Colonnes : civilité, nom, prénom, mandat, circonscription,
département, candidat, date de publication. Séparateur point-virgule, UTF-8 avec BOM. La commune et
le département sont donnés par leur nom, sans code INSEE. Le jeu 2017 existe au même endroit.

## 6. Sources vérifiées le 14 novembre 2026

| Source                                           | Usage                              | Licence                      | Réserve                                                                          |
| ------------------------------------------------ | ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| OFGL, `data.ofgl.fr` (API Opendatasoft)          | Comptes 2018 à 2025                | Licence Ouverte 2.0          | Connexion directe refusée depuis un bac à sable : tester depuis Vercel.          |
| Répertoire national des élus                     | Rang des exécutifs, communautaires | Licence Ouverte 2.0          | Ni nuance ni délégation.                                                         |
| Résultats 2021 et 2024, « élections agrégées »   | Historique par commune             | Licence Ouverte 2.0 (agrégé) | Nuance attribuée par la préfecture ; licence non précisée sur les fichiers 2021. |
| Chambres régionales des comptes, RSS par chambre | Rapports de contrôle               | Non vérifiée                 | Rattachement à lire dans le titre : validation humaine.                          |
| Délibérations au format SCDL                     | Pilote régional                    | Variable                     | 46 jeux pour toute la France.                                                    |

Agendas et fils sociaux (recherche du 17 novembre 2026, documentation officielle à relire avant
développement) : l'interface publique de Bluesky (`public.api.bsky.app`) se lit sans authentification ;
l'interface de X est facturée à l'usage depuis février 2026, palier gratuit fermé aux nouveaux projets ;
le jeu « Réunions » de l'Assemblée nationale existe sur data.gouv.fr ; aucune source ouverte trouvée
pour les agendas des ministres ni pour les meetings de campagne.

Non vérifié, à confirmer avant développement : format et dates des parrainages 2027 (Conseil
constitutionnel), données ouvertes du Journal officiel, annuaire de l'administration, règles de droit
du bloc Agir (seuils et délais à reprendre du texte officiel, relecture par un juriste).

## 7. Constat hors rubrique

`isIndexableScrutin` rend indexable un scrutin d'amendement marqué `isKeyVote`. Ce drapeau est passé
de 11 à 24 scrutins par trimestre en 2025 à environ 300 depuis janvier 2026 : le prédicat est à
remesurer sur la production (doctrine d'indexation, AGENTS.md §5).
