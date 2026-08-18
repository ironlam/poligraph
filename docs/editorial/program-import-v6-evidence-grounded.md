# Import des programmes V6 : extraction fondée sur la preuve

Statut : shadow READ-ONLY complet, sémantique des commitment anchors à réviser, sans cutover ni
migration.

Date : 2026-08-16.

## 1. Décision

V6 remplace le contrat conceptuel `citation unique -> proposition` par :

```text
document
-> blocs documentaires déterministes
-> bundle de preuve validé
-> proposition éditoriale
-> revue humaine
```

Une proposition n'a plus à être autonome dans une phrase unique. Son référent, son action et ses
modalités peuvent être établis par plusieurs blocs proches et ordonnés. Le modèle ne fournit plus le
texte de preuve. Il sélectionne des identifiants, puis PoliGraph reconstruit la preuve exacte depuis la
sortie du parser.

Cette décision ne change pas l'attribution politique. Un contexte plus large aide à comprendre ce que
dit le document, mais ne transforme ni une citation de tiers, ni un exemple, ni un diagnostic, ni une
mesure historique en engagement de la candidature.

## 2. Invariants éditoriaux

Les invariants sont appliqués dans cet ordre.

### 2.1 Neutralité

La même acquisition, la même segmentation, le même contrat d'extraction, les mêmes contrôles et la
même obligation de revue s'appliquent à chaque candidature et à chaque parti. Aucun nom de parti, de
candidat ou de courant ne peut modifier la décision technique.

### 2.2 Sourçage

Chaque assertion substantielle de la formulation proposée doit pouvoir être rattachée à un ou plusieurs
blocs exacts d'un document recevable. Un bloc est produit par le parser, jamais par le modèle. Un ID
absent, un bloc d'un autre document ou une provenance suspecte invalide le bundle.

### 2.3 Précision

La formulation ne peut ajouter aucun fait politique substantiel absent du bundle. Une vigilance
déterministe particulière porte sur les nombres, pourcentages, montants, dates, durées, seuils, noms
propres, organismes, dispositifs, populations, conditions, exceptions, modalités juridiques et portée
de l'engagement.

La suppression d'une précision substantielle peut aussi déformer une mesure. V6 expose donc toujours
la formulation à côté de la preuve complète, pour que la revue ne se limite pas à la recherche d'ajouts.

### 2.4 Clarté

La formulation proposée au relecteur peut corriger la casse, compléter la grammaire, remplacer une
anaphore démontrée par son référent ou synthétiser plusieurs blocs. Ces opérations sont acceptables si
elles ne changent ni l'action, ni l'acteur, ni l'objet, ni le périmètre, ni les conditions.

## 3. Non-objectifs

V6 ne cherche pas à :

- publier automatiquement une mesure ;
- attribuer automatiquement une plateforme de parti à une candidature ;
- résoudre politiquement une ambiguïté documentaire ;
- transformer une proposition de tiers en engagement ;
- atteindre l'exhaustivité à tout prix ;
- résoudre tout le Natural Language Inference du français ;
- introduire un second appel LLM ;
- créer un nouveau blind holdout avant stabilisation ;
- modifier le schéma Prisma dans cette vague ;
- retraiter immédiatement les quelque 700 sorties Ruffin.

## 4. Data flow V6

```text
ProgramEdition
-> acquisition
-> parsing
-> DocumentBlock[]
-> fenêtres locales de blocs
-> evidence-grounded extraction
-> validation déterministe du bundle
-> validation des commitment anchors et du fondement d'attribution
-> validation de la formulation éditoriale
-> gardes négatives de policy
-> déduplication
-> Measure DRAFT
-> revue humaine
-> publication par la transition métier existante
```

L'extracteur est appelé une seule fois par fenêtre. Le vertical slice ne remplace pas encore le chemin
de production V5. Il valide les contrats avant cutover.

## 5. Contrats de types minimaux

Les noms exacts peuvent évoluer pendant le vertical slice, mais les responsabilités ne doivent pas se
mélanger.

```ts
type DocumentBlock = {
  id: string;
  order: number;
  page: number | null;
  kind: "HEADING" | "CONTENT";
  text: string;
  heading: string | null;
  provenance: SegmentProvenance;
};

type EvidenceBundle = {
  blockIds: string[];
};

type EvidenceExtraction = {
  evidenceBlockIds: string[];
  commitmentAnchorBlockIds: string[];
  supportingBlockIds: string[];
  attributionBasis: AttributionBasis;
  classification: "MEASURE" | "OBJECTIVE" | "VALUE" | "DIAGNOSIS" | "GENERAL_INTENT" | "AMBIGUOUS";
  normalizedText: string | null;
  theme: ThemeCategory | null;
  confidence: number;
  rationale: string;
};

type ValidatedEvidence = {
  programEditionId: string;
  documentUrl: string;
  blocks: DocumentBlock[];
  pages: number[];
  exactText: string;
  relation: "LOCAL" | "HEADING_SCOPE";
};
```

`DocumentBlock` ne porte pas nécessairement `programEditionId`. L'index de blocs est construit pour un
seul document acquis dans le contexte d'une `ProgramEdition`. Le validateur reçoit ce contexte hors du
prompt et l'attache au résultat validé. Le modèle ne choisit jamais l'édition ou l'URL.

## 6. DocumentBlock

### 6.1 Propriétés

Un bloc doit être :

- déterministe pour les mêmes octets et la même version du parser ;
- adressable par un ID unique dans le document ;
- ordonné par un entier strictement croissant ;
- rattaché à une page quand le format le permet ;
- porteur du diagnostic de provenance existant ;
- composé uniquement de texte produit par le parser.

La stabilité entre deux versions du parser n'est pas requise. Le rapport enregistre la version de
l'extracteur et les IDs du run. Les tests peuvent figer les IDs pour une entrée donnée.

### 6.2 Titres

Un titre documentaire peut être un bloc `HEADING`. Il peut aussi être repris dans `heading` sur les
blocs de contenu qu'il gouverne. Dans les deux cas, son texte vient du document. V6 ne traite plus le
heading comme un contexte non sourçable par principe.

Pour le PDF, le vertical slice conserve la segmentation simple fondée sur les pages et séparations de
paragraphes. Il n'introduit pas de moteur de layout sémantique.

## 7. Contraintes d'un EvidenceBundle

Le validateur applique les règles suivantes avant toute policy éditoriale :

1. Chaque ID existe exactement une fois dans l'index du document courant.
2. Les IDs sont uniques et fournis dans l'ordre documentaire.
3. Tous les blocs appartiennent au document de la `ProgramEdition` courante.
4. Aucun bloc `TEXT_LAYER_SUSPECT` ou `TEXT_LAYER_CORRUPTED` n'est utilisable.
5. Un bundle contient au plus quatre blocs dans le vertical slice.
6. Deux blocs sélectionnés successifs peuvent laisser au plus un bloc intermédiaire non sélectionné.
7. Le premier et le dernier bloc couvrent au plus six positions documentaires.
8. Pour un PDF, le bundle traverse au plus une rupture de page.

Ces limites sont une règle de localité, pas un seuil de qualité éditoriale. Elles autorisent un titre et
plusieurs paragraphes, ou une phrase en bas de page suivie de sa continuation. Elles interdisent de
combiner librement les pages 3 et 47.

`HEADING_SCOPE` est dérivé lorsque le premier bloc est un titre et que les blocs de contenu sélectionnés
se trouvent avant le titre suivant. Les autres bundles valides sont `LOCAL`. Le modèle ne peut pas
inventer une justification libre pour contourner la localité. Un futur besoin de relation distante
devra introduire un type de relation déterministe et des tests dédiés.

## 8. Contrat LLM V6

### 8.1 Entrée

Le modèle reçoit :

- le type documentaire et son libellé, comme contexte d'attribution ;
- une fenêtre locale de blocs fiables ;
- pour chaque bloc, son ID, sa page, son type et son texte exact échappé pour le prompt ;
- les définitions des classes et thèmes ;
- l'interdiction explicite d'utiliser un contexte non sélectionnable comme preuve.

Exemple :

```text
[p41-b01, HEADING] CRÉER UNE HAUTE AUTORITÉ À LA PROBITÉ
[p41-b02, CONTENT] Cette autorité sera chargée de contrôler...
[p42-b01, CONTENT] Elle publiera chaque année ses recommandations.
```

### 8.2 Sortie

Le modèle renvoie uniquement :

- `evidenceBlockIds` ;
- `classification` ;
- `normalizedText` ou `null` ;
- `theme` ou `null` ;
- `confidence` ;
- une `rationale` courte.

Il ne renvoie plus `sourceText`. La preuve exacte est reconstruite depuis l'index de blocs.

### 8.3 Interdictions

Le modèle n'a pas le droit :

- d'inventer ou de modifier un ID ;
- de recopier une preuve de sa propre initiative ;
- de sélectionner un bloc absent de la fenêtre ;
- de sélectionner un bloc bloqué pour provenance ;
- de réordonner les blocs ;
- de relier des blocs distants ;
- d'ajouter une assertion absente à la formulation ;
- d'attribuer au candidat une citation, un témoignage, un exemple ou une recommandation de tiers ;
- de transformer une action historique en engagement 2027.

Une violation d'ID ou de provenance échoue de manière déterministe. La confiance du modèle ne peut pas
la compenser.

## 9. Grounding V6

Le grounding primaire pose la question suivante : les blocs sélectionnés existent-ils réellement,
sont-ils fiables et forment-ils un bundle autorisé ?

La vérification n'essaie plus de retrouver dans un grand segment une chaîne `sourceText` reconstruite
par le modèle. Cela supprime la classe V5 `UNGROUNDED_SOURCE_TEXT` pour le chemin V6 sans relâcher le
sourçage. Au contraire, le texte exposé au relecteur est toujours le texte possédé par PoliGraph.

Le rapport ne doit jamais afficher une citation fournie par le modèle. Il affiche les blocs résolus par
ID, avec leur texte exact.

## 10. Formulation éditoriale

### 10.1 Séparation des objets

`ValidatedEvidence` décrit ce que dit le document. `normalizedText` décrit la formulation que PoliGraph
propose au relecteur. Le premier est une preuve, le second est une suggestion éditoriale.

Une extraction peut être conservée pour diagnostic avec `normalizedText: null`. La création d'un DRAFT
exige encore une formulation non vide, car `MeasureRevision.text` est le texte à relire. L'absence de
normalisation n'a donc pas à faire disparaître la preuve du rapport.

### 10.2 Contrôles déterministes

La formulation est refusée si elle introduit un élément sensible détectable absent de l'ensemble des
blocs :

- valeur numérique, pourcentage ou montant ;
- date, année, durée ou seuil quantifié ;
- acronyme ou nom propre ;
- référence juridique nommée ;
- organisme ou dispositif nommé détecté comme tel.

Les contrôles portent sur l'ensemble du bundle, pas sur un bloc unique.

La règle V5 qui exigeait que chaque token de contenu existe dans la citation est retirée du contrat
éditorial. Une reformulation peut ajouter des mots fonctionnels, changer la flexion ou employer un
équivalent rédactionnel neutre. Une divergence lexicale non couverte par les sentinelles sensibles est
signalée dans le rapport pour la revue, sans prétendre résoudre automatiquement toute implication
sémantique.

Le vertical slice reste volontairement prudent : quand une formulation échoue à une sentinelle forte,
elle devient inéligible et n'est pas remplacée silencieusement par une reconstruction du modèle. Un
fallback exact peut concaténer les blocs pour le diagnostic, mais il n'est pas une formulation publique.

### 10.3 Limite assumée

Aucun contrôle déterministe simple ne prouve à lui seul l'équivalence sémantique de deux phrases
françaises. La garantie complète est obtenue par la combinaison suivante : IDs fiables, sentinelles
fortes, exposition de la preuve, création en DRAFT et revue humaine obligatoire.

## 11. Policy négative et attribution

Une preuve exacte ne suffit pas à établir un engagement. V6 sépare désormais :

- `commitmentAnchorBlockIds`, qui établit l'acte de proposition, l'objectif ou la reprise explicite ;
- `supportingBlockIds`, qui résout un référent ou documente une modalité sans porter seul
  l'attribution ;
- `attributionBasis`, qui distingue engagement, objectif, reprise explicite, tiers, historique,
  politique existante, diagnostic et attribution incertaine.

Les deux listes forment une partition ordonnée de `evidenceBlockIds`. Au moins un anchor est requis
pour `MEASURE` et `OBJECTIVE`. Les fondements `THIRD_PARTY`, `HISTORICAL`, `EXISTING_POLICY`,
`DIAGNOSIS` et `UNCLEAR` échouent fermés. Une politique existante ou une proposition tierce peut rester
dans le contexte si un autre bloc porte une reprise explicite par la candidature. Le validateur ne
déduit jamais ce rôle d'un infinitif ou d'une expression régulière : l'extracteur l'identifie à partir
de la voix et de la structure, puis les contrôles déterministes vérifient uniquement les IDs et les
invariants de partition.

Les gardes suivantes restent nécessaires, mais elles évaluent le bundle et son contexte :

- classe non action ;
- historique ou mesure existante décrite ;
- proposition de tiers ou attribution insuffisante ;
- témoignage, exemple étranger ou diagnostic ;
- provenance bloquée ;
- preuve insuffisante pour résoudre un référent ;
- formulation substantiellement non démontrée.

`MISSING_REFERENT` et `DEPENDENT_FRAGMENT` ne s'appliquent plus automatiquement à chaque bloc. Ils
deviennent des diagnostics de `INSUFFICIENT_EVIDENCE` quand le premier bloc sélectionné dépend d'un
antécédent absent du bundle. Si le bloc précédent établit explicitement le référent, l'anaphore n'est
plus un motif de rejet.

Le document type reste opposable :

- `CANDIDATE_PROGRAM_2027` et `CANDIDATE_PROPOSALS_2027` peuvent produire des mesures personnelles ;
- une `PARTY_PLATFORM_CURRENT` ne devient jamais une proposition personnelle par simple proximité ;
- historique, discours rapporté et tiers ne deviennent attribuables que si un anchor distinct porte
  une reprise explicite de la candidature.

La confiance est une information de tri pour le relecteur, pas une preuve. Le vertical slice n'ajoute
aucun nouveau seuil de validation globale.

## 12. Déduplication

La déduplication traite successivement le même ensemble de preuve, le même ensemble d'anchors, puis la
même formulation normalisée. Ces trois égalités déterministes peuvent fusionner les sorties de fenêtres
chevauchantes. Un fort chevauchement lexical combiné à une preuve fortement chevauchante ne fusionne
rien : la sortie reste visible avec `POSSIBLE_DUPLICATE` pour la revue.

## 13. Reporting et provenance

Chaque proposition du rapport V6 expose au minimum :

- `ProgramEdition.id`, son type et son libellé ;
- URL et date du document ;
- version d'extracteur et version de policy ;
- classification du modèle ;
- formulation proposée ;
- confiance et thème ;
- liste ordonnée des IDs ;
- anchors d'engagement, contexte de soutien et fondement d'attribution ;
- page, type, provenance et texte exact de chaque bloc ;
- relation de bundle dérivée ;
- résultat de validation du bundle ;
- résultat de validation de la formulation ;
- gardes de policy et décision technique ;
- rappel que la décision signifie seulement « éligible à une revue humaine ».

Exemple conceptuel :

```text
Formulation:
Créer une Haute Autorité à la probité chargée de publier ses recommandations.

Evidence:
- p. 41 / p41-b03: "Créer une Haute Autorité à la probité."
- p. 41 / p41-b04: "Cette autorité sera chargée de..."
- p. 42 / p42-b01: "Elle publiera..."

Document:
<URL et ProgramEdition>

Classification:
MEASURE

Decision:
eligible for human review
```

## 14. Evidence Persistence Contract et décision DB

Aucune migration Prisma n'est réalisée par le shadow mode. Le schéma actuel conserve déjà :

- `Measure.programEditionId` ;
- `MeasureRevision.text` ;
- méthode, confiance et version d'extracteur ;
- `MeasureSource.url` ;
- `MeasureSource.page`, qui peut porter une page ou une plage de pages ;
- nature et niveau de la source.

Ces champs permettent de rouvrir une source. Ils ne conservent ni le texte exact du bundle, ni l'ordre
des morceaux, ni leur provenance, ni le hash des octets acquis. Un rapport sous `.tmp` n'est pas une
preuve durable. Reparser demain ne démontre pas non plus la preuve historique : une correction PDF ou
une nouvelle segmentation peut changer les blocs et leur texte. Le schéma actuel ne suffit donc pas
pour autoriser V6 à créer un DRAFT.

Le shadow mode matérialise un `EvidenceSnapshot` de cette forme :

```ts
type EvidenceSnapshot = {
  schemaVersion: "evidence-snapshot/v2";
  programEditionId: string;
  documentUrl: string;
  documentHash: string;
  pages: number[];
  relation: "LOCAL" | "HEADING_SCOPE";
  blocks: Array<{
    blockId: string;
    page: number | null;
    order: number;
    kind: "HEADING" | "CONTENT";
    role: "COMMITMENT_ANCHOR" | "SUPPORTING_CONTEXT";
    rawExactText: string;
    canonicalText: string;
    rawTextHash: string;
    canonicalTextHash: string;
    provenanceStatus: DocumentProvenanceStatus;
    provenanceReason: DocumentProvenanceReason | null;
  }>;
  commitmentAnchorBlockIds: string[];
  supportingBlockIds: string[];
  attributionBasis: AttributionBasis;
  canonicalEvidenceHash: string;
  parserVersion: string;
  extractorVersion: string;
};
```

Les IDs servent à l'adressage du run. La preuve historique repose sur le texte brut extrait, sa forme
canonique limitée au retrait de caractères de contrôle PDF techniques, les pages, les hashes, l'URL,
le hash documentaire, les rôles d'engagement et les versions. Le snapshot ne doit jamais être
recalculé après la création de la révision. Le schéma Zod v2 est testé en sérialisation et
désérialisation.

### Extension minimale proposée, non migrée dans cette vague

Ajouter `evidenceSnapshot Json?` à `MeasureRevision`.

- Cardinalité : zéro ou un snapshot par révision. Une révision manuelle peut ne pas en avoir.
- Sémantique : preuve exacte utilisée pour formuler cette révision, immuable après création.
- Validation : schéma Zod versionné avant écriture et avant affichage.
- Suppression : le snapshot suit la révision et disparaît avec elle par la cascade existante. Il reste
  présent si `Measure.programEditionId` devient nul, car il duplique volontairement l'identifiant,
  l'URL et les empreintes historiques.
- Versioning : `schemaVersion` permet une lecture rétrocompatible. Une nouvelle extraction crée une
  nouvelle révision et un nouveau snapshot, elle ne réécrit jamais l'ancien.
- Migration : une colonne JSONB nullable, sans backfill. Les anciennes révisions restent à `null`.
- Interface admin : afficher les blocs ordonnés, pages, provenance et hashes à côté de la formulation.
  Une future garde de transition devra refuser la revue ou la publication d'une révision V6 sans
  snapshot valide.

Un modèle relationnel par bloc n'est pas nécessaire à ce stade : le bundle est borné à quatre blocs,
ne nécessite pas de requête analytique par fragment et doit rester un objet historique atomique.

Décision de cette vague : `PERSISTENCE_EXTENSION_REQUIRED`. Le futur `--apply` V6 reste interdit tant
que cette persistance et son affichage de revue ne sont pas implémentés et testés.

## 15. Matrice des règles V5

| Règle actuelle                                                   | Invariant éditorial                              | Garde de sécurité utile                    | Contrainte technique provisoire | Décision V6                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------- |
| Même traitement pour tous les partis                             | Neutralité                                       | Oui                                        | Non                             | Conserver strictement                                                       |
| Source officielle et `sourceTier` explicite                      | Sourçage                                         | Oui                                        | Non                             | Conserver strictement                                                       |
| `ProgramEdition` candidature distincte d'une plateforme de parti | Neutralité, sourçage, précision                  | Oui                                        | Non                             | Conserver strictement                                                       |
| Création uniquement en DRAFT, revue avant publication            | Sourçage, précision                              | Oui                                        | Non                             | Conserver strictement                                                       |
| Diagnostic de provenance PDF par page                            | Sourçage                                         | Oui                                        | Non                             | Réutiliser sur chaque bloc                                                  |
| Bloc suspect ou corrompu exclu avant extraction                  | Sourçage, précision                              | Oui                                        | Non                             | Conserver strictement                                                       |
| Segment déterministe et adressable                               | Sourçage                                         | Oui                                        | Partiellement                   | Généraliser en `DocumentBlock` ordonné                                      |
| Un `sourceText` unique par proposition                           | Aucun                                            | Partiellement, car il limitait l'invention | Oui                             | Remplacer par `evidenceBlockIds`                                            |
| Retrouver lexicalement `sourceText` dans un segment              | Sourçage                                         | Oui dans V5                                | Oui                             | Remplacer par la résolution stricte des IDs                                 |
| Citation autonome à elle seule                                   | Aucun                                            | Elle évitait certains faux positifs        | Oui                             | Remplacer par la suffisance du bundle                                       |
| `MISSING_REFERENT` sur une citation isolée                       | Précision, seulement si le référent reste absent | Oui                                        | Oui                             | Évaluer le premier bloc et l'ensemble du bundle                             |
| `DEPENDENT_FRAGMENT` sur une citation isolée                     | Clarté, seulement si le fragment reste dépendant | Oui                                        | Oui                             | Migrer vers `INSUFFICIENT_EVIDENCE`                                         |
| Heading uniquement en `context-only`                             | Sourçage                                         | Oui dans V5                                | Oui                             | Faire du titre documentaire un bloc sourçable                               |
| Fusion des segments voisins de même page sous 7 000 caractères   | Aucun                                            | Limite le prompt                           | Oui                             | Remplacer par des fenêtres qui préservent les IDs                           |
| Proximité sur une même page pendant le chunking                  | Sourçage                                         | Oui                                        | Oui                             | Formaliser une localité multi-bloc testable, avec une page de transition    |
| `normalizedText` obligatoire pour être accepté                   | Clarté                                           | Oui avant création DB                      | Partiellement                   | Le rapport garde la preuve sans formulation, le DRAFT exige une formulation |
| Fallback automatique vers la citation exacte                     | Précision                                        | Oui                                        | Oui                             | Garder seulement comme diagnostic, pas comme formulation reconstruite       |
| Aucun token de contenu nouveau                                   | Précision                                        | Oui comme garde provisoire                 | Oui                             | Remplacer par sentinelles sensibles et revue exposant la preuve             |
| Aucun nombre, montant, date, durée ou seuil nouveau              | Précision                                        | Oui                                        | Non                             | Conserver sur l'ensemble du bundle                                          |
| Aucun nom propre ou organisme nouveau                            | Précision, sourçage                              | Oui                                        | Non                             | Conserver sur l'ensemble du bundle                                          |
| Thème limité à l'enum                                            | Clarté, cohérence                                | Oui                                        | Non                             | Conserver, sans perdre les propositions sœurs                               |
| Confiance minimale à 0,75                                        | Aucun invariant à elle seule                     | Aide au tri                                | Oui                             | Ne pas en faire une preuve ou un nouveau gate V6                            |
| Seules `MEASURE` et `OBJECTIVE` entrent                          | Précision, clarté                                | Oui                                        | Non                             | Conserver                                                                   |
| Historique bloqué                                                | Précision, attribution                           | Oui                                        | Non                             | Conserver au niveau du bundle                                               |
| Tiers et attribution insuffisante bloqués                        | Neutralité, sourçage, précision                  | Oui                                        | Non                             | Conserver au niveau du bundle                                               |
| Similarité Jaccard à 0,72                                        | Aucun                                            | Aide contre les doublons                   | Oui                             | Garder comme signal de revue, pas comme vérité éditoriale                   |
| URL et page persistées dans `MeasureSource`                      | Sourçage                                         | Oui                                        | Non                             | Conserver, utiliser une plage de pages si nécessaire                        |

## 16. Alternatives rejetées

### Ajouter des cas à MISSING_REFERENT

Cette stratégie optimise une approximation erronée. Elle peut rejeter une anaphore parfaitement
démontrée par le paragraphe précédent, tout en laissant passer un référent implicite que la regex ne
connaît pas. Elle accumule des exceptions linguistiques propres au corpus au lieu de représenter la
structure du document.

### Créer un blind-v4 immédiatement

Un nouveau holdout mesurerait encore l'architecture V5 ou une V6 instable. Les jeux existants sont des
corpus de développement et de régression. La validation indépendante attend la stabilisation du contrat
de preuve.

### Autoriser des bundles distants avec une justification libre du modèle

Une justification textuelle n'est pas une relation documentaire vérifiable. Elle permettrait au modèle
de fabriquer une mesure en rapprochant des pages sans lien. V6 commence par une localité stricte et
explicable.

### Utiliser un second LLM comme juge

Un second modèle ne rend pas les IDs plus vrais et déplace la responsabilité éditoriale. Les garanties
essentielles sont déterministes, puis humaines. Aucun second appel n'est justifié dans ce slice.

### Migrer Prisma dans le shadow mode

Le besoin de persistance est démontré, mais une migration dans cette vague mélangerait validation du
pipeline et ouverture du chemin DRAFT. Le shadow conserve des snapshots complets dans ses rapports pour
valider le contrat. La migration et la garde de transition feront l'objet d'une décision séparée.

## 17. Vertical slice

Le slice doit couvrir, à partir des corpus déjà consommés :

1. une mesure autonome à un bloc ;
2. une mesure dont le référent est dans le bloc précédent ;
3. un objectif établi par plusieurs blocs ;
4. un diagnostic voisin d'une mesure ;
5. une proposition de tiers ;
6. une référence historique ;
7. une page corrompue ;
8. un titre suivi de détails ;
9. un nombre présent dans un seul bloc du bundle et le même nombre absent refusé ;
10. un ID inventé.

Le slice est validé si les preuves exactes viennent uniquement de l'index de blocs, si la vraie mesure
multi-bloc devient représentable et si les gardes d'attribution, d'historique, de contenu sensible et de
provenance restent fermées.

## 18. Réinterprétation des benchmarks consommés

Gold, precision, ancien holdout 45, blind-v1, blind-v2 et blind-v3 ne sont plus indépendants. Ils peuvent
recevoir une annotation structurelle complémentaire : IDs de preuve attendus, formulation acceptable et
décision inchangée.

Exemples blind-v3 :

- `blind-v3-27` ne doit plus être jugé sur « cet espace public » seul. Le bloc précédent établit la
  transformation de la plateforme du Pass Culture. Le bundle décide si l'engagement complet est sourcé ;
  le jugement politique de la citation isolée reste inchangé.
- `blind-v3-50` ne doit plus être rejeté uniquement parce que « lui » dépend de « cette autorité ». Le
  bundle incluant le bloc qui nomme l'autorité peut démontrer la mesure sans inventer le référent.
- `blind-v3-56` reste insuffisant si le bundle ne contient pas le registre ou dispositif dont le champ
  est étendu. Il peut devenir représentable si ce bloc voisin est inclus, sans changer l'attribution.
- `blind-v3-1`, `blind-v3-12` et `blind-v3-13` illustrent une autre faiblesse V5 : le modèle avait trouvé
  une action réelle mais sa copie de `sourceText` échouait au grounding lexical. En V6, les IDs valides
  récupèrent le texte exact du parser et suppriment cette panne de provenance.

La représentation de la preuve change. Les décisions humaines ne sont pas réécrites pour améliorer un
score.

## 19. Sécurité de production

Pour cette vague :

- `--apply` : NO ;
- écritures DB : NO ;
- `draftsCreated` : 0 ;
- publication : NO ;
- migration : NO ;
- seed production : NO ;
- cutover : NO ;
- production modifiée : NO.

## 20. Shadow commitment anchors du 17 août 2026

Le run unique sur les trois cahiers Ruffin a terminé 149 fenêtres sans interruption : 3 documents sur
3, 568 blocs, 299 sorties uniques, 273 bundles valides et 113 propositions techniquement éligibles à
la revue. Six sorties modèle mal formées ont été isolées au niveau de la proposition. Aucun retry,
aucune erreur, aucun DRAFT et aucune écriture DB n'ont été produits.

La revue déterministe de 50 propositions donne : 39 `SUPPORTED_CLEAR`, 1
`SUPPORTED_BUT_WORDING_NEEDS_REVIEW`, 6 `INSUFFICIENT_COMMITMENT`, 0 `INSUFFICIENT_EVIDENCE`,
3 `ATTRIBUTION_PROBLEM` et 1 `UNSUPPORTED_CONTENT`.

La séparation anchor/contexte rend la décision nettement plus explicable, mais elle ne suffit pas
encore à stabiliser la sémantique. L'extracteur a notamment marqué comme anchors plusieurs diagnostics,
deux paroles de témoins et une citation du préambule de 1946 sans acte d'endossement candidat. Le
cutover reste donc interdit.

Le parser v2 bloque Travail page 21 sous `AMBIGUOUS_COLUMN_BOUNDARY` : deux lignes franchissent la
frontière de colonnes sans gouttière démontrable. Cette règle dépend de la géométrie du texte et non du
numéro de page. Les caractères de contrôle C0 techniques sont retirés de la forme canonique; le
snapshot v2 peut conserver le brut et vérifie les empreintes à la désérialisation.

La décision de persistance reste `PERSISTENCE_EXTENSION_REQUIRED`. Aucun champ existant ne conserve
durablement le texte exact historique, ses rôles d'engagement, son ordre, ses empreintes et les versions
du parser et de l'extracteur. La proposition minimale reste `MeasureRevision.evidenceSnapshot Json?`,
sans migration dans cette vague.

## 21. Révision discourse layer du 17 août 2026

Cette section remplace, pour l'architecture courante, le rejet du second appel LLM décrit plus haut.
Le nouvel appel n'est pas un juge libre qui relit des mesures. Il remplit une fonction séparée : il
qualifie des unités documentaires déterministes sans produire de mesure, de formulation, de thème ni de
texte source. Le pipeline est désormais :

```text
Document
-> parser déterministe
-> DocumentUnit
-> analyse du discours et de l'attribution
-> extraction des engagements admissibles
-> EvidenceBundle
-> validations déterministes
-> PreparedMeasureCandidate
```

### Granularité

`DocumentBlock` était trop grossier. Les témoignages de Travail et un passage de Probité page 22
mélangent, dans un même bloc ou une même séquence de blocs, introduction narrative, citation de tiers,
diagnostic et texte du document. Le parser produit donc des `DocumentUnit` adressables, ordonnées et
liées à leur bloc. La segmentation repose sur les lignes, phrases, headings, listes, labels et citations
délimitées. Le modèle ne crée jamais leur texte.

Chaque unité porte aussi des nombres typés `STRUCTURAL` ou `CONTENT`. `Proposition 2` ne peut ainsi pas
soutenir une durée de `2 heures`, contrairement à un nombre de contenu réellement présent dans l'unité.

### Contrat du discourse layer

Une `DiscourseAnnotation` associe à chaque unité existante :

- un speaker parmi `DOCUMENT_AUTHOR`, `QUOTED_THIRD_PARTY`,
  `LEGAL_OR_INSTITUTIONAL_SOURCE`, `HISTORICAL_ACTOR` et `UNRESOLVED` ;
- un rôle parmi `COMMITMENT`, `OBJECTIVE`, `EXPLICIT_ENDORSEMENT`, `DIAGNOSIS`,
  `EXISTING_POLICY`, `TESTIMONY`, `LEGAL_REFERENCE`, `HISTORICAL_REFERENCE`, `EXAMPLE`,
  `VALUE`, `GENERAL_INTENT`, `DETAIL` et `OTHER` ;
- une confiance et une justification courte.

Une annotation absente, dupliquée, inventée ou mal formée devient `UNRESOLVED + OTHER`. La voix
`DOCUMENT_AUTHOR` ne dépend pas de la présence de « nous » ou « je » : un heading d'action ou un
infinitif programmatique peut correctement relever du document auteur.

Le cache local a pour clé SHA-256 le hash du document, `parserVersion`,
`discourseExtractorVersion`, les IDs, les kinds et les hashes de texte des unités. Les clés du shadow
Ruffin sont :

- Travail : `10b9249748b32081941f867b757719b3eaa23e1738c9fe1b67adf570c0bace62` ;
- Probité : `f43a47a0d5b269e0aaa07d3551997b20aad08517496987f1139ddbac787a2547` ;
- Loisirs : `206b1f2fa7b6af7d8e509d1569b7e037c02493dbdbb350e34ef3d5c40ececbdb`.

### Matrices de développement

L'échantillon de 18 cas consommés couvre les dix erreurs de la revue précédente et huit contrôles
positifs ou adversariaux.

Speaker humain contre speaker modèle :

| Speaker humain                | DOCUMENT_AUTHOR | QUOTED_THIRD_PARTY | LEGAL_OR_INSTITUTIONAL_SOURCE |
| ----------------------------- | --------------- | ------------------ | ----------------------------- |
| DOCUMENT_AUTHOR               | 15              | 0                  | 0                             |
| QUOTED_THIRD_PARTY            | 0               | 2                  | 0                             |
| LEGAL_OR_INSTITUTIONAL_SOURCE | 0               | 0                  | 1                             |

Rôle humain contre rôle modèle, seules les cellules non nulles sont affichées :

| Rôle humain          | Rôle modèle          | Nombre |
| -------------------- | -------------------- | ------ |
| TESTIMONY            | TESTIMONY            | 2      |
| GENERAL_INTENT       | VALUE                | 1      |
| DIAGNOSIS            | DIAGNOSIS            | 4      |
| EXISTING_POLICY      | EXISTING_POLICY      | 1      |
| EXISTING_POLICY      | EXAMPLE              | 1      |
| LEGAL_REFERENCE      | LEGAL_REFERENCE      | 1      |
| COMMITMENT           | COMMITMENT           | 4      |
| COMMITMENT           | OBJECTIVE            | 1      |
| OBJECTIVE            | OBJECTIVE            | 2      |
| EXPLICIT_ENDORSEMENT | EXPLICIT_ENDORSEMENT | 1      |

Le speaker est correct dans 18 cas sur 18. Le rôle exact est correct dans 15 cas sur 18. Les trois
confusions restent dans la même classe d'admissibilité d'anchor. Les dix anciennes erreurs sont toutes
classées dans la bonne classe d'admissibilité : les deux témoignages, les diagnostics sur les cabinets
de conseil et les investissements étrangers, la pratique existante et le préambule de 1946 ne peuvent
plus devenir des anchors.

### Politique déterministe des anchors

Pour `MEASURE` et `OBJECTIVE`, chaque `commitmentAnchorId` doit résoudre une unité dont le speaker est
`DOCUMENT_AUTHOR` et le rôle appartient à `COMMITMENT`, `OBJECTIVE` ou `EXPLICIT_ENDORSEMENT`. Toute
autre combinaison produit `INVALID_COMMITMENT_ANCHOR_ROLE`. Cette validation s'exécute après le second
appel et ne peut pas être contournée par sa formulation. Les unités de diagnostic, détail, témoignage
ou contexte restent utilisables comme supporting evidence.

Une formulation vide s'arrête sur son invalidité de formulation et ne produit plus
`POSSIBLE_DUPLICATE` par similarité lexicale vide.

### EvidenceSnapshotV3

Le snapshot local v3 conserve : le document et son hash, les unités exactes avec provenance, ordre,
kind, texte, hash et nombres typés, toutes les annotations de discours avec confiance et justification,
les `commitmentAnchorIds`, les `supportingIds`, `attributionBasis`, `parserVersion`,
`discourseExtractorVersion`, `measureExtractorVersion`, `schemaVersion` et le hash canonique du
bundle. Il enregistre donc ce qui a été lu et pourquoi une unité a été traitée comme voix du document et
engagement.

### Shadow Ruffin

Un seul shadow complet a été exécuté, sans V5 et sans `--apply`. Les trois documents ont terminé. Le run
compte 568 blocs, 1 558 unités dont 1 457 fiables et 101 bloquées. Le discourse layer a effectué 37
appels lors de ce premier passage, sans cache hit :

- speakers : 906 `DOCUMENT_AUTHOR`, 226 `QUOTED_THIRD_PARTY`, 40
  `LEGAL_OR_INSTITUTIONAL_SOURCE`, 15 `HISTORICAL_ACTOR`, 270 `UNRESOLVED` ;
- rôles : 206 `COMMITMENT`, 91 `OBJECTIVE`, 5 `EXPLICIT_ENDORSEMENT`, 276 `DIAGNOSIS`,
  13 `EXISTING_POLICY`, 167 `TESTIMONY`, 36 `LEGAL_REFERENCE`, 18 `HISTORICAL_REFERENCE`,
  162 `EXAMPLE`, 94 `VALUE`, 28 `GENERAL_INTENT`, 40 `DETAIL`, 321 `OTHER`.

L'extraction donne 590 sorties, 414 propositions uniques, 351 bundles valides, 63 invalides, 200
`MEASURE`, 70 `OBJECTIVE` et 156 propositions éligibles. Elle refuse 163 sorties par policy et 32 par
formulation. Neuf anchors ont été arrêtés par `INVALID_COMMITMENT_ANCHOR_ROLE`.

Deux fenêtres ont renvoyé une racine JSON tableau au lieu de l'objet attendu. Elles ont été isolées en
fail-closed, sans interruption de document et sans retry. Elles constituent une dette de robustesse de
sortie, pas une preuve sémantique acceptée.

### Revue humaine

La sélection déterministe a été figée avant lecture détaillée par SHA-256 de la date du run et de l'ID,
avec quotas 17, 17 et 16 par édition. Sur 50 sorties :

- `SUPPORTED_CLEAR` : 44 ;
- `SUPPORTED_BUT_WORDING_NEEDS_REVIEW` : 1 ;
- `INSUFFICIENT_COMMITMENT` : 2 ;
- `INSUFFICIENT_EVIDENCE` : 2 ;
- `ATTRIBUTION_PROBLEM` : 0 ;
- `UNSUPPORTED_CONTENT` : 1.

Le minimum de stabilisation est atteint avec 45 sur 50 exploitables ou presque. L'échantillon ne
contient aucun témoignage attribué au candidat, aucune citation juridique seule transformée en
engagement, aucune politique existante seule transformée en engagement, aucun diagnostic seul
transformé en action et aucun contenu quantitatif inventé.

Les cinq autres cas signalent des limites visibles et fermées par la revue : deux engagements trop
faibles, deux bundles qui omettent un référent ou une introduction utile, et une formulation ajoutant
un « cadre légal » absent des unités sélectionnées. Aucune nouvelle règle spécifique au corpus n'a été
ajoutée après cette revue.

### Dette parser et persistance

Travail page 21 reste `TEXT_LAYER_SUSPECT / AMBIGUOUS_COLUMN_BOUNDARY` et fail-closed. Aucun correctif
géométrique simple et généralisable n'a été démontré, cette page reste donc une dette parser non
bloquante.

La décision reste `PERSISTENCE_EXTENSION_REQUIRED`. `EvidenceSnapshotV3` est stabilisé localement,
mais aucune modification Prisma, migration, écriture DB, création de DRAFT, publication ou transition
de production ne fait partie de cette vague.
