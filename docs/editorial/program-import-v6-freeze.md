# Gel sémantique Program Import V6

Date du gel : 17 août 2026.

Ce manifeste fige la sémantique du pipeline présidentiel V6 avant la persistance et avant la
constitution du premier blind indépendant de cette architecture. Toute modification ultérieure qui
change une classification, une attribution, une extraction ou une décision d'acceptation invalide ce
gel et impose un nouveau manifeste avant de constituer un blind.

## Révisions de référence

- Branche de travail : `agent/program-import-v6-shadow`.
- HEAD de référence : `c2b459197534eb5653c5ab417a8b43c31c42020d`.
- `origin/main` connu : `6457cde96b9b94d4c968361d24cafab82a292fa3`.
- Parser : `program-document-parser/7-units-v1`.
- Discourse extractor : `mistral-large-latest/presidential-program-discourse-1-units-v2`.
- Measure extractor : `mistral-large-latest/presidential-program-import-7-discourse-grounded-v1`.
- Evidence schema : `evidence-snapshot/v3`.

## Empreintes des prompts

Chaque empreinte est un SHA-256 du prompt système, d'un octet NUL, puis du contrat de sortie envoyé
dans le message utilisateur.

- Discourse prompt : `89a2ecdcee6b4a822f6a50553faa22c2b7e48f1cfe9409e4576954db0685fe8e`.
- Measure extraction prompt : `3900b57fe3a3eeaf7c797cca895157cced01c05802d18e6a1a746d50acbf778e`.

## Fichiers sémantiques gelés

Les empreintes portent sur les octets exacts des fichiers au moment du gel.

| Fichier                                               | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `src/services/measures/program-import/versions.ts`    | `442393fbcff0ed2650c3e4da5577b1886348e25ed07ce5a7bd97eb24afd1a39f` |
| `src/services/measures/program-import/types.ts`       | `d2cf4802a8eb216f4f9e0ba1376fe18826061236f924dd9cc856df649fb2ff38` |
| `src/services/measures/program-import/parser.ts`      | `47630365d0f7a6e5bb48433964abd9efc540110e8370582fa1fda3fcc6aafbf4` |
| `src/services/measures/program-import/discourse.ts`   | `e4d59515f109f996a2fa40084623aa340bf47651be7363b5277662bcae87e046` |
| `src/services/measures/program-import/evidence-v6.ts` | `cc1858301bd39a9ea729455247c2eb214ad2b34352a329d0fa3e4da0c755593f` |
| `src/services/measures/program-import/policy.ts`      | `836cd53b81e7c66332def7ab3ce2df9a19dfa1f23ac144c9fc416904dbb43e80` |
| `src/services/measures/program-import/shadow-v6.ts`   | `a84be6fa6960cb3bfcf5edcaa494f6b23dc50ecf706b46051f9cecb4644249f1` |

Ce périmètre couvre le parser, `DocumentUnit`, les taxonomies et prompts discourse, le prompt
d'extraction, la politique des anchors, l'attribution, la normalisation, les sentinelles numériques,
la localité des bundles, la déduplication sémantique et la validation de preuve.

Les changements autorisés après ce gel sont limités à la persistance, la sérialisation, l'affichage
admin, le wiring non sémantique, les tests de persistance et les corrections techniques qui ne changent
aucune décision éditoriale.

## Corpus consommés

Ces corpus restent utilisables comme régressions, mais ne constituent plus une preuve indépendante :

- gold Ruffin ;
- precision-v1 ;
- ancien holdout 45 ;
- blind-v1 ;
- blind-v2 ;
- blind-v3 ;
- shadow review 20 ;
- shadow review 50 ;
- fixtures discourse et développement ;
- cas ciblés ajoutés pour les témoignages, diagnostics, références juridiques, politiques existantes,
  nombres structurels et erreurs historiques.

Le futur `ruffin-v6-blind-holdout-v4` doit exclure par fingerprint normalisé tout contenu présent dans
ces corpus, les prompts et leurs exemples.

## Contrat de révélation

L'annotation humaine du blind doit être terminée et son hash enregistré avant tout calcul des décisions
du pipeline. Le scoring est unique. Après révélation, aucune modification des fichiers sémantiques
ci-dessus ni aucun second scoring ne sont autorisés dans la même session.
