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

| N°  | Décision                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D21 | D17 amendée : un seul repère autorisé à côté d'un chiffre de budget, la moyenne de la strate officielle publiée par le producteur. Ni rang, ni autre territoire nommé.                                                                                                                                          |
| D22 | `ConseilMembre` reste sans lien pour les conseillers municipaux. Les exécutifs (présidents, maires) sont reliés à `Politician` par le résolveur d'identité v2, verdict SAME ou validation humaine, décision tracée.                                                                                             |
| D23 | Composition d'un conseil : sièges par liste « à l'élection de 2026 » (2021 pour régions et départements), sans étiquette de parti déduite, avec la réserve des démissions. Trois intensités de marine, légende à pastille, « autres listes » au-delà de trois.                                                  |
| D24 | D18 maintenue pour la proximité de personne ou de parti. Exception : une affaire dont les faits touchent la collectivité apparaît sur sa page, rattachée à la main par un modérateur avec sa source, lue par les filtres publics. Ni compteur de bandeau ni entrée dans le fil. Mesurer le volume avant de construire. |
| D25 | Exécutif détaillé seulement dans les communes indexables ; en dessous, la liste du répertoire telle qu'aujourd'hui.                                                                                                                                                                                             |
| D26 | Bloc « Vos parlementaires ont voté » : les trois derniers scrutins de type `FINAL` ou `MOTION`, titre explicatif approuvé sinon titre officiel, sans fenêtre en jours. Le drapeau `isKeyVote` n'est pas utilisé (environ 300 par trimestre depuis janvier 2026).                                                |
| D27 | Routine IA de veille des 119 régions et départements : écrit par une route dédiée (`withMachineAuth`, jeton à droit unique « créer un brouillon », Zod strict, hôte de la source vérifié contre un registre fermé, idempotence, plafond, `auditLog`, drapeau de coupure). Jamais de SQL direct.                   |
| D28 | Comptes : famille distincte « Les comptes de la collectivité », dans `TerritoireRepere` mais hors du bloc « Le territoire en chiffres ». Cinq pages de méthode écrites avant le premier import.                                                                                                                 |
| D29 | Parrainages présidentiels : pages sous `/elections/presidentielle-2027/parrainages`, importeur et gabarits construits sur la liste 2022 dès décembre 2026. On écrit « a présenté », jamais d'absence nominative.                                                                                                |

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

| Lot | Période                  | Contenu                                                                                                                                                                                                                                              |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | nov. à déc. 2026         | Refonte mobile et identité, sans nouvelle source : bandeau unique et phrase réponse, onglets, ligne de source, `Executif`, `CompositionConseil`, `EchelleTerritoires`, bloc `Agir` en texte fixe, images Open Graph.                                  |
| B   | déc. 2026 à janv. 2027   | Maillage et fil : rattachement des 119 présidents puis des maires, table `TerritoireEvenement`, bloc des votes et « vote par département » côté scrutin, liens fiche vers territoire, adresses lisibles des communes avec 308 par Route Handler.       |
| P   | déc. 2026 à mai 2027     | Parrainages (2022 puis 2027), résultats 2027 par commune, pages circonscription.                                                                                                                                                                     |
| C   | janv. à mars 2027        | Comptes (OFGL) dans `TerritoireRepere`, pages de méthode, sous-pages `/budget`, notices des rapports des chambres régionales des comptes.                                                                                                            |
| D   | mars à juin 2027         | Législatives et européennes 2024, régionales et départementales 2021 par commune ; pages intercommunalité et canton ; conseillers communautaires.                                                                                                    |
| E   | 2e semestre 2027         | Routine de veille (pilote sur 10 collectivités), flux RSS par département, modèle des listes régionales pour mars 2028.                                                                                                                              |

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

## 6. Sources vérifiées le 14 novembre 2026

| Source                                              | Usage                               | Licence                       | Réserve                                                                             |
| --------------------------------------------------- | ----------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| OFGL, `data.ofgl.fr` (API Opendatasoft)             | Comptes 2018 à 2025                 | Licence Ouverte 2.0           | Connexion directe refusée depuis un bac à sable : tester depuis Vercel.             |
| Répertoire national des élus                        | Rang des exécutifs, communautaires  | Licence Ouverte 2.0           | Ni nuance ni délégation.                                                            |
| Résultats 2021 et 2024, « élections agrégées »      | Historique par commune              | Licence Ouverte 2.0 (agrégé)  | Nuance attribuée par la préfecture ; licence non précisée sur les fichiers 2021.    |
| Chambres régionales des comptes, RSS par chambre    | Rapports de contrôle                | Non vérifiée                  | Rattachement à lire dans le titre : validation humaine.                             |
| Délibérations au format SCDL                        | Pilote régional                     | Variable                      | 46 jeux pour toute la France.                                                       |

Non vérifié, à confirmer avant développement : format et dates des parrainages 2027 (Conseil
constitutionnel), données ouvertes du Journal officiel, annuaire de l'administration, règles de droit
du bloc Agir (seuils et délais à reprendre du texte officiel, relecture par un juriste).

## 7. Constat hors rubrique

`isIndexableScrutin` rend indexable un scrutin d'amendement marqué `isKeyVote`. Ce drapeau est passé
de 11 à 24 scrutins par trimestre en 2025 à environ 300 depuis janvier 2026 : le prédicat est à
remesurer sur la production (doctrine d'indexation, AGENTS.md §5).
