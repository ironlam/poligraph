# Croisement de données et matching

> **Dernière mise à jour** : 2026-03-08

Comment Poligraph réconcilie les données de 14+ sources pour construire une fiche unique par politicien. Ce document décrit les identifiants, les stratégies de matching et les bonnes pratiques pour ajouter une nouvelle source.

---

## Table des matières

- [Principe général](#1-principe-général)
- [Carte des identifiants](#2-carte-des-identifiants)
- [Stratégies de matching](#3-stratégies-de-matching)
- [Identity Resolution Engine](#4-identity-resolution-engine)
- [Croisement Wikidata](#5-croisement-wikidata)
- [Cas concrets](#6-cas-concrets)
- [Ajouter une nouvelle source](#7-ajouter-une-nouvelle-source)
- [Pièges connus](#8-pièges-connus)
- [Rattachement scrutin ↔ débat](#9-rattachement-scrutin--débat)

---

## 1. Principe général

Chaque politicien possède un `id` interne (CUID), un `poligraphId` public (`PG-XXXXXX`) et zéro ou plusieurs `ExternalId` qui le relient aux sources externes :

```
Politician (id: cuid, poligraphId: PG-000542)
  ├── ExternalId(ASSEMBLEE_NATIONALE, "PA841729")
  ├── ExternalId(SENAT, "21077")
  ├── ExternalId(WIKIDATA, "Q3052772")
  ├── ExternalId(HATVP, "macronaaaemmanuel5835")
  ├── ExternalId(PARLEMENT_EUROPEEN, "97236")
  ├── ExternalId(NOSDEPUTES, "jean-luc-melenchon")
  └── ExternalId(RNE, "...")
```

Le modèle `ExternalId` a une contrainte unique sur `(source, externalId)`. Un politicien peut avoir plusieurs IDs de la même source (ex : mandat député + mandat sénateur).

**Workflow d'import standard** : `batchResolve()` centralise tout le matching. Il consulte les décisions antérieures, puis les identifiants externes, puis les critères biographiques. Voir [section 4](#4-identity-resolution-engine).

---

## 2. Carte des identifiants

### Identifiants par source

| Source              | Champ source     | Format              | Exemple                 | ExternalId.source     | Wikidata P-ID |
| ------------------- | ---------------- | ------------------- | ----------------------- | --------------------- | ------------- |
| Assemblée nationale | ID CSV           | `PA` + chiffres     | `PA841729`              | `ASSEMBLEE_NATIONALE` | P4123         |
| Sénat               | matricule        | chiffres + lettre   | `21077M`                | `SENAT`               | P4324         |
| HATVP               | classement (CSV) | `nomaaaprenom12345` | `macronaaaemmanuel5835` | `HATVP`               | P4703         |
| Parlement européen  | identifier (API) | chiffres            | `97236`                 | `PARLEMENT_EUROPEEN`  | -             |
| Wikidata            | Q-ID             | `Q` + chiffres      | `Q3052772`              | `WIKIDATA`            | -             |
| NosDéputés          | slug             | prénom-nom          | `jean-luc-melenchon`    | `NOSDEPUTES`          | P7384         |
| RNE                 | -                | -                   | -                       | `RNE`                 | -             |

### URLs de résolution

Chaque identifiant permet de construire l'URL vers la fiche d'origine :

| Source              | Pattern URL                                                     |
| ------------------- | --------------------------------------------------------------- |
| Assemblée nationale | `https://www.assemblee-nationale.fr/dyn/deputes/{id}`           |
| Sénat               | `https://www.senat.fr/senateur/{matricule}.html`                |
| HATVP               | `https://www.hatvp.fr/fiche-nominative/?declarant={classement}` |
| Parlement européen  | `https://www.europarl.europa.eu/meps/fr/{id}`                   |
| Wikidata            | `https://www.wikidata.org/wiki/{qid}`                           |
| NosDéputés          | `https://www.nosdeputes.fr/{slug}`                              |

---

## 3. Stratégies de matching

### Stratégie 1 : Matching par identifiant externe (fiable)

Quand la source fournit un identifiant connu (AN, Sénat), on cherche directement dans `ExternalId` :

```
Source → id_origine → ExternalId.findFirst({ source, externalId }) → politicianId
```

**Utilisé par** : HATVP (via `id_origine` pour députés/sénateurs), votes AN/Sénat, législation.

**Fiabilité** : 100%, un ID est un ID.

### Stratégie 2 : Matching par nom (fallback)

Quand il n'y a pas d'identifiant, on matche par nom (prénom + nom, case-insensitive) :

```
Source → (prénom, nom) → Politician.findFirst({ firstName, lastName, mode: insensitive }) → id
```

**Utilisé par** : HATVP (pour gouvernement, président, communes), presse, fact-checks.

**Fiabilité** : ~95%, risque d'homonymes.

**Améliorations** :

- Normalisation des accents (`Éléonore` vs `Eleonore`)
- Particules (`Le Pen` vs `LE PEN`)
- Thésaurus de prénoms (`src/lib/french-names.ts`) : `Jean-Luc` ↔ `Jean Luc`

### Stratégie 3 : Matching par nom + date de naissance (anti-homonymes)

Pour les sources à risque d'homonymes (Wikidata, RNE), on croise nom + date de naissance :

```
Source → (nom, dateNaissance) → Politician.findFirst({
  lastName: nom,
  birthDate: { gte: date - 5j, lte: date + 5j }
})
```

**Utilisé par** : Wikidata IDs, RNE maires.

**Fiabilité** : ~99.9%, quasi impossible d'avoir deux homonymes nés le même jour.

### Stratégie 4 : Matching par nom + département (géographique)

Pour les élus locaux, le département réduit les homonymes :

```
Source → (nom, département) → Politician + Mandate.findFirst({
  lastName: nom,
  mandates: { departmentCode: dept }
})
```

**Utilisé par** : Candidatures municipales, RNE.

**Fiabilité** : ~98%.

---

## 4. Identity Resolution Engine

Depuis mars 2026, tout le matching cross-source est centralisé dans `batchResolve()` (`src/lib/identity/`).

### Pipeline en 7 étapes

1. **Décisions antérieures** : consulte `IdentityDecision` pour les matchs déjà validés (SAME) ou invalidés (NOT_SAME)
2. **Matching déterministe** : identifiant externe partagé = confiance 1.0
3. **Date de naissance** : nom + date de naissance = confiance 0.9
4. **Département** : nom + mandat dans le même département = confiance 0.7
5. **Nom seul** : confiance 0.5 (insuffisante pour un match auto)
6. **Seuils** : >= 0.95 auto-lié, 0.70-0.94 file d'attente humaine, < 0.70 rejeté
7. **Journalisation** : chaque décision enregistrée dans `IdentityDecision`

### Blocklist de mentions

Pour la presse et les fact-checks, `findMentions()` utilise du matching textuel (regex). Les décisions NOT_SAME servent de blocklist pour éviter les faux positifs récurrents sur les noms courants (Philippe, Laurent, etc.).

### Usage

```typescript
import { batchResolve } from "@/lib/identity";
const results = await batchResolve(candidates, { source: DataSource.RNE });
```

**Règle** : seul `Judgement.SAME` (>= 0.95) doit être auto-lié. `UNDECIDED` (0.70-0.94) nécessite une revue manuelle via l'admin.

---

## 5. Croisement Wikidata

Wikidata est le **hub de croisement** central. Chaque politicien avec un Q-ID peut être relié à toutes les autres sources via les propriétés Wikidata :

```
Wikidata Q3052772 (Emmanuel Macron)
  ├── P4123 → ID Assemblée nationale
  ├── P4324 → ID Sénat
  ├── P4703 → ID HATVP (classement)
  ├── P7384 → Slug NosDéputés
  ├── P569  → Date de naissance (vérification)
  ├── P18   → Photo Wikimedia Commons
  ├── P39   → Positions occupées (carrière)
  ├── P102  → Parti politique
  └── P1399 → Condamnations
```

### Configuration centralisée

Toutes les propriétés Wikidata sont dans `src/config/wikidata.ts` (`WD_PROPS`). Ne jamais utiliser un P-ID en dur dans le code, toujours passer par cette config.

### Matching Wikidata → Politicien

Le script `sync:wikidata-ids` :

1. Cherche par nom sur l'API REST Wikidata (`wbsearchentities`)
2. Récupère les claims du candidat (`wbgetclaims`)
3. Vérifie la date de naissance (P569) à +-5 jours
4. Stocke le Q-ID comme `ExternalId(WIKIDATA, qid)`

---

## 6. Cas concrets

### HATVP : trois niveaux de matching

Le sync HATVP illustre la cascade complète :

1. **Députés** : `id_origine` (ex : `841729`) → cherche `ExternalId(ASSEMBLEE_NATIONALE, "PA841729")`
2. **Sénateurs** : `id_origine` (ex : `21077M`) → cherche `ExternalId(SENAT, "21077")`
3. **Gouvernement/Président/Communes** : `id_origine` vide → fallback nom

Le champ `classement` est ensuite stocké comme `ExternalId(HATVP, classement)`, permettant le croisement avec Wikidata P4703.

### Types de mandats HATVP importés

| `type_mandat` CSV | Importé | Raison                                           |
| ----------------- | ------- | ------------------------------------------------ |
| `depute`          | Oui     | Nos politiciens                                  |
| `senateur`        | Oui     | Nos politiciens                                  |
| `gouvernement`    | Oui     | Nos politiciens                                  |
| `europe`          | Oui     | Eurodéputés                                      |
| `president`       | Oui     | Président(s)                                     |
| `commune`         | Oui     | Maires (matching par nom)                        |
| `departement`     | Non     | Pas encore de conseillers départementaux en base |
| `region`          | Non     | Pas encore de conseillers régionaux en base      |
| `epci`            | Non     | Intercommunalités                                |
| `ctsp`            | Non     | Collectivités à statut particulier               |
| `autre`           | Non     | Divers                                           |

### Presse : matching prudent

La presse utilise le matching par nom dans le titre/description de l'article. Pour éviter les faux positifs :

- Noms courts (< 4 lettres) : match mot entier uniquement
- Thésaurus de prénoms pour les variantes
- Blocklist via décisions NOT_SAME pour les noms courants (voir section 4)

---

## 7. Ajouter une nouvelle source

Checklist pour intégrer une nouvelle source de données :

### 1. Identifier les identifiants disponibles

- La source fournit-elle un ID unique par personne ?
- Cet ID existe-t-il sur Wikidata (propriété P-xxx) ?
- Si oui, ajouter le P-ID dans `src/config/wikidata.ts` (`WD_PROPS`)

### 2. Choisir la stratégie de matching

| Situation                                       | Stratégie                                                    |
| ----------------------------------------------- | ------------------------------------------------------------ |
| La source a un ID qu'on a déjà (ex : ID AN)     | Matching par ExternalId existant                             |
| La source a un nouvel ID croisable via Wikidata | Matching par Q-ID → P-xxx                                    |
| La source n'a pas d'ID                          | Matching par nom (+ date de naissance si risque d'homonymes) |

**Recommandé** : utiliser `batchResolve()` pour tout import de données politiques.

### 3. Stocker l'ExternalId

Si la source a un identifiant unique :

1. Ajouter la source dans l'enum `DataSource` (`prisma/schema.prisma`)
2. `prisma db push` pour appliquer
3. Dans le sync, appeler `db.externalId.upsert()` après le matching

### 4. Documenter

- Ajouter la source dans `docs/DATASOURCES.md`
- Ajouter les identifiants dans ce document (section 2)
- Mettre à jour `src/config/wikidata.ts` si pertinent

---

## 8. Pièges connus

### Accents et normalisation

Les noms dans les sources officielles varient : `Éléonore` vs `Eleonore` vs `ELEONORE`. Le matching case-insensitive de Prisma (`mode: "insensitive"`) gère la casse mais **pas les accents manquants**.

**Solution** : le thésaurus de prénoms (`src/lib/french-names.ts`) inclut les variantes avec/sans accents.

### Homonymes

Risque réel pour les noms courants (Martin, Durand). Le matching par nom seul ne suffit pas.

**Solution** : croiser avec la date de naissance (+-5 jours) ou le département. Utiliser `batchResolve()` qui gère la cascade automatiquement.

### Noms courants = faux positifs textuels

Les politiciens avec des noms = prénoms courants (Philippe, Laurent, Jacques) ou mots communs (Placé, Bataille, Mesure) génèrent des faux positifs massifs dans le matching presse/factchecks.

**Solution** : blocklist via décisions NOT_SAME dans `IdentityDecision`, chargée au démarrage du sync via `loadMentionBlocklist()`.

### IDs qui changent

Certaines sources changent les IDs entre législatures (ex : ID AN `PA*` change d'une législature à l'autre).

**Solution** : stocker l'ID + la source, accepter plusieurs ExternalIds par politicien pour la même source.

### Double création

Si le matching échoue (nom mal normalisé, accent différent), le sync peut créer un doublon.

**Solution** : ne jamais créer de politicien dans un sync d'enrichissement (HATVP, RNE, presse). Seuls les syncs institutionnels (AN, Sénat, Gouvernement) créent.

### Champs vides dans le CSV HATVP

Le champ `id_origine` est vide pour certains types de mandats (gouvernement, président, commune). C'est normal, le fallback par nom prend le relais.

---

## 9. Rattachement scrutin, amendement et débat

La génération des arguments utilise une chaîne déterministe avant tout appel au
modèle : séance officielle du scrutin, texte examiné, discussion structurée, puis
paragraphes citables. Une coïncidence de date et de numéro ne suffit jamais.

### Sources et périmètre

- Comptes rendus XML Syceron de l'Assemblée nationale, archivés par législature.
- `Scrutin.officialSeanceRef` vient du `seanceRef` du scrutin officiel, sans
  déduction à partir d'une date. Cela couvre un vote après minuit dans une séance
  commencée la veille.
- `Amendment.texteRef` identifie le texte et sa lecture. Son numéro `B...` doit
  correspondre au texte examiné déclaré dans le compte rendu (`bibard`, sinon
  numéro du point principal). Pour `I-` et `II-`, la partie budgétaire doit aussi
  être explicitement reconnue. Une métadonnée absente entraîne une abstention.
- La génération porte sur les votes clés de la 17e législature, liés à un
  amendement principal ou à un sous-amendement AN. Le parent d'un sous-amendement
  reste un contexte, jamais la mesure votée. Aucun nouveau traitement des débats
  de commission, des autres types de vote ou du Sénat n'est ajouté ici.

### Ingestion et identité des sources

`debate-transcript-parse.ts` conserve le texte complet et les paragraphes ordonnés :
identifiant Syceron, orateur, référence acteur, rôle, article, amendements et
sous-amendements. Le sommaire des métadonnées est exclu par son emplacement.
**Ne pas filtrer les paragraphes du corps sur `sommaire="1"`** : cet attribut
marque aussi les annonces prononcées et des avis réels de la commission et du
Gouvernement. Une fixture officielle du 7 novembre 2024 couvre ce cas.

Chaque `DebateTranscript` conserve une empreinte SHA-256 du XML et une version du
parseur. L'import utilise `If-None-Match`, puis l'empreinte de l'archive lorsque le
serveur ne fournit pas d'ETag exploitable. Les fichiers modifiés ou les versions
anciennes du parseur sont retraités. Les XML inchangés ne réécrivent pas la base. La version 3 du parseur normalise
aussi les numéros `bibard` comme `(n[[o]] 930)` en `930`, avec refus des formes
ambiguës.
Une source actualisée invalide ses analyses traçables dans la même transaction.
Les anciens liens arbitraires `DebateTranscript.scrutinId` sont retirés lors de
ce retraitement ; la relation est désormais calculée depuis la référence officielle.

Les nouvelles séances sont importées sur une fenêtre de 90 jours ; les séances
historiques déjà présentes sont actualisées, sans promettre un backfill de toute
la législature. Le téléchargement est borné à 128 Mio, 120 secondes par requête et
3 redirections sur le domaine officiel. Une archive vide ou une erreur de
traitement n'avance pas le curseur HTTP ; Inngest signale l'échec de cette étape.

### Discussions communes et amendements identiques

`debate-discussion.ts` reconnaît les annonces explicites de discussion commune,
d'amendements identiques et de soutien. Une discussion conserve les interventions
jusqu'aux décisions sur ses membres ou à une frontière explicite avec une autre
discussion ou un autre texte. Elle n'est pas coupée à la première mention d'un
amendement voisin. Une suspension dans le même texte peut rester dans le même épisode, tandis que
les reprises distinctes ne sont pas fusionnées automatiquement. Une fin
indéterminée, des épisodes concurrents (même si l’un est trop long ou inachevé), des identifiants
dupliqués ou un passage trop long entraînent une abstention.

| Portée    | Utilisation                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------- |
| `target`  | Intervention rattachée à l'amendement cible.                                                   |
| `shared`  | Argument portant explicitement sur les amendements du groupe, par exemple « ces amendements ». |
| `other`   | Intervention rattachée à un amendement voisin, jamais transférée à la cible.                   |
| `context` | Portée individuelle indéterminée dans une discussion commune, non citable.                     |

Seules les interventions `target` et `shared` sont transmises au modèle. Le texte
officiel de la mesure est fourni séparément. Le modèle doit identifier ses
paragraphes sources et en citer des passages exacts ; une citation inventée, un
identifiant inconnu ou une portée contradictoire interdit l'enregistrement. Les
arguments communs reçoivent aussi une qualification visible ajoutée par le code.
Le même sélecteur protège `context` pour les consommateurs en texte brut, dont
les impacts citoyens : les paragraphes voisins et de portée incertaine y sont
également absents. Les arguments communs gardent une étiquette explicite. Le prompt
d'impact n'ampute plus le passage à 8 000 caractères : il conserve le passage
complet sous le plafond commun, ou omet entièrement la section en cas de dépassement.

Un côté peut rester vide : l'interface indique alors qu'aucun argument de ce côté
n'a été identifié dans le passage. Les positions de groupe ne sont pas fournies
à cette génération et ne servent pas à inférer des motivations.

La validation des citations et le contrôle lexical du sujet réduisent les erreurs,
mais ne constituent pas une preuve automatique de fidélité sémantique. Les
interventions sans portée certaine restent exclues. Le corpus de régression couvre
la discussion réelle des amendements 2697 et 3652 sur le PLF 2025 ; il ne représente
pas une mesure de qualité de toute la législature.

### Coûts, provenance et publication

Un passage est limité à 24 000 caractères, sans troncature des derniers orateurs.
Le sujet officiel est limité à 12 000 caractères au total et 8 000 par bloc ; un
dépassement entraîne une abstention plutôt qu'une coupe du dispositif. Il n'y a
qu'un appel Mistral par tentative, sans second modèle de rattachement ou de résumé.

Chaque lancement scanne au plus `min(1000, max(100, limit * 20))` votes et effectue
au plus `limit` appels modèle. Un curseur persistant `(votingDate, id)` fait avancer
les lots au-delà des refus ; à la fin du corpus, il revient au début pour réessayer
les données complétées. Les exécutions ciblées, forcées et `dryRun` ne déplacent pas
ce curseur. Un cache local au lancement garde au plus quatre séances structurées ;
aucun cache global ne conserve les comptes rendus.

`ScrutinAnalysis.evidence` conserve le passage, les citations, l'empreinte source,
le prompt exact et son empreinte, ainsi que la version de méthode. Ce contenu ne
traverse pas la frontière client. `sourceUrl` et `commonDiscussion`, seuls champs
supplémentaires lus pour la page, donnent accès au compte rendu et à l'indication
de discussion commune. Les anciennes analyses AN sans source traçable sont retenues
à la lecture et éligibles à une régénération contrôlée ; aucun texte ancien n'est
présumé vérifié par la seule présence d'une ligne en base.

### Diagnostics

`findAmendmentMention`, `classifyDebateMatch` et
`classifyDebateMatchBySeance` restent des diagnostics sur mentions textuelles. Ils
ne sont pas une autorisation de génération. Seul le résolveur structuré peut
retourner `usableForGeneration=true`. Les audits signalent `matched` seulement
lorsque cette chaîne complète réussit.

```bash
node --import tsx --env-file=.env scripts/audit-scrutin-debate-mapping.ts
node --import tsx --env-file=.env scripts/audit-debate-context.ts
```

Le script historique `audit-debate-ingestion.ts` compare les mentions textuelles
avec le corpus XML complet. Ses classes « après » restent des diagnostics de
couverture et ne mesurent pas l'éligibilité à la génération structurée.
