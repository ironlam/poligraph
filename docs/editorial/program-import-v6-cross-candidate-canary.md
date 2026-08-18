# Program Import V6, canary cross-candidate Marine Le Pen

Date: 17 août 2026.

Verdict: `V6_CROSS_CANDIDATE_VALIDATION_FAILED`.

Le pipeline V6 gelé ne franchit ni le gate de précision, ni le minimum de rappel, ni les gates
absolus de sûreté. La persistence EvidenceSnapshotV3 est portable sur le canary, mais ce résultat
technique ne compense pas l'échec éditorial.

Le corpus Ruffin est désormais qualifié correctement comme corpus de développement consommé:
`RUFFIN_CORPUS_EXHAUSTED_FOR_INDEPENDENT_VALIDATION`. Aucun score Ruffin n'a été recalculé.

## Limite méthodologique déclarée

L'annotation source-only et l'audit post-reveal ont été réalisés par Codex, sans visibilité sur les
sorties V6 avant le gel du gold. Ils ne sont pas présentés comme une intervention humaine. Cette
limite est inscrite dans les artifacts avec `CODEX_SOURCE_ONLY_EDITORIAL_ANNOTATION` et
`CODEX_POST_REVEAL_EDITORIAL_AUDIT`. Elle interdit à elle seule un verdict de readiness humaine,
mais le canary échoue déjà nettement sur les métriques et la sûreté.

## Preflight

- Branche: `agent/program-import-v6-shadow`.
- HEAD: `c2b459197534eb5653c5ab417a8b43c31c42020d`.
- `origin/main`: `6457cde96b9b94d4c968361d24cafab82a292fa3`.
- Worktree entrant: 15 fichiers suivis modifiés, artifacts V6 non suivis, fichiers glossary hors scope.
- `git diff --check`: succès avant le canary.
- Parser: `program-document-parser/7-units-v1`, hash
  `47630365d0f7a6e5bb48433964abd9efc540110e8370582fa1fda3fcc6aafbf4`.
- Discourse: `mistral-large-latest/presidential-program-discourse-1-units-v2`, hash
  `e4d59515f109f996a2fa40084623aa340bf47651be7363b5277662bcae87e046`.
- Extracteur V6: `mistral-large-latest/presidential-program-import-7-discourse-grounded-v1`,
  hash `cc1858301bd39a9ea729455247c2eb214ad2b34352a329d0fa3e4da0c755593f`.
- Policy: `presidential-program-acceptance-2026-08-16-v3`, hash
  `836cd53b81e7c66332def7ab3ce2df9a19dfa1f23ac144c9fc416904dbb43e80`.
- Prompt discourse: `89a2ecdcee6b4a822f6a50553faa22c2b7e48f1cfe9409e4576954db0685fe8e`.
- Prompt extracteur: `3900b57fe3a3eeaf7c797cca895157cced01c05802d18e6a1a746d50acbf778e`.
- Manifeste freeze: `0bed0c2412192830b8167efae4a9f6e07baa64875f0896ecca8eb4837e1983ff`.
- Evidence: `evidence-snapshot/v3`.

Tous les hashes sémantiques ont été revérifiés après reveal et sont restés identiques.

## Sélection du candidat canary

La sélection a utilisé uniquement les métadonnées `ProgramEdition`, l'owner, le label, l'URL, la
date, le statut de candidature et l'accessibilité du document. Aucune relation `Measure`, sortie V5,
sortie V6 ou décision antérieure n'a été lue.

| Rang  | Candidat            | Corpus                                                                | Décision pré-parsing                  |
| ----- | ------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| 1     | Marine Le Pen       | PDF primaire de 35 pages, intitulé « Projet de Marine Le Pen »        | Retenu                                |
| 2     | Bernard Cazeneuve   | Lettre candidate primaire en PDF, densité d'engagements incertaine    | Alternative pré-scoring               |
| 3     | Nathalie Arthaud    | Brochure primaire, corpus mixte et densité incertaine                 | Alternative pré-scoring               |
| 4     | Édouard Philippe    | Homepage primaire, volets riches derrière des sous-pages non acquises | Non retenu avec le documentUrl actuel |
| Exclu | Antoine Mikolajczak | Projet Équinoxe, plateforme de parti sans reprise candidate démontrée | Inadmissible                          |

Le candidat retenu et les quatre autres noms n'apparaissaient dans aucun prompt, fixture, benchmark,
test, human review ou document V6 du dépôt. Le PDF Marine Le Pen diffère de Ruffin par sa structure en
chapitres économiques, ses deux colonnes, ses citations datées et son mélange de diagnostics et de
propositions.

## Corpus documentaire

- Éditeur: Rassemblement national, document primaire officiel.
- Attribution: le titre répété est « La France entreprend, Projet de Marine Le Pen » et la
  `ProgramEdition` appartient à la candidature Marine Le Pen.
- Classification: `CANDIDATE_PROPOSALS_2027`, et non programme présidentiel complet.
- URL primaire: <https://rassemblementnational.fr/documents/WEB-GRN-LIVRET-ENTREPRISE.pdf>.
- Date de la `ProgramEdition`: 6 septembre 2024.
- Hash acquis: `84fcdf9546e870b286a36a0103fc8e90d5870eac1fa5b2f31cc8123ae2f3becd`.
- Pages physiques: 35. Le parser expose 36 diagnostics à cause du séparateur terminal de
  `pdftotext`.
- Hash parsed-source: `8ff19e5ea1a5332d3e0971e958cad819de128c3e67ed48cf69ab07a45700e7cb`.

Ce document est candidat-spécifique. Les plateformes `PARTY_PLATFORM_CURRENT` observées en base
n'ont pas été transformées en programme candidat.

## Couverture parser

| Mesure              | Compte |
| ------------------- | -----: |
| Diagnostics de page |     36 |
| Pages fiables       |     34 |
| Pages suspectes     |      2 |
| Pages bloquées      |      2 |
| Blocs totaux        |    262 |
| Blocs fiables       |    250 |
| Blocs bloqués       |     12 |
| Unités totales      |    442 |
| Unités fiables      |    415 |
| Unités bloquées     |     27 |

Les pages 16 et 21 ont été bloquées pour `AMBIGUOUS_COLUMN_BOUNDARY`. Le parser n'a pas été
modifié. Avec 415 unités fiables sur 442, le canary a été jugé suitable.

## Scope indépendant

- Option A: toutes les sections programmatiques de la plage continue pages 5 à 29.
- Pages 16 et 21 exclues fail-closed avant annotation.
- Pages fiables avec unités dans le scope: 22.
- Blocs: 221.
- Unités: 377.
- Seed: sans objet, le scope est exhaustif sur les sections retenues.
- Hash canonique du payload scope: `19e656e6fed09a9d80703c9114f4e66d3bc410b6f1e86ed856d3e87e1ce042af`.
- Hash du fichier scope: `4042f6ada34e38be632ef86e6877d11434c502594e5aa6d68f9bf01da6af93e2`.

La sélection n'a utilisé ni verbes d'action, ni headings normatifs, ni sorties potentielles positives.

## Gold indépendant

- Gold initial: 81 items, 70 `MEASURE`, 11 `OBJECTIVE`.
- Deux corrections post-reveal manifestes et tracées: soutien aux industries culturelles et objectif
  d'attractivité ultramarine.
- Gold adjudicatif: 83 items, 71 `MEASURE`,
  12 `OBJECTIVE`.
- Les engagements peuvent référencer plusieurs unités contiguës et ne sont pas forcés à une seule
  `DocumentUnit`.
- Hash immuable du gold source-only: `669e4889a3fc27b86965383c7f124a4ac5e336bd3d8929f3a4887ac9aa8bbaf2`.

Les corrections sont conservées séparément dans l'adjudication. Le fichier gold et son hash n'ont pas
été modifiés après reveal.

## Preuve d'indépendance

Ordre chronologique enregistré:

1. Scope sélectionné à 23:19:14 Europe/Paris.
2. Source parsée à 23:19:14.
3. Annotation source-only terminée à 23:24:54.
4. Gold hash gelé à 23:25:00.
5. Reçu pré-reveal hashé: `e3b4f2b176c751344c40fae31c5a2a3d3ee4a01a16db8e4d5e26719aaba07020`.
6. Run V6 ordinal 1 démarré à 2026-08-17T21:27:30.497Z.
7. Run V6 ordinal 1 terminé à 2026-08-17T21:45:17.962Z.

Le reçu pré-reveal fixe aussi les règles de matching et de comptage. Il n'a pas changé après la
révélation.

## Run canary V6

- Mode: `v6-shadow-read-only`.
- Durée: 1067.4 s.
- Documents: 1/1 parsé, 0 échec.
- Discourse: 11 appels, 0 cache hit.
- Fenêtres d'extraction: 97.
- Sorties proposées: 259.
- Sorties uniques: 149.
- Doublons de fenêtres supprimés: 110.
- Bundles valides: 142, invalides: 7.
- Avec anchors: 133, sans anchor: 16.
- Éligibles document complet: 99.
- Éligibles entièrement dans le scope: 93.
- Erreurs d'extraction: 0.
- Retries: 0.
- Hash du rapport brut: `e2720fc90948e31fb5758edf1261b0f4bb27d36b44154f836194de51665d47f2`.

### Discourse

| Rôle                   | Compte |
| ---------------------- | -----: |
| `COMMITMENT`           |    103 |
| `OBJECTIVE`            |     37 |
| `EXPLICIT_ENDORSEMENT` |      1 |
| `DIAGNOSIS`            |     68 |
| `EXISTING_POLICY`      |      0 |
| `TESTIMONY`            |      8 |
| `LEGAL_REFERENCE`      |      9 |
| `HISTORICAL_REFERENCE` |      4 |
| `EXAMPLE`              |     10 |
| `VALUE`                |     11 |
| `GENERAL_INTENT`       |      4 |
| `DETAIL`               |     35 |
| `OTHER`                |    125 |

## Appariement

| Type              | Compte de sorties TP |
| ----------------- | -------------------: |
| `ONE_TO_ONE`      |                   37 |
| `ONE_TO_MANY`     |                    2 |
| `MANY_TO_ONE`     |                   11 |
| `AMBIGUOUS_MATCH` |                    0 |

Les doublons sans portée distincte sont FP. Un mismatch `MEASURE` / `OBJECTIVE` est FP et laisse
le gold correspondant en FN.

## Métriques indépendantes

| Périmètre | TP sorties | FP sorties | Gold retrouvés | Gold total |  FN | Précision |  Rappel |
| --------- | ---------: | ---------: | -------------: | ---------: | --: | --------: | ------: |
| Global    |         50 |         43 |             63 |         83 |  20 |   53.76 % | 75.90 % |
| MEASURE   |         43 |         28 |             53 |         71 |  18 |   60.56 % | 74.65 % |
| OBJECTIVE |          7 |         15 |             10 |         12 |   2 |   31.82 % | 83.33 % |

La précision est très inférieure au gate de 95 %. Le rappel global est inférieur au minimum de 80 %.

## Erreurs de sûreté

| Catégorie                         | Compte |
| --------------------------------- | -----: |
| `TESTIMONY_AS_CANDIDATE`          |      0 |
| `DIAGNOSIS_AS_ACTION`             |      0 |
| `LEGAL_REFERENCE_AS_COMMITMENT`   |      0 |
| `EXISTING_POLICY_AS_PROPOSAL`     |      0 |
| `HISTORICAL_AS_CURRENT`           |      1 |
| `THIRD_PARTY_AS_CANDIDATE`        |      0 |
| `UNSUPPORTED_SUBSTANTIVE_CONTENT` |      3 |
| `QUANTITATIVE_INVENTION`          |      0 |
| `PROVENANCE_FAILURE`              |      1 |
| `INSUFFICIENT_COMMITMENT`         |     15 |
| `OTHER`                           |     23 |

Les gates absolus échouent à cause d'un historique 2022 accepté comme courant, de trois formulations
avec contenu substantiel hors bundle et d'une provenance insuffisante acceptée.

## Analyse de chaque FP

- `cmsjfx2ki000au5v5nh62tkoy:v6:0005`, MEASURE, p. 6, `INSUFFICIENT_COMMITMENT`: Remettre la production de richesse au centre du projet politique de la France pour rétablir l'harmonie entre l'État, les entreprises et les salariés. Motif: Orientation économique générale sans instrument autonome.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0007`, MEASURE, p. 6, `OTHER`: Soutenir les entreprises dans leurs projets de croissance via la priorité nationale dans l'accès à la commande publique. Motif: Répétition introductive sans recouvrement de preuve avec la mesure gold détaillée.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0014`, OBJECTIVE, p. 8, `INSUFFICIENT_COMMITMENT`: Rebâtir une économie de production et rétablir la productivité française. Motif: Titre de chapitre, sans cible ou moyen assez précis.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0017`, OBJECTIVE, p. 9, `INSUFFICIENT_COMMITMENT`: Faire de la France un « paradis énergétique ». Motif: Slogan énergétique sans cible vérifiable.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0018`, OBJECTIVE, p. 9, `OTHER`: Faire de la France un « paradis énergétique » pour renforcer la compétitivité des entreprises. Motif: Sortie redondante du même slogan énergétique.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0019`, MEASURE, p. 9, `INSUFFICIENT_COMMITMENT`: Rétablir une énergie compétitive et abondante pour soutenir la réindustrialisation. Motif: Orientation vers une énergie compétitive, sans instrument dans le bundle.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0028`, OBJECTIVE, p. 10, `INSUFFICIENT_COMMITMENT`: Baisser le poids des impôts de production. Motif: Titre fiscal général sans cible chiffrée ni instrument.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0035`, MEASURE, p. 10, `OTHER`: Appliquer un plan de production massive d'électricité décarbonée et pilotable, fondé sur le développement du nucléaire et de l'hydroélectricité ainsi que des potentialités de l'hydrogène, des biocombustibles et de la géothermie, pour atteindre une industrie manufacturière représentant 20 % du PIB entre 2045 et 2050 Motif: Sortie redondante du plan énergétique et classe incompatible avec la cible industrielle.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0039`, MEASURE, p. 10, `PROVENANCE_FAILURE`: Démanteler les parcs énergétiques mettant en cause le patrimoine naturel ou historique et limiter le développement de l'énergie solaire aux zones géographiques pertinentes. Motif: Le bundle omet l'unité qui identifie les parcs comme éoliens et élargit la formulation à des parcs énergétiques.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0042`, MEASURE, p. 10, `OTHER`: Supprimer la contribution foncière des entreprises (CFE). Motif: Doublon sans portée distincte de la suppression de la CFE.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0045`, MEASURE, p. 12, `INSUFFICIENT_COMMITMENT`: Reprendre en main le contenu et les modalités des enseignements et valoriser l’enseignement professionnel. Motif: Heading éducatif large sans instrument suffisamment déterminé.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0058`, MEASURE, p. 12, `OTHER`: Organiser des assises de la formation professionnelle pour adapter l'offre de formation initiale et continue aux besoins des branches professionnelles, en réponse aux tensions de recrutement et aux enjeux de réindustrialisation, montée en compétence et reconversion. Motif: Doublon sans portée distincte des sorties formation 0051 et 0053.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0059`, MEASURE, p. 12, `OTHER`: Créer un fonds souverain pour orienter l'épargne des Français vers des secteurs stratégiques. Motif: Doublon simplifié du fonds souverain.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0060`, OBJECTIVE, p. 12, `OTHER`: Protéger les entreprises viables des fonds vautours et orienter l'épargne vers l'activité économique française. Motif: Objectif dérivé et redondant du fonds souverain, sans gold objectif distinct.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0067`, MEASURE, p. 14, `UNSUPPORTED_SUBSTANTIVE_CONTENT`: Supprimer les dispositions dogmatiques de la Charte de l’environnement et revoir certaines législations limitant la recherche fondamentale, tout en lançant un plan de modernisation des laboratoires et d’amélioration des conditions de travail pour attirer des scientifiques. Motif: La venue de scientifiques est formulée alors que l'unité qui complète cette proposition n'est pas dans le bundle.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0070`, OBJECTIVE, p. 14, `INSUFFICIENT_COMMITMENT`: Encourager la recherche fondamentale. Motif: Objectif de recherche réduit à un heading générique.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0072`, OBJECTIVE, p. 15, `INSUFFICIENT_COMMITMENT`: Développer l'esprit entrepreneurial en France Motif: Titre de chapitre sans cible vérifiable.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0083`, MEASURE, p. 19, `INSUFFICIENT_COMMITMENT`: Encourager le développement de l’image de la « maison France » dans le secteur du tourisme. Motif: Formulation générique d'image sans acteur ni instrument dans le bundle.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0084`, MEASURE, p. 19, `OTHER`: Garantir la pérennité des secteurs d'excellence française Motif: Doublon plus vague de la sortie 0081.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0085`, MEASURE, p. 19, `UNSUPPORTED_SUBSTANTIVE_CONTENT`: Encourager la montée en gamme des restaurateurs et hôteliers indépendants et associer les marques internationales du luxe français au développement de son image. Motif: La formulation mentionne les marques internationales du luxe sans inclure l'unité qui les établit.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0086`, OBJECTIVE, p. 20, `INSUFFICIENT_COMMITMENT`: Développer la valeur travail pour soutenir les classes moyennes Motif: Titre de chapitre sur la valeur travail.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0091`, OBJECTIVE, p. 22, `HISTORICAL_AS_CURRENT`: Permettre à chacun de vivre de son travail ou de sa retraite, et favoriser l'entrepreneuriat en réduisant les normes et taxes jugées injustes. Motif: Le bundle reprend une citation de programme attribuée à une déclaration du 1er mai 2022 comme objectif courant.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0094`, MEASURE, p. 23, `OTHER`: Convoquer une conférence sociale sur la question des accidents du travail pour rétablir un dialogue social productif. Motif: Sortie incomplète et redondante de la conférence sur les accidents du travail.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0095`, MEASURE, p. 22, `OTHER`: Instaurer une priorité d’accès au logement social fondée sur la nationalité et le type de métier exercé. Motif: Doublon sans portée distincte de la sortie logement 0093.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0099`, MEASURE, p. 23, `OTHER`: Faciliter la création de nouveaux syndicats et autoriser les candidatures syndicales libres pour renforcer la liberté syndicale. Motif: Doublon partiel de la sortie syndicale 0098.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0100`, MEASURE, p. 23, `OTHER`: Soumettre les syndicats aux mêmes règles et modalités de contrôle financier que les partis politiques. Motif: Doublon partiel de la sortie syndicale 0098.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0104`, MEASURE, p. 25, `INSUFFICIENT_COMMITMENT`: Rationaliser la dépense publique. Motif: Titre générique de rationalisation de la dépense.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0106`, MEASURE, p. 25, `OTHER`: Réduire fortement le nombre d’agences et d’autorités administratives. Motif: Doublon incomplet de la suppression des agences.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0107`, MEASURE, p. 25, `OTHER`: Redéployer la richesse nationale en consacrant un tiers des économies à la réduction des déficits, un tiers aux baisses d’impôts pour les ménages et un tiers aux baisses des prélèvements sur les entreprises. Motif: Doublon partiel du plan de dépense 0105.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0116`, OBJECTIVE, p. 26, `INSUFFICIENT_COMMITMENT`: Mettre l'État au service de la prospérité nationale. Motif: Titre de chapitre sur la prospérité nationale.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0118`, MEASURE, p. 26, `OTHER`: Créer un ministère chargé spécifiquement de la lutte contre les fraudes. Motif: Doublon incomplet de la création du ministère des fraudes.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0119`, MEASURE, p. 26, `OTHER`: Créer un ministère spécifiquement chargé de lutter contre toutes les formes de fraude, y compris fiscales, sociales, les abus, ententes et infractions aux règles de concurrence. Motif: Doublon du ministère des fraudes, moins complet que 0124.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0122`, OBJECTIVE, p. 26, `INSUFFICIENT_COMMITMENT`: Réaménager les territoires pour corriger les déséquilibres économiques et administratifs. Motif: Heading territorial sans instrument autonome.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0125`, MEASURE, p. 26, `UNSUPPORTED_SUBSTANTIVE_CONTENT`: Lutter contre les abus, ententes et infractions aux règles de concurrence affectant les TPE et PME. Motif: Le bundle n'établit pas le ciblage des TPE et PME ajouté à la formulation.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0126`, MEASURE, p. 26, `OTHER`: Renforcer les contrôles aux frontières pour vérifier la conformité des produits alimentaires importés et faire peser sur les distributeurs finaux la responsabilité de la conformité de ces produits aux normes imposées aux producteurs français. Motif: Doublon sans portée distincte de la sortie importations 0121.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0129`, MEASURE, p. 27, `OTHER`: Développer le potentiel des territoires ultramarins. Motif: Classe MEASURE incompatible avec les objectifs ultramarins gold.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0132`, OBJECTIVE, p. 27, `INSUFFICIENT_COMMITMENT`: Ajuster la fiscalité aux besoins du pays. Motif: Titre fiscal général sans cible ou instrument.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0133`, OBJECTIVE, p. 27, `INSUFFICIENT_COMMITMENT`: Rétablir le consentement à l'impôt et à la dépense publique en rendant transparent l'emploi des prélèvements obligatoires. Motif: Objectif de consentement à l'impôt sans mécanisme vérifiable.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0134`, OBJECTIVE, p. 28, `OTHER`: Faire de l'Outre-mer un espace recherché pour les investisseurs. Motif: Doublon plus vague de l'objectif ultramarin 0135.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0139`, OBJECTIVE, p. 29, `OTHER`: Lutter contre toutes les formes d’ingérence étrangère en priorisant les services de renseignement et la diplomatie, et doter les entreprises de moyens de protection. Motif: Classe OBJECTIVE incompatible avec la mesure gold sur les ingérences étrangères.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0143`, MEASURE, p. 29, `OTHER`: Défendre les principes de juste échange et de régionalisation des chaînes de valeur. Motif: Classe MEASURE incompatible avec l'objectif gold de juste échange.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0145`, MEASURE, p. 29, `OTHER`: Remplacer la Commission européenne par un secrétariat général chargé du respect des règles du marché commun, de la protection contre la concurrence déloyale extra-européenne et de la facilitation de projets concrets de coopération entre pays volontaires. Motif: Doublon sans portée distincte du remplacement de la Commission.
- `cmsjfx2ki000au5v5nh62tkoy:v6:0146`, MEASURE, p. 29, `OTHER`: Lancer des négociations sur les questions agricoles pour défendre une exception agriculturelle. Motif: Doublon partiel de la négociation agricole 0144.

## Analyse de chaque FN

- `mlp-canary-005`, ACCEPT_MEASURE: Réformer EDF en une entité unique intégrant RTE et Enedis. Preuve: `pdf-10-3-u001`.
- `mlp-canary-006`, ACCEPT_MEASURE: Baisser immédiatement de 30 % le prix de l'électricité en l'alignant sur les coûts réels de production. Preuve: `pdf-10-3-u001`.
- `mlp-canary-007`, ACCEPT_MEASURE: Poursuivre les échanges d'électricité avec les pays voisins au moyen de contrats d'approvisionnement de long terme. Preuve: `pdf-10-3-u001`.
- `mlp-canary-009`, ACCEPT_MEASURE: Prolonger et optimiser les réacteurs actuels, développer 20 EPR2 d'ici 2045 et lancer des SMR et des réacteurs de quatrième génération. Preuve: `pdf-10-5-u003`, `pdf-10-5-u004`, `pdf-10-5-u005`, `pdf-10-5-u006`.
- `mlp-canary-010`, ACCEPT_OBJECTIVE: Dimensionner le parc électrique pour permettre à l'industrie manufacturière d'atteindre 20 % du PIB entre 2045 et 2050. Preuve: `pdf-10-4-u003`, `pdf-10-5-u001`.
- `mlp-canary-013`, ACCEPT_MEASURE: Limiter le solaire aux zones géographiques pertinentes et à des filières françaises ou européennes. Preuve: `pdf-10-5-u007`, `pdf-10-5-u009`.
- `mlp-canary-014`, ACCEPT_MEASURE: Réactiver Euratom et l'enrichir d'une stratégie hydrogène avec les partenaires volontaires. Preuve: `pdf-10-5-u007`, `pdf-10-5-u008`, `pdf-10-5-u009`, `pdf-10-5-u010`, `pdf-10-5-u011`.
- `mlp-canary-019`, ACCEPT_MEASURE: Aligner la nomenclature des comptes publics sur celle des partenaires européens. Preuve: `pdf-10-13-u001`, `pdf-10-14-u001`, `pdf-10-14-u002`.
- `mlp-canary-024`, ACCEPT_MEASURE: Recentrer les aides à l'apprentissage sur les filières où les besoins économiques sont les plus forts. Preuve: `pdf-12-5-u005`.
- `mlp-canary-027`, ACCEPT_MEASURE: Élargir le suramortissement aux ETI et augmenter son taux de dix points pour soutenir la robotisation. Preuve: `pdf-13-2-u001`, `pdf-13-2-u002`, `pdf-13-3-u001`.
- `mlp-canary-028`, ACCEPT_MEASURE: Lancer une simplification législative et réglementaire avec les partenaires sociaux et les entreprises, puis soumettre le résultat au Parlement. Preuve: `pdf-13-4-u001`, `pdf-13-4-u002`, `pdf-13-4-u003`.
- `mlp-canary-033`, ACCEPT_MEASURE: Construire des processus d'évaluation de la recherche adaptés au monde scientifique. Preuve: `pdf-14-5-u001`, `pdf-14-6-u001`.
- `mlp-canary-038`, ACCEPT_MEASURE: Exonérer d'impôt sur les sociétés pendant cinq ans les entreprises créées par une personne de moins de trente ans. Preuve: `pdf-17-9-u001`, `pdf-17-9-u002`.
- `mlp-canary-041`, ACCEPT_MEASURE: Associer les marques internationales du luxe au développement de l'image de la France. Preuve: `pdf-19-9-u001`, `pdf-19-10-u001`, `pdf-19-10-u002`, `pdf-19-10-u003`.
- `mlp-canary-046`, ACCEPT_MEASURE: Simplifier les demandes justifiées d'embauche d'un étranger en situation régulière disposant des compétences nécessaires. Preuve: `pdf-22-9-u002`.
- `mlp-canary-060`, ACCEPT_MEASURE: Généraliser le modèle de l'hôpital de Valenciennes pour atteindre 10 % de postes administratifs dans les hôpitaux. Preuve: `pdf-25-14-u001`, `pdf-25-14-u002`, `pdf-25-14-u003`, `pdf-25-14-u004`, `pdf-25-14-u005`, `pdf-25-15-u001`, `pdf-25-15-u002`, `pdf-25-15-u003`.
- `mlp-canary-061`, ACCEPT_MEASURE: Ramener à court terme la part des personnels non enseignants de l'éducation nationale de 23 % à 18 %. Preuve: `pdf-25-15-u001`, `pdf-25-15-u002`, `pdf-25-15-u003`, `pdf-25-15-u004`.
- `mlp-canary-075`, ACCEPT_MEASURE: Faire de la lutte contre les ingérences étrangères une priorité du renseignement et de la diplomatie afin de protéger les entreprises. Preuve: `pdf-29-4-u001`, `pdf-29-5-u001`, `pdf-29-5-u002`.
- `mlp-canary-076`, ACCEPT_MEASURE: Autoriser l'État à intervenir dans l'élaboration des indices servant à fixer des prix garantis dans certaines filières stratégiques. Preuve: `pdf-29-6-u001`, `pdf-29-6-u002`.
- `mlp-canary-079`, ACCEPT_OBJECTIVE: Défendre le juste échange et la régionalisation des chaînes de valeur. Preuve: `pdf-29-14-u001`, `pdf-29-14-u002`.

## Portabilité EvidenceSnapshotV3

- Sorties techniquement éligibles testées: 99.
- Sérialisées, désérialisées et relues comme V3 valides: 99.
- Échecs: 0.
- Vérifications: hashes internes, anchors, support, annotations discourse, documentHash, frontière
  `validateRevisionEvidence({ importEngine: "V6" })` et lecture fail-closed.
- DB writes: NO.
- Hash du rapport portability: `99ccebde93d84219a1ff8dcc559efaa4817f6802bc333cf05073f1be89f4a6bb`.

La persistence V3 fonctionne hors Ruffin. Ce résultat est indépendant de l'échec éditorial.

## Audit post-reveal et quatre invariants

L'audit contient les 43 FP, les 20 FN, zéro match ambigu et un échantillon déterministe de 30 TP,
seed `canary-v6-cross-candidate:marine-le-pen:2026-08-17:tp-audit`. Hash: `4bd4f4071800671cde9214cf137db8188f031552e00ee4408c41de0d3b4e42c0`.

1. Neutralité: aucun traitement partisan asymétrique ni formulation de motif n'a été observé dans les
   30 TP audités. PASS limité au canary.
2. Sourçage: FAIL. Cinq erreurs touchent la borne de preuve ou l'historicité malgré des snapshots
   techniquement valides.
3. Précision: FAIL. 43 FP, principalement des doublons, headings généraux et formulations hors bundle.
4. Clarté: FAIL global. Les TP sont généralement lisibles, mais plusieurs sorties fusionnent trop de
   mesures et les headings acceptés restent trop vagues pour une revue éditoriale fiable.

Cet audit est réalisé par Codex et ne prétend pas être un human audit complet.

## Validation technique

- `git status -sb`
- `git status --short`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git diff --stat`
- `git diff --check`
- `sha256sum des fichiers du semantic freeze et du manifeste`
- `npx tsx -e pour recalculer les deux hashes de prompts`
- `npm run test:run -- parser, discourse, evidence, persistence et viewer`
- `npm run typecheck`
- `lecture DB ProgramEdition présidentielle 2027, select sans relation Measure`
- `acquisition et parsing via program-import-v6-canary-pre-reveal.ts`
- `gel du scope via program-import-v6-canary-scope.ts`
- `validation JSON et gel SHA-256 du gold et du reçu pré-reveal`
- `run unique via program-import-v6-canary-reveal.ts`
- `scoring, audit et portability via program-import-v6-canary-score.ts`
- `npm run test:run -- tests program-import et persistence ciblés`
- `npx eslint ciblé`
- `npm run test:run, suite complète unique`

Résultats:

- Pré-canary: 68 tests ciblés réussis, typecheck réussi.
- Post-reveal ciblé: 201 tests réussis, typecheck réussi.
- Lint ciblé: 0 erreur, cinq warnings de fichiers scripts volontairement ignorés.
- Suite complète unique: 480 fichiers réussis, 54 ignorés, 4 554 tests réussis, 381 ignorés.
- `git diff --check`: succès avant et après reveal.
- Build: non exécuté, aucune information supplémentaire attendue pour ce workflow read-only.
- Aucun rerun LLM.

## Sûreté production

`--apply: NO`

`DB writes production: NO`

`migration deploy: NO`

`draftsCreated: 0`

`publication: NO`

`cutover: NO`

`production modified: NO`

## État Git final

État résumé:

```text
## agent/program-import-v6-shadow
 M prisma/schema.prisma
 M scripts/import-presidential-programs.ts
 M src/app/admin/mesures/[id]/page.tsx
 M src/app/admin/mesures/_components/RevisionTimeline.tsx
 M src/config/glossary.ts
 M src/lib/measures/transitions.ts
 M src/services/measures/program-import/__tests__/extractor.test.ts
 M src/services/measures/program-import/__tests__/parser.test.ts
 M src/services/measures/program-import/__tests__/pipeline.test.ts
 M src/services/measures/program-import/__tests__/safety.test.ts
 M src/services/measures/program-import/extractor.ts
 M src/services/measures/program-import/parser.ts
 M src/services/measures/program-import/pipeline.ts
 M src/services/measures/program-import/policy.ts
 M src/services/measures/program-import/types.ts
?? docs/editorial/program-import-v6-blind-v4-pool-audit.md
?? docs/editorial/program-import-v6-cross-candidate-canary-gold.json
?? docs/editorial/program-import-v6-cross-candidate-canary-pre-reveal.json
?? docs/editorial/program-import-v6-cross-candidate-canary.md
?? docs/editorial/program-import-v6-evidence-grounded.md
?? docs/editorial/program-import-v6-freeze.md
?? docs/editorial/program-import-v6-persistence.md
?? prisma/migrations/20260817190000_add_measure_revision_evidence_snapshot/
?? src/app/admin/mesures/_components/EvidenceSnapshotPanel.tsx
?? src/app/admin/mesures/_components/__tests__/EvidenceSnapshotPanel.test.tsx
?? src/config/__tests__/glossary.test.ts
?? src/lib/measures/__tests__/evidence-snapshot-fixture.ts
?? src/lib/measures/__tests__/evidence-snapshot.test.ts
?? src/lib/measures/evidence-snapshot.ts
?? src/services/measures/program-import/__tests__/__snapshots__/
?? src/services/measures/program-import/__tests__/blind-holdout-harness.ts
?? src/services/measures/program-import/__tests__/blind-holdout-v2.test.ts
?? src/services/measures/program-import/__tests__/blind-holdout-v3-score.ts
?? src/services/measures/program-import/__tests__/blind-holdout-v3.test.ts
?? src/services/measures/program-import/__tests__/blind-holdout.test.ts
?? src/services/measures/program-import/__tests__/discourse-development-harness.ts
?? src/services/measures/program-import/__tests__/discourse.test.ts
?? src/services/measures/program-import/__tests__/evidence-v6.test.ts
?? src/services/measures/program-import/__tests__/fixtures/
?? src/services/measures/program-import/__tests__/gold-harness.ts
?? src/services/measures/program-import/__tests__/gold-set.test.ts
?? src/services/measures/program-import/__tests__/precision-harness.ts
?? src/services/measures/program-import/__tests__/precision-set.test.ts
?? src/services/measures/program-import/__tests__/shadow-v6.test.ts
?? src/services/measures/program-import/discourse.ts
?? src/services/measures/program-import/evidence-v6.ts
?? src/services/measures/program-import/shadow-v6.ts
?? src/services/measures/program-import/versions.ts
```

État détaillé:

```text
 M prisma/schema.prisma
 M scripts/import-presidential-programs.ts
 M src/app/admin/mesures/[id]/page.tsx
 M src/app/admin/mesures/_components/RevisionTimeline.tsx
 M src/config/glossary.ts
 M src/lib/measures/transitions.ts
 M src/services/measures/program-import/__tests__/extractor.test.ts
 M src/services/measures/program-import/__tests__/parser.test.ts
 M src/services/measures/program-import/__tests__/pipeline.test.ts
 M src/services/measures/program-import/__tests__/safety.test.ts
 M src/services/measures/program-import/extractor.ts
 M src/services/measures/program-import/parser.ts
 M src/services/measures/program-import/pipeline.ts
 M src/services/measures/program-import/policy.ts
 M src/services/measures/program-import/types.ts
?? docs/editorial/program-import-v6-blind-v4-pool-audit.md
?? docs/editorial/program-import-v6-cross-candidate-canary-gold.json
?? docs/editorial/program-import-v6-cross-candidate-canary-pre-reveal.json
?? docs/editorial/program-import-v6-cross-candidate-canary.md
?? docs/editorial/program-import-v6-evidence-grounded.md
?? docs/editorial/program-import-v6-freeze.md
?? docs/editorial/program-import-v6-persistence.md
?? prisma/migrations/20260817190000_add_measure_revision_evidence_snapshot/
?? src/app/admin/mesures/_components/EvidenceSnapshotPanel.tsx
?? src/app/admin/mesures/_components/__tests__/EvidenceSnapshotPanel.test.tsx
?? src/config/__tests__/glossary.test.ts
?? src/lib/measures/__tests__/evidence-snapshot-fixture.ts
?? src/lib/measures/__tests__/evidence-snapshot.test.ts
?? src/lib/measures/evidence-snapshot.ts
?? src/services/measures/program-import/__tests__/__snapshots__/
?? src/services/measures/program-import/__tests__/blind-holdout-harness.ts
?? src/services/measures/program-import/__tests__/blind-holdout-v2.test.ts
?? src/services/measures/program-import/__tests__/blind-holdout-v3-score.ts
?? src/services/measures/program-import/__tests__/blind-holdout-v3.test.ts
?? src/services/measures/program-import/__tests__/blind-holdout.test.ts
?? src/services/measures/program-import/__tests__/discourse-development-harness.ts
?? src/services/measures/program-import/__tests__/discourse.test.ts
?? src/services/measures/program-import/__tests__/evidence-v6.test.ts
?? src/services/measures/program-import/__tests__/fixtures/
?? src/services/measures/program-import/__tests__/gold-harness.ts
?? src/services/measures/program-import/__tests__/gold-set.test.ts
?? src/services/measures/program-import/__tests__/precision-harness.ts
?? src/services/measures/program-import/__tests__/precision-set.test.ts
?? src/services/measures/program-import/__tests__/shadow-v6.test.ts
?? src/services/measures/program-import/discourse.ts
?? src/services/measures/program-import/evidence-v6.ts
?? src/services/measures/program-import/shadow-v6.ts
?? src/services/measures/program-import/versions.ts
```

Aucun commit, push, merge ou rebase n'a
été tenté. Les permissions `.git` n'ont pas été contournées. Les fichiers glossary sont restés hors
scope.

## Verdict

`V6_CROSS_CANDIDATE_VALIDATION_FAILED`

V6, construit et gelé sur Ruffin, ne généralise pas avec la sûreté et la précision requises sur ce
canary inédit. La persistence V3 est prête techniquement, mais un cutover review n'est pas légitime à
partir de ce résultat.
