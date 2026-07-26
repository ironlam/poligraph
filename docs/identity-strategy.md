# Strategie de resolution d'identite - Poligraph

## Le probleme

Poligraph agrege des donnees de 10+ sources institutionnelles francaises pour construire des profils complets de politiciens : Assemblee nationale, Senat, RNE (35 000 maires), HATVP, Wikidata, Judilibre, Wikipedia, presse, fact-checks.

Chaque source utilise ses propres identifiants. L'Assemblee nationale a des codes "PA", le Senat a des slugs, le RNE n'a pas d'identifiant par personne, seulement le nom, la date de naissance et le code commune.

Le defi : **comment savoir que deux enregistrements de sources differentes designent la meme personne ?**

Les homonymes rendent la question non triviale. La France compte plusieurs "Thierry Cousin", plusieurs "Jean-Pierre Martin", plusieurs "Marie Dupont" parmi ses elus. Un matching naif par nom conduit a des erreurs de reconciliation, avec des consequences potentiellement graves quand il s'agit d'affaires judiciaires ou de votes parlementaires.

## Architecture

L'Identity Resolution Engine v2 de Poligraph utilise un **pipeline de signaux** avec un **combineur probabiliste Fellegi-Sunter**.

```
                        ┌──────────────────────────────┐
  ResolveInput ────────►│     Signal Pipeline (7)       │
  (nom, date,           │                               │
   departement,         │  birthdate    ── logLR ──┐    │
   genre, ...)          │  department   ── logLR ──┤    │
                        │  first-name   ── logLR ──┤    │
                        │  gender       ── logLR ──┼──► Fellegi-Sunter
  CachedPolitician ────►│  name-freq    ── logLR ──┤    Combiner
  (candidat en base)    │  temporal     ── logLR ──┤    │
                        │  party-ctx    ── logLR ──┘    │
                        │                               │
                        │  ┌─────────────────────────┐  │
                        │  │ Judgement:               │  │
                        │  │  SAME (logLR >= 12.0)    │  │
                        │  │  UNDECIDED (4.0 - 12.0)  │  │
                        │  │  NOT_SAME (< 4.0)        │  │
                        │  └─────────────────────────┘  │
                        └──────────────────────────────┘
```

### Le pipeline en 7 etapes

Avant d'evaluer les signaux, le resolver applique une cascade deterministe :

1. **Decisions anterieures** : si une decision SAME ou NOT_SAME existe deja, elle est respectee.
2. **Matching deterministe** : un identifiant externe partage (code PA, Q-ID Wikidata) donne un match certain (confiance 1.0).

Ensuite, pour chaque candidat, les **7 signaux** sont evalues. Chaque signal produit un **log-likelihood ratio** (logLR), positif si l'evidence soutient un match, negatif si elle le contredit.

3. **Birthdate** : date de naissance exacte (+6.0 logLR), decalage d'un jour (+4.0), mismatch (-6.0)
4. **Department** : mandat dans le meme departement (+3.0)
5. **First name** : comparaison phonetique et fuzzy du prenom
6. **Gender** : correspondance du genre (+1.0), mismatch (-6.0, penalite dure)
7. **Name frequency** : poids inversement proportionnel a la frequence du nom de famille. "Martin" (commun) produit un signal faible, "Melenchon" (rare) un signal fort.
8. **Temporal** : chevauchement de mandats actifs (+2.5), gap recent (+0.5), gap ancien (-0.5)
9. **Party context** : mention du meme parti dans le texte source (+2.0)

### Le combineur Fellegi-Sunter

Le combineur somme les logLR de tous les signaux puis convertit en confiance via une sigmoide : `confidence = 1 / (1 + 2^(-compositeLogLR))`.

Les seuils de decision sont bases sur le logLR composite :

- **SAME** : logLR >= 12.0 (confiance >= 99.97%)
- **UNDECIDED** : logLR entre 4.0 et 12.0 (file d'attente de revue humaine)
- **NOT_SAME** : logLR < 4.0

Le combineur supporte aussi des **penalites dures** : certains signaux (ex. mismatch de genre) peuvent plafonner le jugement a UNDECIDED ou NOT_SAME, independamment du score global.

### Ponderation par frequence de nom

C'est l'innovation cle du moteur v2. Au lieu de traiter tous les noms de famille de facon egale, le signal `name-frequency` utilise la distribution reelle des noms dans la base (36 000+ politiciens) :

- **Nom rare** (ex. "Melenchon", frequence ~0.001%) : `logLR = log2(1/0.00001) = 16.6`, un match de nom rare constitue une evidence forte
- **Nom commun** (ex. "Martin", frequence ~0.8%) : `logLR = log2(1/0.008) = 6.9`, un match de nom commun constitue une evidence plus faible

Le matching supporte aussi le **fuzzy matching** : si le score Jaro-Winkler entre les noms est >= 0.92 (ex. "Lefebvre"/"Lefevbre"), un logLR reduit de 20% est attribue.

### Comparateurs de noms

Le moteur utilise plusieurs algorithmes de comparaison de chaines, adaptes aux noms francais :

- **Jaro-Winkler** : bonus pour les prefixes communs, ideal pour les variantes typographiques
- **Damerau-Levenshtein** : distance d'edition avec transpositions (erreurs OCR courantes)
- **Monge-Elkan** : alignement multi-tokens, gere les noms composes ("Jean-Pierre Dupont" vs "Dupont Jean Pierre")
- **Encodeur phonetique francais** : voyelles nasales, ambiguite b/v, consonnes finales muettes (regle CaReFuL), digraphes

### Adaptateur francais

Le resolver est concu pour etre extensible a d'autres pays via un systeme d'**adaptateurs**. L'adaptateur francais (`FrenchAdapter`) fournit :

- **Normalisation** : suppression des accents, particules ("de", "le"), tirets
- **Encodage phonetique** : regles specifiques au francais (nasales, consonnes finales muettes)
- **Variantes** : noms a trait d'union, noms de mariage, noms de bulletin electoral
- **Cles de blocage** : premiere lettre du nom normalise pour le filtrage rapide

## Le poligraphId

Chaque politicien dans Poligraph recoit un identifiant public stable : le **poligraphId**.

Format : `PG-XXXXXX` (ex. `PG-000542`)

Cet identifiant est :

- **Stable** : il ne change jamais, meme si le nom, le slug ou les donnees changent
- **Sequentiel** : attribue par ordre de creation dans la base
- **Public** : utilisable dans les URLs, les APIs et les exports de donnees
- **Unique** : un seul poligraphId par personne physique

Le poligraphId est le point d'ancrage pour toutes les references externes. Il apparait dans l'API de reconciliation W3C et sera a terme ajoute comme identifiant externe sur Wikidata.

## Carte des sources de donnees

| Source              | Identifiant   | Confiance | Methode              | Donnees principales                   |
| ------------------- | ------------- | --------- | -------------------- | ------------------------------------- |
| Assemblee nationale | Code PA       | 1.0       | ID institutionnel    | Mandats, votes, commissions           |
| Senat               | Slug senat    | 1.0       | ID institutionnel    | Mandats, votes, questions             |
| Parlement europeen  | ID MEP        | 1.0       | ID institutionnel    | Mandats europeens                     |
| HATVP               | Reference     | 0.9       | ID institutionnel    | Declarations patrimoine/interets      |
| Wikidata            | Q-ID          | 0.95      | Pivot Wikidata       | Donnees biographiques, liens externes |
| Gouvernement        | Slug gouv     | 0.9       | ID institutionnel    | Portefeuilles ministeriels            |
| NosDeputes          | Slug ND       | 0.85      | ID institutionnel    | Statistiques parlementaires           |
| RNE                 | Code INSEE    | 0.7       | Nom + date naissance | Maires (35 000+)                      |
| Wikipedia           | Titre article | 0.7       | Nom seul             | Biographies                           |
| Judilibre           | N. decision   | s.o.      | Aucune               | Decisions rattachees par reference    |
| Presse              | URL article   | Variable  | Mentions textuelles  | Couverture mediatique                 |

## Benchmark

Le moteur est valide contre un corpus de **217 paires de politiciens francais reels**, couvrant 9 categories de difficulte :

| Categorie           | Description                                  |
| ------------------- | -------------------------------------------- |
| exact-match         | Noms et dates identiques                     |
| birthdate-disambig  | Homonymes differencies par date de naissance |
| common-surnames     | Noms tres courants (Martin, Dupont, Bernard) |
| phonetic-variants   | Variantes phonetiques (Lefebvre/Lefevbre)    |
| fuzzy-typos         | Erreurs typographiques et OCR                |
| political-dynasties | Familles politiques (Le Pen, Debre, Dumas)   |
| compound-names      | Noms composes et particules                  |
| marriage-names      | Noms de naissance vs. noms de mariage        |
| true-negatives      | Paires qui ne doivent PAS matcher            |

Resultats (mars 2026) :

| Combineur      | Precision | Rappel | F1    |
| -------------- | --------- | ------ | ----- |
| Legacy         | 100%      | 36.8%  | 53.8% |
| Fellegi-Sunter | 100%      | 76.8%  | 86.9% |

Le combineur Fellegi-Sunter double le rappel par rapport au legacy tout en maintenant 100% de precision (zero faux positifs).

## Contribuer

### Signaler une erreur de matching

Si vous identifiez un politicien dont les donnees semblent melangees avec un homonyme :

1. Ouvrez une issue sur [GitHub](https://github.com/ironlam/poligraph/issues)
2. Indiquez le poligraphId ou le slug du politicien concerne
3. Precisez quelle donnee semble incorrecte et de quelle source elle provient

L'equipe creera une decision `NOT_SAME` pour bloquer le matching errone de facon permanente.

### Proposer une nouvelle source de donnees

Les sources doivent :

- Etre publiques et librement accessibles
- Concerner des personnalites politiques francaises
- Fournir au minimum un nom complet et un identifiant ou contexte de desambiguation

### Le Wikibot

Le Poligraph Wikibot est un bot Wikidata qui synchronise bidirectionnellement les donnees entre Poligraph et Wikidata. Il utilise les Q-IDs Wikidata comme pivot principal pour le matching cross-source.

## API de reconciliation

Poligraph expose une API compatible avec la [specification W3C Reconciliation Service API v0.2](https://www.w3.org/community/reports/reconciliation/CG-FINAL-specs-0.2-20230410/).

**Endpoint :** `GET /api/reconcile`

### Manifeste du service

```
GET /api/reconcile
```

Retourne les metadonnees du service (nom, types supportes, espace d'identifiants).

### Requete de reconciliation

```
GET /api/reconcile?queries={"q0":{"query":"Marine Le Pen"}}
```

Ou en POST :

```json
POST /api/reconcile
{
  "queries": {
    "q0": {
      "query": "Marine Le Pen",
      "properties": [
        { "pid": "birthDate", "v": "1968-08-05" },
        { "pid": "department", "v": "62" }
      ]
    }
  }
}
```

### Proprietes supportees

| Propriete    | Description                  | Effet sur le score                       |
| ------------ | ---------------------------- | ---------------------------------------- |
| `birthDate`  | Date de naissance (ISO 8601) | logLR +6.0 si match, -6.0 si mismatch    |
| `department` | Code departement             | logLR +3.0 si mandat dans ce departement |

### Integration OpenRefine

L'API est compatible avec [OpenRefine](https://openrefine.org/) pour la reconciliation de jeux de donnees. Ajoutez l'URL du service dans OpenRefine > Reconcile > Add Standard Service.
