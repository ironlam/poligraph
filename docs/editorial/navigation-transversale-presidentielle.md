# Navigation transversale : présidentielle 2027 vers le Parlement

Lot 1. Audit au 28 octobre 2026, mesures de production en lecture seule.

## Constat

| Élément | État |
| --- | --- |
| `Measure.theme` et `LegislativeDossier.theme` / `Scrutin.theme` | Même enum `ThemeCategory`, mais taxonomie fine côté mesures (16 thèmes) et historique côté textes (13 thèmes) |
| `MeasureVoteLink` | Livré en code, **0 ligne en production** : la section « Votes parlementaires liés » de la page mesure ne s'affiche jamais |
| Page thème présidentielle | Annonçait « votes au Parlement sur ce thème » comme non construit |
| `/parlement/dossiers?theme=` et `/parlement/votes/themes/[theme]` | Livrés, filtrés par thème historique, dossiers derrière le flag `ASSEMBLEE_SECTION` |
| Fiche candidat | « Derniers votes » livrés, non rattachés aux mesures |
| Suivi analytique | Umami, helper `trackUmami`, aucun événement de navigation interne |

Écart de taxonomie : `EMPLOI_TRAVAIL`, `RETRAITES` et `SOLIDARITES_PROTECTION_SOCIALE` n'existent pas côté textes (ils sont dans `SOCIAL_TRAVAIL`), `SOCIETE_DROITS_LIBERTES` n'a aucun équivalent.

## Parcours proposés

| # | Parcours | Données | Emplacement | Effort | Mesure |
| --- | --- | --- | --- | --- | --- |
| 1 | Thème ou mesure vers dossiers et scrutins du même thème | Disponibles | Page thème, page mesure | Faible (**lot 1**) | `pres_bridge_click` |
| 2 | Candidature vers parcours parlementaire et votes de la personne | `politician-parliamentary-path`, fiche candidat | Fiche candidat | Moyen | clic vers `/politiques/[slug]/votes` |
| 3 | Hub vers `/parlement` (bloc « Comment ça se vote ») | Disponibles | Hub | Faible | clic hub vers parlement |
| 4 | Mesure vers texte voté sur le même objet | Absentes (0 `MeasureVoteLink`) | Page mesure | Élevé, travail éditorial | taux de mesures reliées |
| 5 | Personnalité vers mandats nationaux et locaux | Disponibles | Fiche candidat | Moyen | clic vers profil |

Règle commune : un lien thématique est présenté comme tel. Seul un `MeasureVoteLink` relu par un humain et sourcé peut dire qu'une mesure et un texte portent sur le même objet. Le parti actuel n'entre jamais dans la lecture d'un vote passé.

## Lot 1 livré

- `src/lib/presidentielle/parliament-bridge.ts` : correspondance de thèmes, explicite, sans correspondance inventée.
- `src/lib/data/parliament-bridge.ts` : deux comptages et trois dossiers récents, cache `synced`, tag `legislation` et `votes`.
- `src/components/elections/ParliamentThemeBridge.tsx` : bloc « Au Parlement, sur le thème X », avec rappel permanent que le lien est thématique.
- Posé sur la page thème (au-dessus des sections annoncées) et la page mesure.
- Lien vers les dossiers masqué si `ASSEMBLEE_SECTION` est désactivé. Bloc masqué sans donnée ou en cas d'erreur de lecture.

## Indicateurs

Événement Umami `pres_bridge_click` avec `source` (theme, mesure), `target` (dossier, dossiers_liste, votes_theme) et `theme`.

1. Taux de clic du bloc = clics / vues des pages thème et mesure.
2. Part des sessions entrées par la présidentielle qui visitent ensuite `/parlement/*` ou `/politiques/*`.
3. Pages par session des visiteurs entrés sur le hub.
4. Part des clics Google sur le hub présidentielle (38 % en octobre 2026), à suivre mensuellement.

## Lots suivants

- Lot 2 : parcours 2 et 5 sur la fiche candidat, avec mandats nationaux et locaux et accès aux votes de la personne.
- Lot 3 : premiers `MeasureVoteLink` relus (parcours 4), en commençant par les mesures qui reprennent une proposition de loi déposée.
