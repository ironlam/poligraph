# Débats AN : revue des discussions interrompues, 4 novembre 2026

## Décisions après les retours de revue

- Le retour sur les impacts citoyens est confirmé : le résolveur exposait le passage complet. Le contexte destiné aux modèles est désormais filtré et étiqueté au même endroit pour les analyses et les impacts.
- Sans référence officielle de séance, la mesure peut être décrite depuis son texte officiel, mais la section « Le débat » est volontairement omise. Le runbook précise la reprise des deux générateurs.
- Une suspension ne ferme pas mécaniquement un épisode : le parseur conserve le texte examiné courant. Une fixture officielle le démontre. En revanche, plusieurs épisodes distincts restent exclus ; réserve et seconde délibération ne doivent pas être confondues avec une simple suspension.
- L’inspection compte aussi les épisodes inachevés ou trop longs : ils ne peuvent plus disparaître du décompte et laisser publier un épisode antérieur partiel.

## Échantillon et méthode

Archive officielle Syceron AN 17e téléchargée le 4 novembre 2026, réutilisée localement. Sélection : les six fichiers XML les plus volumineux, puis les deux plus volumineux restants dont la séance commence à 21 heures ou après. Aucun appel modèle, aucune requête en base. Le script examine au plus 30 candidats par séance, dans l’ordre des références XML.

Les candidats sont construits depuis `adt`, `ssadt` et le texte examiné du XML, sans contrôle des liens `ScrutinAmendment` en base. « Passage retenu » signifie que la segmentation locale réussit, pas qu’un résumé est publiable. Les nombres ci-dessous ne sont pas un taux de couverture de PoliGraph.

```bash
npm run audit:debate-discussions -- --xml <répertoire-des-8-XML> --limit 8 --targets 30
```

| Compte rendu                                                                                                   | Date de début | Paragraphes | Candidats examinés | Passages retenus |
| -------------------------------------------------------------------------------------------------------------- | ------------- | ----------: | -----------------: | ---------------: |
| [CRSANR5L17S2025O1N044](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2025O1N044) | 2024-11-08    |        1024 |                 30 |               25 |
| [CRSANR5L17S2025O1N111](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2025O1N111) | 2025-02-20    |        1366 |                 28 |               24 |
| [CRSANR5L17S2025O1N246](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2025O1N246) | 2025-06-18    |        1179 |                 30 |                0 |
| [CRSANR5L17S2025O1N262](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2025O1N262) | 2025-06-27    |        1139 |                 30 |               24 |
| [CRSANR5L17S2026O1N059](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2026O1N059) | 2025-11-19    |        1166 |                 30 |               22 |
| [CRSANR5L17S2026O1N065](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2026O1N065) | 2025-11-21    |        1319 |                 30 |               23 |
| [CRSANR5L17S2026O1N073](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2026O1N073) | 2025-11-27    |        1275 |                 30 |               15 |
| [CRSANR5L17S2026O1N248](https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2026O1N248) | 2026-05-27    |        1152 |                 30 |               22 |

Total : 238 candidats examinés, 155 passages retenus.

| Motif d’exclusion                | Nombre |
| -------------------------------- | -----: |
| `missing_subamendment_reference` |      5 |
| `multiple_episodes`              |     10 |
| `no_discussion`                  |     31 |
| `no_target_speech`               |     24 |
| `over_budget`                    |     13 |

## Ce que les pièces établissent

- `CRSANR5L17S2025O1N111`, amendement 3 : une discussion contient une suspension puis une reprise, sans perdre les interventions qui suivent. La fixture `discussion-suspendue-2025-02-20.xml` conserve ses 67 paragraphes et leurs références, avec un conteneur réduit.
- `CRSANR5L17S2025O1N044` commence le 8 novembre 2024 à 21 h 30. Le compte rendu mentionne une suspension le samedi 9 novembre à 1 h 15, une reprise à 2 h 25 et une levée à 2 h 40. Le passage de minuit n’implique donc pas à lui seul un changement de compte rendu.
- `CRSANR5L17S2025O1N262` commence le 27 juin 2025 et indique une levée le samedi 28 juin à 0 h 50. Le résolveur se fonde sur la référence officielle de séance, pas sur une égalité de dates.
- Dix candidats rencontrent plusieurs épisodes selon le segmenteur. Ce diagnostic ne permet pas d’en attribuer automatiquement la cause à une réserve, une seconde délibération ou une reprise ordinaire. Ils restent exclus et identifiables par `multiple_episodes`.
- L’échantillon n’établit aucun lien interséance suffisamment sûr pour assembler automatiquement deux comptes rendus. Un tel assemblage demanderait des références supplémentaires de texte, lecture, phase et reprise ; une simple proximité de dates ou de numéros ne suffit pas.

## Autre défaut découvert pendant l’audit

Le champ `bibard` peut contenir `(n[[o]] 930)` au lieu de `930`. Le parseur utilisait cette valeur brute et refusait alors un texte pourtant identifié. La version 3 normalise uniquement les formes explicites autorisées et ajoute une régression sur ce cas. Les comptes rendus déjà stockés seront retraités par la sync versionnée avant la reprise des générations.

## Vérification complémentaire des formats `bibard`

Le retour signalant 24 684 paragraphes avec un `bibard` non numérique est confirmé
par une lecture des attributs bruts de toute l’archive locale. Ce comptage séparé
ne relance ni la segmentation complète, ni une requête en base, ni un modèle.

| Forme brute non vide                                    | Paragraphes | Décision de cette PR                                                                |
| ------------------------------------------------------- | ----------: | ----------------------------------------------------------------------------------- |
| Numéro numérique simple                                 |       2 904 | Accepté.                                                                            |
| `(n[[o]] 1364)` ou forme équivalente sans qualification |      18 857 | Normalisé par le parseur v3.                                                        |
| Mention « rectifié » ou « rectification »               |       5 658 | Référence non exploitable pour la génération tant que la version n’est pas établie. |
| Autre forme, notamment `(n[[o]] 2146-A0)`               |         169 | Refusée, sans extraction arbitraire du premier nombre.                              |

Les trois dernières lignes totalisent bien 24 684 paragraphes. Ce sont des
attributs du XML officiel, pas des chaînes introduites par le parseur. Les comptes
rendus témoins sont `CRSANR5L17S2025O1N037`, paragraphe 3555772 (forme simple),
`CRSANR5L17S2025E1N011`, paragraphe 3842021 (deuxième rectification), et
`CRSANR5L17S2026O1N075`, paragraphe 3949363 (suffixe A0).

La proposition d’extraire simplement le premier groupe de trois à cinq chiffres
n’est pas retenue : elle écarterait les petits numéros de texte et ferait disparaître
une qualification de version potentiellement significative. Cette PR corrige les
formes simples avec une règle ancrée, et teste explicitement le refus des formes
qualifiées. Elle ne prétend pas résoudre toute la couverture : établir la version
des textes rectifiés reste un travail distinct, avant toute fusion de ces références.
La fixture réelle de suspension du 20 février contient aussi les `bibard` entourés
de marqueurs ; le test vérifie leur présence et l’extraction complète du débat.
