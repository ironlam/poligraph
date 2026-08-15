# Closeout #701 — participation parlementaire

Date de clôture : 2026-08-15

## Périmètre clôturé

Le lot #701-A corrige le défaut de publication identifié dans #701 : un taux de participation parlementaire ne doit être publié que lorsque son dénominateur correspond à un périmètre réellement éligible et que la source/pipeline représente suffisamment la non-participation.

La correction fail-closed est livrée par la PR #717.

- HEAD indépendamment vérifié : `c9eb8f5250cf11f712086f502017b3579ee896bb`
- commit de cutover mergé : `5beb3c93b08b2ddf354cc0fa3c629ee2628fb8d7`
- déploiement production : validé sur le même contenu Git
- premier `sync/daily` sous le nouveau code : terminé normalement

## Contrat public désormais appliqué

- Sénat : participation indisponible (`null` / `SOURCE_INSUFFICIENT`) tant qu'une méthode fiable n'est pas démontrée.
- Aucun `0 %` n'est fabriqué à partir d'un dénominateur absent ou nul.
- Un mandat parlementaire ambigu ou un périmètre incomplet échoue fermé (`COMPUTATION_INCOMPLETE`).
- Les métriques sénatoriales indépendantes de la participation restent disponibles.
- Les agrégats et snapshots de participation sont construits uniquement à partir du périmètre publiable.

## Validation production après le premier sync

Les contrôles post-déploiement ont confirmé :

- `ParliamentaryGroupStats` : 21 lignes ; 21/21 avec `averageParticipationPct = NULL` ;
- cohésion, alignement gouvernemental et alignement des votes finaux conservés sur les 21 groupes ;
- `PoliticianParticipation` : 568 lignes AN, 0 ligne Sénat ;
- toutes les lignes persistées sont `AN`, `DEPUTE`, avec `eligibleScrutins > 0` et un mandat parlementaire courant unique ;
- snapshots recalculés : 12 groupes AN, aucun groupe Sénat, et 9 agrégats de parti issus du corpus publiable ;
- Véronique Guillotin : participation `null` / `SOURCE_INSUFFICIENT` ;
- Christophe Barthès : participation `null` / `COMPUTATION_INCOMPLETE` ;
- Chantal Bouloux : `eligibleScrutins = 0`, participation `null`, jamais `0 %` ;
- Marine Hamelet : participation AN disponible et cohérente avec le calcul persisté ;
- aucun HTTP 5xx lié au changement observé après le premier sync.

Les erreurs de récupération de certains articles de presse observées dans d'autres étapes Inngest sont indépendantes de #701.

## Travail durable conservé

La fermeture de #701 ne signifie pas qu'une participation sénatoriale fiable est désormais calculable.

Le travail de reconstruction éventuelle du dénominateur et de qualification des états officiels du Sénat est conservé dans :

- #722 — Participation sénatoriale : reconstruire un dénominateur publiable (#701-B)

Tant que #722 n'est pas résolu, le contrat fail-closed ci-dessus reste l'état attendu.

## Dettes découvertes pendant le cutover

Deux sujets indépendants ont été isolés au lieu d'élargir #701 :

- #723 — empêcher une commande Prisma de schéma locale de cibler implicitement la production ;
- #724 — aligner `ParliamentaryGroupStats.computedAt` sur le recalcul effectif.

Ils ne remettent pas en cause la correction ni la validation production de #701-A.

## Décision

#701-A est validée en production et peut être clôturée.

La chaîne appliquée est :

`Implementer → Adversary indépendant → Verifier indépendant → Verified → réconciliation incident → cutover → merge → déploiement → premier sync → validation production → closeout`.
