# Program Import V6 : préparation de DRAFTs pour revue humaine

## Décision méthodologique

Le test cross-candidate Marine Le Pen a produit 50 TP, 43 FP et 20 FN, soit 53,76 % de
précision et 75,90 % de rappel. Il démontre que V6 ne peut pas publier automatiquement. Il ne sert
pas à retuner le parser, le discourse ou l'extracteur dans ce chantier.

La responsabilité est désormais répartie ainsi :

> Le LLM propose. La source prouve. L'humain décide.

Le pipeline cible est : document primaire officiel, parser, discourse, extraction,
EvidenceSnapshotV3, gardes techniques, Measure en DRAFT, revue humaine, correction ou rejet,
validation humaine, publication éventuelle par une action distincte.

## Sémantique des états

- `READY_FOR_REVIEW` : la preuve est techniquement défendable et aucun warning éditorial n'a été
  produit. Cet état ne valide ni la mesure, ni sa formulation, ni son exactitude, ni sa publication.
- `REVIEW_WITH_WARNING` : la preuve est réelle et auditable, mais une incertitude éditoriale doit
  être examinée explicitement.
- `TECHNICALLY_BLOCKED` : la provenance, l'attribution ou la preuve ne permet pas de créer un DRAFT
  défendable. Cet état n'est jamais persisté comme mesure.

Seuls les deux premiers états franchissent la frontière de création. Une révision importée reste
`DRAFT`, non relue et sans pointeur de publication.

## Matrice des anciens acceptance guards

| Guard                         | Classe         | Traitement DRAFT                                                     |
| ----------------------------- | -------------- | -------------------------------------------------------------------- |
| `NON_ACTION_CLASSIFICATION`   | HARD_BLOCK     | Pas de classification MEASURE ou OBJECTIVE persistable               |
| `MISSING_THEME`               | HARD_BLOCK     | Le modèle de mesure exige un thème explicite                         |
| `MISSING_NORMALIZED_TEXT`     | REVIEW_WARNING | Citation exacte utilisée comme formulation de repli, warning wording |
| `LOW_CONFIDENCE`              | REVIEW_WARNING | `MODEL_LOW_CONFIDENCE`                                               |
| `HISTORICAL_REFERENCE`        | HARD_BLOCK     | Attribution courante non défendable                                  |
| `TITLE_WITHOUT_ACTION`        | REVIEW_WARNING | `WORDING_NEEDS_REVIEW`                                               |
| `TITLE_OR_NOMINAL_LABEL`      | REVIEW_WARNING | `WORDING_NEEDS_REVIEW`                                               |
| `DEPENDENT_FRAGMENT`          | REVIEW_WARNING | `EVIDENCE_SCOPE_WEAK`                                                |
| `MISSING_REFERENT`            | REVIEW_WARNING | `EVIDENCE_SCOPE_WEAK`                                                |
| `CORRUPTED_SOURCE_TEXT`       | HARD_BLOCK     | Preuve textuelle non défendable                                      |
| `SLOGAN_OR_PRINCIPLE`         | REVIEW_WARNING | `WORDING_NEEDS_REVIEW`                                               |
| `DESCRIPTIVE_EXISTING_POLICY` | REVIEW_WARNING | `POSSIBLE_EXISTING_POLICY`                                           |
| `INSUFFICIENT_ATTRIBUTION`    | REVIEW_WARNING | `ATTRIBUTION_UNCERTAIN`                                              |
| `GENERAL_INTENT_FORMULATION`  | REVIEW_WARNING | `WORDING_NEEDS_REVIEW`                                               |
| `RHETORICAL_FORMULATION`      | REVIEW_WARNING | `WORDING_NEEDS_REVIEW`                                               |

Les divergences lexicales sûres et les valeurs brutes de confiance sont des observations. Elles
restent dans le rapport sans bloquer ni créer seules un warning de wording.

## Matrice evidence, formulation et attribution

| Famille     | HARD_BLOCK                                                                                                                | REVIEW_WARNING                                                                                             | OBSERVATION                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Bundle      | absence, ID inconnu, unité absente, ordre incohérent, non-localité, provenance bloquée, annotation manquante              | scope faible mais bundle réel                                                                              | taille, pages, relation locale ou heading |
| Anchor      | anchor absent, partition invalide, tiers ou source historique certaine                                                    | rôle DIAGNOSIS, EXISTING_POLICY, GENERAL_INTENT ou speaker UNRESOLVED sur un document candidat attribuable | nombre d'anchors et de supports           |
| Formulation | contenu substantiel détectablement absent : nombre, pourcentage, devise, date, durée, nom propre ou terme sensible ajouté | repli sur citation exacte, wording général, fragment dépendant                                             | divergence lexicale sûre                  |
| Attribution | tiers certain, historique certain, plateforme de parti, document non candidat                                             | diagnostic possible, politique existante possible, attribution discursive incertaine                       | basis et confiance affichées              |
| Doublon     | aucun blocage automatique sauf fingerprint strictement identique déjà importé                                             | rapprochement sémantique `POSSIBLE_DUPLICATE`                                                              | score de similarité                       |

`INVALID_COMMITMENT_ANCHOR_ROLE` est scindé selon les métadonnées de discourse. Un speaker tiers,
juridique ou historique reste bloqué. Un document author ou speaker unresolved portant un rôle
diagnostic, politique existante ou intention générale peut atteindre la revue avec warning.

## Contrat PreparedMeasureCandidate

Le contrat est une union discriminée :

```ts
type PreparedMeasureCandidate =
  | {
      classification: "MEASURE" | "OBJECTIVE";
      formulation: string;
      theme: ThemeCategory;
      evidenceSnapshot: EvidenceSnapshotV3;
      reviewReadiness: "READY_FOR_REVIEW" | "REVIEW_WITH_WARNING";
      warnings: ReviewWarning[];
      blockers: [];
      confidence: number;
      importFingerprint: string;
    }
  | {
      classification: "MEASURE" | "OBJECTIVE" | null;
      formulation: string | null;
      theme: ThemeCategory | null;
      evidenceSnapshot: EvidenceSnapshotV3 | null;
      reviewReadiness: "TECHNICALLY_BLOCKED";
      warnings: ReviewWarning[];
      blockers: TechnicalBlocker[];
      importFingerprint: null;
    };
```

Une branche draftable rend les champs de preuve, thème, classification et fingerprint non
nullables au niveau TypeScript. Le garde de transition vérifie une seconde fois le snapshot V3,
le fingerprint et la cohérence entre readiness et warnings.

## Warnings de revue

- `POSSIBLE_DIAGNOSIS_AS_ACTION`
- `POSSIBLE_EXISTING_POLICY`
- `ATTRIBUTION_UNCERTAIN`
- `POSSIBLE_DUPLICATE`
- `OBJECTIVE_VS_MEASURE_UNCERTAIN`
- `WORDING_NEEDS_REVIEW`
- `EVIDENCE_SCOPE_WEAK`
- `MODEL_LOW_CONFIDENCE`

Ces warnings ne changent pas la preuve et n'emportent aucune décision éditoriale.

## Persistence et idempotence

`EvidenceSnapshotV3` reste inchangé et immuable par révision. Les métadonnées de revue sont
séparées sur `MeasureRevision` : readiness, warnings, fingerprint et rejet humain structuré.

Le fingerprint SHA-256 combine : ProgramEdition, hash du document, hash canonique de la preuve,
classification et formulation normalisée. Il est nullable pour V5 et l'historique, unique pour les
imports V6. Un conflit unique annule la transaction complète, y compris la création de Measure.

Un rapprochement sémantique ne bloque plus la création. Il ajoute `POSSIBLE_DUPLICATE`. Un
fingerprint strictement identique est compté `ALREADY_EXISTS` et n'est pas recréé lors d'un rerun.

## Revue admin

La fiche affiche dans cet ordre :

1. readiness et warnings ;
2. formulation et classification proposées ;
3. attribution ;
4. anchors et contexte exacts ;
5. pages, URL officielle, versions et hashes.

Le reviewer peut :

- marquer la formulation comme relue ;
- corriger la formulation ou reclasser MEASURE et OBJECTIVE via une nouvelle révision ;
- rejeter avec un motif structuré ;
- publier ensuite par l'action humaine existante, distincte de l'import.

Une correction conserve le snapshot et les sources de la révision importée. Elle ne modifie pas la
preuve pour la faire correspondre à la nouvelle formulation. La comparaison reste visible. Les
corrections et rejets écrivent aussi une entrée AuditLog, ce qui permet de dériver les volumes et le
temps entre création et décision humaine.

Motifs de rejet : `NOT_A_PROPOSAL`, `DIAGNOSIS_ONLY`, `THIRD_PARTY`, `EXISTING_POLICY`,
`HISTORICAL`, `DUPLICATE`, `INSUFFICIENT_EVIDENCE`, `BAD_WORDING`, `OTHER`.

## Barrière d'apply

Le chemin d'écriture exige simultanément :

```text
--draft-v6 --apply --confirm-draft-write --candidate=francois-ruffin
```

Il vérifie le schéma cible, limite le premier lot à Ruffin et exige exactement trois éditions. Il
n'appelle que `createMeasure`, dont l'état par défaut est DRAFT. Il n'appelle aucune transition de
review ou de publication et ne met à jour aucune mesure existante.

Le déploiement de migration et l'apply de production restent des opérations séparées, soumises au
rituel DB write : inspection, dry-run, sauvegarde, récapitulatif et confirmation humaine.

## Nouvelles métriques

L'extraction rapporte : proposed, READY, WARNING, BLOCKED, possibles doublons et déjà existants.
La revue permettra de mesurer : validated, corrected, rejected, duplicate et temps moyen. La
métrique produit visée est le nombre de mesures sourcées traitées du document à la validation
humaine par heure.

## Dry-run Ruffin du 18 août 2026

Commande exécutée une fois, sans `--apply` :

```bash
npx tsx --env-file=.env scripts/import-presidential-programs.ts --draft-v6 --candidate=francois-ruffin
```

Corpus : les trois ProgramEdition officielles Ruffin, toutes classées
`CANDIDATE_PROPOSALS_2027`.

| Indicateur                                           | Valeur |
| ---------------------------------------------------- | -----: |
| Documents connus, acquis et parsés                   |      3 |
| Extractions proposées avant déduplication de fenêtre |    612 |
| Extractions uniques                                  |    430 |
| `READY_FOR_REVIEW`                                   |    166 |
| `REVIEW_WITH_WARNING`                                |     36 |
| `TECHNICALLY_BLOCKED`                                |    228 |
| DRAFTs qui seraient créés                            |    202 |
| Déjà existants                                       |      0 |
| Doublons possibles contre la base                    |      0 |
| DRAFTs créés                                         |      0 |

Répartition des 202 propositions draftables : 144 MEASURE et 58 OBJECTIVE. Les warnings sont
`WORDING_NEEDS_REVIEW` 19, `EVIDENCE_SCOPE_WEAK` 15 et
`OBJECTIVE_VS_MEASURE_UNCERTAIN` 2.

Persistence : 202 snapshots V3 valides, 0 invalide. La candidature Ruffin porte actuellement 0
Measure en base, ce qui explique les compteurs déjà existants et doublons à zéro.

Couverture parser : 568 blocs, dont 555 fiables et 13 bloqués ; 1 558 unités, dont 1 457 fiables et
101 bloquées ; 5 pages suspectes. Aucun PDF scanné, aucune erreur d'extraction et aucun retry. Le
discourse a utilisé trois cache hits et aucun nouvel appel modèle.

Documents et hashes :

| ProgramEdition                                                  | Hash SHA-256                                                       | Blocs fiables | Unités fiables | Draftables |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | ------------: | -------------: | ---------: |
| Cahier n°1, statut des travailleuses et travailleurs essentiels | `11e7d69800a6ac5afc97c624bdd1feec94b5c33d41784b42b3efd0f9fbe916f9` |           207 |            435 |         33 |
| Cahier n°2, séparation de l'argent et de l'État                 | `e1ca022a6c73f0419b99ee06b2a071c5d186400eff068a4e731ffa25db65a21f` |           191 |            598 |         93 |
| Cahier n°3, temps des loisirs                                   | `cec451d7d8e10ae114bc1d7bfb4afe5b721d30e4146401b6794c657540e86c63` |           157 |            424 |         76 |

Artifacts locaux :

- shadow JSON : `b8c542ee2267b5bca4d9e5770a91f5a4cb0d14b64a9be44a80460b23c6215bd3` ;
- plan DRAFT JSON : `61c0b3058f96f12c358c340d54919f04d574508d8b41ca3a9c46f82ee2cd4a2e` ;
- plan DRAFT Markdown : `439cd88026f9e04b15bba1845b0f8fd30456ae016f4395fa0bcf502b2a62d7bc`.

La migration locale est disponible. La cible de production ne porte ni `evidenceSnapshot`, ni les
colonnes de revue V6. `targetSchemaCompatible` vaut donc false. Aucun déploiement de migration et
aucun apply n'ont été exécutés.

Les prompts gelés sont inchangés :

- discourse : `89a2ecdcee6b4a822f6a50553faa22c2b7e48f1cfe9409e4576954db0685fe8e` ;
- measure extractor : `3900b57fe3a3eeaf7c797cca895157cced01c05802d18e6a1a746d50acbf778e`.
