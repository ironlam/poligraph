# RGPD article 10 : état final en production

Date : 2026-06-07
Statut : chantier complet, toutes les phases déployées en production.

> Document de traçabilité interne. Décrit l'état du produit après les Phases 1
> à 4. Pour le détail méthodologique public : `/methodologie`. Pour le cadre
> juridique : `docs/LEGAL.md` §7. Pour le dossier avocat/AIPD :
> `docs/rgpd-article10/dossier-avocat-aipd.md`.

## Pull requests livrées

| PR                      | Phase | Objet                                                                                                                                                                                                                            |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ironlam/poligraph#363   | 1     | Hotfix exposition : discover-affairs DRAFT-only (type-level), fuites par id / OpenGraph / affaires liées colmatées, filtres centralisés `public-filters.ts`, agrégats Tier 2 strict, liaison `AffairPoliticianDecision.affairId` |
| ironlam/poligraph#365   | 2     | Barrière de publication : `assertPublishable` seul chemin vers PUBLISHED (5 voies admin), onglet « SAME à confirmer », script d'audit, garde-fou CI                                                                              |
| ironlam/poligraph#366   | 2     | Fix UX : le refus du guard s'affiche au lieu de tomber sur l'error boundary                                                                                                                                                      |
| ironlam/poligraph#367   | 3     | Encarts publics, issues favorables dominantes, prescription distincte                                                                                                                                                            |
| ironlam/poligraph#369   | 3b    | Compteurs additifs par rôle + harmonisation PartyAffairsList                                                                                                                                                                     |
| ironlam/poligraph#370   | 4     | Documentation : LEGAL.md §7, méthodologie publique, AGENTS.md                                                                                                                                                                    |
| ironlam/poligraph-mcp#2 | 3     | Contrat MCP : affaires publiées uniquement, tests de contrat                                                                                                                                                                     |
| ironlam/poligraph-mcp#3 | 3b    | Compteurs par rôle exposés et testés côté MCP                                                                                                                                                                                    |

## Invariants garantis (et où ils vivent)

1. **Aucune publication automatique** : pipelines en DRAFT only, `src/services/sync/discover-affairs-builders.ts` (type `publicationStatus: "DRAFT"`).
2. **Publication = validation humaine prouvée** : `src/lib/affairs/publish-guard.ts` (`assertPublishable`, écrit `verifiedAt` + `verifiedBy` atomiquement). Garde-fou CI dans `.github/workflows/code-quality.yml`.
3. **Pas de rattachement pénal sur score seul** : décision resolver SAME/UNDECIDED non revue bloque la publication ; revue via `/admin/affair-matching/review?tab=SAME`.
4. **Agrégats cohérents** : `src/lib/affairs/public-filters.ts` (where-builders) + `src/lib/affairs/affair-counts.ts` (compteurs par rôle).
5. **Issues favorables dominantes, prescription distincte** : `src/components/affairs/AffairStatusNotice.tsx`.
6. **Mêmes règles web / API / exports / MCP** : surfaces consomment les filtres centralisés ; MCP consomme l'API publique durcie.

## Vérification d'état (audit prod 2026-06-07)

Script : `scripts/audit-affairs-compliance.ts` (lecture seule).

| Indicateur                                        | Valeur | Cible                                      |
| ------------------------------------------------- | ------ | ------------------------------------------ |
| PUBLISHED sans `verifiedBy`                       | 0      | 0                                          |
| Auto-publication Wikidata résiduelle              | 0      | 0                                          |
| PUBLISHED sans source                             | 0      | 0                                          |
| Issues favorables comptées à charge               | 0      | 0                                          |
| Enquêtes préliminaires publiées (DIRECT/INDIRECT) | 64     | visibles sur fiche, hors agrégats à charge |
| Décisions resolver orphelines vers PUBLISHED      | 50     | suivi éditorial, non bloquant              |

Compteurs par rôle (exemples prod) :

- Nicolas Sarkozy : total 10 = 5 à charge + 1 favorable + 2 mention + 1 victime/plaignant + 1 enquête préliminaire (dans aucun bucket, voulu).
- Jordan Bardella : total 5 = 0 à charge + 2 favorables + 1 mention.

## Suivis éditoriaux ouverts (hors chantier technique)

- Réattribution de l'affaire « Renon » (mauvais rattachement Jean-Guy adjoint vs Jean Louis maire d'Ondres), actuellement en DRAFT.
- Procès Rima Hassan (apologie du terrorisme) le 07/07/2026 : re-vérifier le statut après l'audience.
- 50 décisions resolver orphelines à relier au fil de l'eau (liste dans `data/affairs-compliance-audit.json`).

Le sujet technique est clos. Ne rouvrir que pour ces suivis éditoriaux ciblés ou
sur retour de l'avocat (voir dossier avocat/AIPD).
