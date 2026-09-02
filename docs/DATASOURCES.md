# Sources de données

> **Dernière mise à jour** : 2026-03-08

Ce document décrit les sources de données utilisées par Poligraph, leur format, les rate limits à respecter, les prérequis pour chaque script et l'ordre d'exécution recommandé.

---

## Table des matières

- [Vue d'ensemble](#1-vue-densemble)
- [Assemblée nationale](#2-assemblée-nationale)
- [Sénat](#3-sénat)
- [Gouvernement](#4-gouvernement)
- [Président de la République](#5-président-de-la-république)
- [Parlement européen](#6-parlement-européen)
- [HATVP](#7-hatvp)
- [Wikidata](#8-wikidata)
- [Votes Assemblée nationale](#9-votes-assemblée-nationale)
- [Votes Sénat](#10-votes-sénat)
- [Dossiers législatifs](#11-dossiers-législatifs)
- [Presse (RSS)](#12-presse-rss)
- [Google Fact Check](#13-google-fact-check)
- [RNE (Répertoire National des Élus)](#14-rne-répertoire-national-des-élus)
- [Judilibre (Cour de cassation)](#15-judilibre-cour-de-cassation)
- [Candidatures municipales](#16-candidatures-municipales)
- [Photos](#17-photos)
- [Analyse presse (IA)](#18-analyse-presse-ia)
- [Enrichissement IA](#19-enrichissement-ia)
- [Ordre d'exécution](#20-ordre-dexécution)
- [Variables d'environnement](#21-variables-denvironnement)
- [Rate limits](#22-rate-limits)
- [Troubleshooting](#23-troubleshooting)
- [Crédits](#24-crédits)

---

## 1. Vue d'ensemble

| #   | Source                   | Type d'accès     | Auth      | Données principales          | Script                               | Fréquence    |
| --- | ------------------------ | ---------------- | --------- | ---------------------------- | ------------------------------------ | ------------ |
| 2   | Assemblée nationale      | CSV (data.gouv)  | Aucune    | Députés, groupes             | `sync:assemblee`                     | Hebdomadaire |
| 3   | Sénat                    | API JSON         | Aucune    | Sénateurs, groupes           | `sync:senat`                         | Hebdomadaire |
| 4   | Gouvernement             | CSV (data.gouv)  | Aucune    | Ministres, fonctions         | `sync:gouvernement`                  | Remaniement  |
| 5   | Président                | Statique         | Aucune    | Président en exercice        | `sync:president`                     | Manuelle     |
| 6   | Parlement européen       | API JSON-LD      | Aucune    | Eurodéputés français         | `sync:europarl`                      | Hebdomadaire |
| 7   | HATVP                    | CSV opendata     | Aucune    | Déclarations patrimoine      | `sync:hatvp`                         | Mensuelle    |
| 8   | Wikidata                 | REST + SPARQL    | Aucune    | IDs, condamnations, décès    | `sync:wikidata-ids`                  | Hebdomadaire |
| 9   | Votes AN                 | ZIP JSON         | Aucune    | Scrutins, votes individuels  | `sync:scrutins-an`                   | Quotidienne  |
| 10  | Votes Sénat              | HTML + JSON      | Aucune    | Scrutins, votes individuels  | `sync:scrutins-senat`                | Quotidienne  |
| 11  | Dossiers législatifs     | ZIP JSON         | Aucune    | Projets/propositions de loi  | `sync:legislation`                   | Quotidienne  |
| 12  | Presse (RSS)             | RSS/XML          | Aucune    | Articles, mentions           | `sync:press`                         | Quotidienne  |
| 13  | Google Fact Check        | API REST         | API key   | Fact-checks, verdicts        | `sync:factchecks`                    | Quotidienne  |
| 14  | RNE                      | CSV (data.gouv)  | Aucune    | Maires                       | `sync:rne:maires`                    | Ponctuelle   |
| 15  | Judilibre                | API REST (PISTE) | OAuth 2.0 | Décisions justice            | Enrichissement ciblé, depuis l'admin | À la demande |
| 16  | Candidatures             | CSV (data.gouv)  | Aucune    | Candidats municipales        | `sync:elections:municipales`         | Ponctuelle   |
| 17  | Photos                   | HTTP HEAD        | Aucune    | Photos politiciens           | `sync:photos`                        | Hebdomadaire |
| 18  | Analyse presse           | Analyse auto.    | API key   | Détection affaires           | `sync:press-analysis`                | Quotidienne  |
| 19  | Tracker promesses        | Réutilisation DB | API key   | Promesses politiques         | `promises-extract-sample`            | À la demande |
| 20  | Compte Rendu Intégral AN | XML public       | Aucune    | Interventions parlementaires | `promises-cri-demo`                  | Q1 2027      |

---

## 2. Assemblée nationale

- **URL de base** : `https://www.data.gouv.fr/api/1/datasets/deputes-actifs-de-lassemblee-nationale-informations-et-statistiques/`
- **Type d'accès** : API REST (découverte URL) + téléchargement CSV bulk
- **Authentification** : Aucune (données ouvertes)
- **Rate limit** : 200 ms (`DATA_GOUV_RATE_LIMIT_MS`), politesse
- **Licence** : Licence Ouverte / Open Licence (Etalab)

### Données importées

- Politiciens : nom, prénom, civilité, date/lieu de naissance
- Mandats : type `DEPUTE`, circonscription, code département, date de début
- Groupes parlementaires : mappés vers les partis réels via `src/config/parliamentaryGroups.ts` (voir section "Groupes parlementaires vs Partis" ci-dessous)
- IDs externes : `ASSEMBLEE_NATIONALE` (PA...) + `NOSDEPUTES` (slug)
- Photos : depuis NosDéputés (`https://www.nosdeputes.fr/depute/photo/{slug}/120`)

### Script

```bash
npm run sync:assemblee          # Sync complète
npm run sync:assemblee --stats  # Statistiques uniquement
npm run sync:assemblee --dry-run
```

### Fonctionnement

Le script interroge l'API data.gouv.fr pour obtenir l'URL du dernier CSV, puis le télécharge et parse les députés actifs. Les groupes parlementaires sont créés/mis à jour dans la table `ParliamentaryGroup` et mappés vers les partis politiques réels via `src/config/parliamentaryGroups.ts` (ASSEMBLY_GROUPS) et `src/config/parties.ts` (ASSEMBLY_GROUP_PARTY_MAPPING).

---

## 3. Sénat

- **URL de base** : `https://www.senat.fr/api-senat/senateurs.json`
- **URL enrichissement** : `https://archive.nossenateurs.fr/senateurs/json`
- **Type d'accès** : API REST JSON (2 endpoints publics)
- **Authentification** : Aucune
- **Rate limit** : 200 ms (`SENAT_RATE_LIMIT_MS`), politesse
- **Licence** : Licence Ouverte (Sénat) / CC-BY-SA (NosSénateurs)

### Données importées

- Politiciens : matricule, nom, prénom, civilité, date de naissance (via NosSénateurs)
- Mandats : type `SENATEUR`, circonscription, code département
- Groupes parlementaires : mappés vers les partis réels via `src/config/parliamentaryGroups.ts` (SENATE_GROUPS)
- IDs externes : `SENAT` (matricule) + `NOSDEPUTES` (slug NosSénateurs)
- Photos : `https://www.senat.fr/senimg/{matricule}.jpg`
- Fermeture automatique des mandats des sénateurs absents de l'API

### Remappage des codes de groupes sénatoriaux

L'API du Sénat utilise des codes historiques qui ne correspondent pas aux codes officiels actuels du site senat.fr. Le fichier `src/config/parliamentaryGroups.ts` contient un remappage automatique :

| Code API | Code actuel | Groupe                                                      |
| -------- | ----------- | ----------------------------------------------------------- |
| UMP      | LR          | Les Républicains                                            |
| SOC      | SER         | Socialiste, Écologiste et Républicain                       |
| CRC      | CRCE-K      | Communiste, Républicain, Citoyen et Écologiste - Kanaky     |
| LREM     | RDPI        | Rassemblement des démocrates, progressistes et indépendants |
| RTLI     | LIRT        | Les Indépendants - République et Territoires                |

Les codes UC, RDSE, GEST et NI sont identiques entre l'API et le site officiel.

### Script

```bash
npm run sync:senat          # Sync complète
npm run sync:senat --stats  # Statistiques
npm run sync:senat --dry-run
```

### Sources de données complémentaires

- **Open data** : `https://data.senat.fr/les-senateurs/` (CSV, JSON, XLS)
- **Historique des groupes** : `https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.json`
- **Export complet** : `https://data.senat.fr/data/senateurs/export_sens.zip` (PostgreSQL)

Les codes de groupes dans ces fichiers sont les mêmes que ceux de l'API (codes historiques).

---

## 4. Gouvernement

- **URL de base** : `https://static.data.gouv.fr/resources/historique-des-gouvernements-de-la-veme-republique/`
- **Type d'accès** : Téléchargement CSV (séparateur point-virgule)
- **Authentification** : Aucune
- **Rate limit** : 200 ms (`DATA_GOUV_RATE_LIMIT_MS`)
- **Licence** : Licence Ouverte (Etalab)

### Données importées

- Politiciens : nom, prénom
- Mandats : `PREMIER_MINISTRE`, `MINISTRE`, `MINISTRE_DELEGUE`, `SECRETAIRE_ETAT`
- Dates de début/fin, gouvernement associé
- Corrections manuelles depuis `data/government-corrections.json`

### Mapping des fonctions

| Fonction CSV               | Type mandat            |
| -------------------------- | ---------------------- |
| Président de la République | `PRESIDENT_REPUBLIQUE` |
| Premier ministre           | `PREMIER_MINISTRE`     |
| Ministre                   | `MINISTRE`             |
| Ministre délégué           | `MINISTRE_DELEGUE`     |
| Secrétaire d'État          | `SECRETAIRE_ETAT`      |

### Script

```bash
npm run sync:gouvernement           # Gouvernement actuel
npm run sync:gouvernement -- --all  # Historique complet (Ve République)
npm run sync:gouvernement --stats
```

---

## 5. Président de la République

- **URL de base** : `https://www.elysee.fr` (référence uniquement)
- **Type d'accès** : Données statiques dans le code (pas de requête HTTP)
- **Authentification** : Aucune
- **Rate limit** : N/A

### Données importées

- Emmanuel Macron (Q3052772) : identité, date/lieu de naissance, photo officielle
- Mandat `PRESIDENT_REPUBLIQUE` depuis le 2017-05-14
- Parti : Renaissance (RE)

### Script

```bash
npm run sync:president
```

> Ce script est spécifique au président en exercice. Pour les présidents historiques, ils sont importés via `sync:gouvernement --all`.

---

## 6. Parlement européen

- **URL de base** : `https://data.europarl.europa.eu/api/v2/meps/show-current`
- **Type d'accès** : API REST JSON-LD
- **Authentification** : Aucune
- **Rate limit** : 200 ms (`EUROPARL_RATE_LIMIT_MS`)
- **Licence** : Open Data

### Données importées

- Eurodéputés français uniquement (filtre sur `country-of-representation = "FR"`)
- Politiciens : nom, prénom, date de naissance
- Mandats : type `DEPUTE_EUROPEEN`, législature 10 (2024-2029)
- Groupes européens : mappés depuis `src/config/parties.ts` (`EUROPEAN_GROUPS`)
- IDs externes : `PARLEMENT_EUROPEEN` (europarlId)
- Photos : `https://www.europarl.europa.eu/mepphoto/{id}.jpg`

### Script

```bash
npm run sync:europarl          # Sync députés européens FR
npm run sync:europarl --stats
npm run sync:mep-parties       # Sync partis nationaux des eurodéputés
```

---

## 7. HATVP

- **URL de base** : `https://www.hatvp.fr/livraison/opendata/liste.csv`
- **Type d'accès** : Téléchargement CSV (séparateur point-virgule, UTF-8)
- **Authentification** : Aucune
- **Rate limit** : 200 ms (`HATVP_RATE_LIMIT_MS`)
- **Licence** : Licence Ouverte (Etalab)

### Données importées

- Déclarations : intérêts, patrimoine début/fin/modification de mandat
- PDF officiels : `https://www.hatvp.fr/livraison/dossiers/{nom_fichier}`
- Photos : `https://www.hatvp.fr/livraison/photos_gouvernement/{nom}-{prenom}.jpg`
- Matching : par ID externe (AN `PA*` ou Sénat matricule), puis par nom

### Types de déclarations

| Code  | Type                                    |
| ----- | --------------------------------------- |
| di    | Déclaration d'intérêts                  |
| dim   | Déclaration d'intérêts modificative     |
| dsp   | Déclaration de situation patrimoniale   |
| dspm  | Déclaration de patrimoine modificative  |
| dspfm | Déclaration de patrimoine fin de mandat |

### Script

```bash
npm run sync:hatvp
```

---

## 8. Wikidata

Wikidata est utilisé comme source d'enrichissement à travers plusieurs scripts.

### 8.1 Matching des IDs (`sync:wikidata-ids`)

- **URL** : `https://www.wikidata.org/w/api.php` (action `wbsearchentities` + `wbgetclaims`)
- **Type d'accès** : API REST MediaWiki
- **Auth** : Aucune
- **Rate limit** : 200 ms (`WIKIDATA_RATE_LIMIT_MS`)
- **Données** : Associe un Q-ID Wikidata à chaque politicien (match par nom + date de naissance +-5 jours)
- **Script** : `npm run sync:wikidata-ids` (supporte `--resume` pour reprendre)

### 8.2 Condamnations et mises en cause (`discover:affairs`)

- **URL** : `https://www.wikidata.org/w/api.php` (action `wbgetclaims`)
- **Type d'accès** : API REST Wikidata
- **Auth** : Aucune
- **Rate limit** : 200 ms (`WIKIDATA_RATE_LIMIT_MS`)
- **Données** : Propriétés P1399 (condamnations) et P1595 (mises en cause)
- **Script** : `npm run discover:affairs -- --wikidata-only`
- **Complément** : le même script peut aussi scraper les sections judiciaires Wikipedia via IA (`--limit=50` par défaut)

### 8.3 Dates de décès (`sync:deceased`)

- **URL** : `https://www.wikidata.org/w/api.php` (action `wbgetclaims`, propriété P570)
- **Rate limit** : 200 ms
- **Données** : Date de décès des politiciens avec un Q-ID
- **Script** : `npm run sync:deceased`

### 8.4 Carrières (`sync:careers`)

- **URL** : `https://query.wikidata.org/sparql`
- **Données** : Propriétés P39 (position occupée), P488 (dirigeant de parti), P112 (fondateur)
- **Script** : `npm run sync:careers` (long ~10-20 min)

### 8.5 Partis (`sync:partis`)

- **URL** : `https://www.wikidata.org/w/api.php`
- **Données** : Noms, abréviations, couleurs, logos, idéologies des partis
- **Configuration** : Q-IDs des partis dans `src/config/wikidata.ts`
- **Script** : `npm run sync:partis`

### 8.5.1 Groupes parlementaires vs Partis

**Ce sont deux entités distinctes**, stockées dans deux tables Prisma séparées :

| Concept                  | Modèle Prisma        | Exemple                                        | Crée par                       |
| ------------------------ | -------------------- | ---------------------------------------------- | ------------------------------ |
| **Parti politique**      | `Party`              | PS, LFI, RN, EELV, LR                          | `sync:partis`                  |
| **Groupe parlementaire** | `ParliamentaryGroup` | SOC (AN), SER (Sénat), ECOS (AN), GEST (Sénat) | `sync:assemblee`, `sync:senat` |

- Un **parti** est une organisation politique nationale (ex: Parti Socialiste)
- Un **groupe parlementaire** est une formation interne à une chambre (AN ou Sénat)
- Un groupe peut contenir des membres de plusieurs partis (ex: LIOT, UC, RDSE)
- Un parti peut avoir des membres dans différents groupes selon la chambre (PS -> SOC à l'AN, SER au Sénat)

**Lien entre les deux** : `ParliamentaryGroup.defaultPartyId` pointe vers le parti dominant du groupe (null si transpartisan). Ce lien est défini dans les configs :

- `src/config/parliamentaryGroups.ts` : `ASSEMBLY_GROUPS` et `SENATE_GROUPS` (code, couleur, position politique, `partyWikidataId`)
- `src/config/parties.ts` : `ASSEMBLY_GROUP_PARTY_MAPPING` et `SENATE_GROUP_PARTY_MAPPING` (mapping groupe -> parti pour le sync)

**Règle : ne jamais créer de `Party` pour un groupe parlementaire.** Les groupes vivent dans `ParliamentaryGroup` uniquement.

**Pages** :

- Partis : `/partis/[slug]`
- Groupes : `/parlement/groupes` (listing AN + Sénat) et `/parlement/groupes/[slug]` (détail avec membres et votes)

**Slugs des groupes** : `{code}-an-{legislature}` pour l'AN (ex: `rn-an-17`), `{code}-senat` pour le Sénat (ex: `ser-senat`). Générés automatiquement par les syncs.

### 8.6 Dates de naissance (`sync:birthdates`)

- **URL** : `https://www.wikidata.org/w/api.php` (propriété P569)
- **Données** : Dates de naissance manquantes
- **Script** : `npm run sync:birthdates`

### Licence

CC0 (domaine public)

---

## 9. Votes Assemblée nationale

- **URL de base** : `https://data.assemblee-nationale.fr/static/openData/repository/{leg}/loi/scrutins/Scrutins.json.zip`
- **Type d'accès** : Téléchargement ZIP (fichiers JSON individuels par scrutin)
- **Authentification** : Aucune
- **Rate limit** : N/A (téléchargement unique)
- **Licence** : Licence Ouverte

### Données importées

- Scrutins : titre, date, résultat (adopté/rejeté), décompte pour/contre/abstention
- Votes individuels par député (POUR, CONTRE, ABSTENTION, NON_VOTANT)
- Matching des députés via ID externe `ASSEMBLEE_NATIONALE` (acteurRef `PA*`)
- Incrémental : utilise ETag + hash du contenu pour éviter les re-téléchargements

### Script

```bash
npm run sync:scrutins-an          # Tous les scrutins (législature 17)
npm run sync:scrutins-an:today    # Scrutins du jour uniquement
npm run sync:scrutins-an --stats
```

---

## 10. Votes Sénat

- **URL de base** : `https://www.senat.fr/scrutin-public/`
- **Type d'accès** : Scraping HTML (liste + métadonnées) + API JSON (votes individuels)
- **Authentification** : Aucune
- **Rate limit** : 200 ms (`SENAT_RATE_LIMIT_MS`)

### Endpoints

| Endpoint                                                                        | Usage                    |
| ------------------------------------------------------------------------------- | ------------------------ |
| `https://www.senat.fr/scrutin-public/scr{session}.html`                         | Page index d'une session |
| `https://www.senat.fr/{session}/scr{session}-{number}.html`                     | Page HTML d'un scrutin   |
| `https://www.senat.fr/scrutin-public/{session}/json/scr{session}-{number}.json` | Votes JSON individuels   |

### Données importées

- Scrutins : titre, date, résultat, décompte
- Votes individuels par sénateur (match via matricule)
- Sessions disponibles : 2006-2024
- Incrémental : curseur pour éviter les re-syncs

### Script

```bash
npm run sync:scrutins-senat          # Dernière session
npm run sync:scrutins-senat:today    # Scrutins du jour
npm run sync:scrutins-senat:all      # Toutes les sessions (2006-2024)
npm run sync:scrutins-senat --stats
```

---

## 11. Dossiers législatifs

- **URL de base** : `https://data.assemblee-nationale.fr/static/openData/repository/{leg}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip`
- **Type d'accès** : Téléchargement ZIP (JSON)
- **Authentification** : Aucune
- **Rate limit** : N/A (téléchargement unique)
- **Licence** : Licence Ouverte

### Données importées

- Dossiers législatifs : titre, numéro PJL/PPL, statut, catégorie, dates
- Statut dérivé des actes parlementaires : DEPOSE, EN_COMMISSION, EN_COURS, ADOPTE, REJETE, RETIRE, CADUQUE
- Auteurs (initiateurs) : résolus via `acteurRef` vers les fiches Politician existantes

### Exposés des motifs

Un second script télécharge le texte intégral des documents depuis l'open data de l'Assemblée nationale et en extrait la section "exposé des motifs" :

- **URL** : `https://www.assemblee-nationale.fr/dyn/opendata/{id}.html`
- **Rate limit** : 300 ms (`ASSEMBLEE_OPENDATA_RATE_LIMIT_MS`)
- **Valeur écrite dans `exposeSource`** : `an-opendata`
- Une page servie en HTTP 200 qui ne porte aucun marqueur de texte parlementaire (maintenance, WAF, page d'accueil) est ignorée : sans ce contrôle elle serait stockée comme exposé des motifs sous une source réputée officielle, puis relue comme telle par les résumés de dossier et le résolveur de substance.
- **Rotation (`exposeCheckedAt`)** : la file d'attente contient des dossiers que l'Assemblée nationale ne publiera jamais (un texte d'origine sénatoriale demandé sur l'endpoint de l'AN, ~28 % du corpus). Sans curseur de rotation, ces dossiers restent en tête de file indéfiniment et bloquent le débit utile. Le script écrit `exposeCheckedAt` à chaque tentative aboutie (200 ou 404, y compris sur un échec), sauf sur une erreur réseau transitoire qu'on veut retenter au run suivant. Le tri devient `exposeCheckedAt asc nulls first, filingDate desc` : jamais tentés en premier, puis les vérifiés il y a le plus longtemps.
- Trois pannes de lot lèvent une exception au lieu d'être consignées : hôte qui ne résout plus, lot entier en 404 sur des dossiers jamais tentés auparavant, lot entier sans texte parlementaire. Le garde 404 est scopé aux dossiers jamais vérifiés avant ce run, pour ne pas se déclencher sur un lot dominé par la rotation normale des dossiers sénatoriaux déjà connus comme absents. Les deux jobs Inngest ne regardent que si l'étape s'est terminée, donc une panne signalée en simple message aurait été enregistrée comme un sync réussi ayant importé zéro exposé.

Source précédente, retirée : `docparl.assemblee-nationale.fr` servait les mêmes documents en `.docx`. L'hôte a disparu du DNS en 2026 et chaque requête échouait avec `getaddrinfo ENOTFOUND`. Les lignes importées avant la bascule gardent `exposeSource = "docparl"`.

### Réconciliation scrutins/dossiers

Le service `reconcile-scrutin-dossier.ts` relie les scrutins aux dossiers législatifs via les `seanceRef` (réunions parlementaires). Il télécharge les deux ZIPs (scrutins + dossiers), construit une carte de correspondance, puis met à jour les clés étrangères en base.

### Script

```bash
npm run sync:legislation              # Tous les dossiers
npm run sync:legislation:today        # Dossiers actifs récemment modifiés
npm run sync:legislation:content      # Télécharger les exposés des motifs
npm run sync:legislation:content -- --limit=20
```

---

## 12. Presse (RSS)

- **Type d'accès** : Flux RSS/XML parsés avec `fast-xml-parser`
- **Authentification** : Aucune. Lecture des métadonnées publiques du flux
  (titre, lien, date), sous le User-Agent `Poligraph/1.0 (https://poligraph.fr)`.
- **Rate limit** : 1000 ms (`RSS_RATE_LIMIT_MS`)

### Sources configurées

| ID            | Nom                     | URL du flux                                                               |
| ------------- | ----------------------- | ------------------------------------------------------------------------- |
| `lemonde`     | Le Monde Politique      | `https://www.lemonde.fr/politique/rss_full.xml`                           |
| `lefigaro`    | Le Figaro Politique     | `https://www.lefigaro.fr/rss/figaro_politique.xml`                        |
| `franceinfo`  | Franceinfo Politique    | `https://www.francetvinfo.fr/politique.rss`                               |
| `liberation`  | Libération Politique    | `https://www.liberation.fr/arc/outboundfeeds/rss-all/category/politique/` |
| `politico`    | Politico.eu             | `https://www.politico.eu/feed/`                                           |
| `mediapart`   | Mediapart               | `https://www.mediapart.fr/articles/feed`                                  |
| `publicsenat` | Public Sénat            | `https://www.publicsenat.fr/rss.xml`                                      |
| `lcp`         | LCP Assemblée nationale | `https://lcp.fr/rss.xml`                                                  |

### Données importées

- Articles : titre, description, URL, image, date de publication
- Mentions de politiciens (matching nom dans titre + description)
- Mentions de partis

### Script

```bash
npm run sync:press
```

---

## 13. Google Fact Check

- **URL de base** : `https://factchecktools.googleapis.com/v1alpha1/claims:search`
- **Type d'accès** : API REST Google Cloud
- **Authentification** : **Clé API Google** (`GOOGLE_FACTCHECK_API_KEY`)
- **Rate limit** : 200 ms (`FACTCHECK_RATE_LIMIT_MS`)

### Prérequis

1. Créer un projet Google Cloud
2. Activer l'API "Fact Check Tools"
3. Générer une clé API
4. Ajouter `GOOGLE_FACTCHECK_API_KEY=...` au `.env`

### Données importées

- Fact-checks : texte de la claim, auteur, verdict, note, source, URL
- Mentions de politiciens (matching dans le texte)
- Sources : AFP Factuel, Les Décodeurs, Libération CheckNews, etc.
- Filtrage aux sources francophones uniquement (`FACTCHECK_ALLOWED_SOURCES`)

### Script

```bash
npm run sync:factchecks              # Politiciens avec mandats actifs
npm run sync:factchecks -- --all     # Tous les politiciens
npm run sync:factchecks -- --limit=50
```

---

## 14. RNE (Répertoire National des Élus)

- **URL de base** : `https://static.data.gouv.fr/resources/repertoire-national-des-elus-1/`
- **Type d'accès** : Téléchargement CSV (séparateur point-virgule, ~35 000 lignes)
- **Authentification** : Aucune
- **Rate limit** : 200 ms (`DATA_GOUV_RATE_LIMIT_MS`)
- **Licence** : Licence Ouverte (Etalab)

### Données importées

- Maires : matching avec les politiciens existants (nom + date de naissance + département)
- Mandats : type `MAIRE`, commune, code département
- **Ne crée PAS de nouveaux politiciens**, associe uniquement aux fiches existantes

### Script

```bash
npm run sync:rne:maires
```

---

## 15. Judilibre (Cour de cassation)

- **URL de base** : configurable via `JUDILIBRE_BASE_URL` (défaut : `https://api.piste.gouv.fr/cassation/judilibre/v1.0`)
- **Type d'accès** : API REST via la plateforme PISTE
- **Authentification** : **OAuth 2.0** (client credentials flow)
- **Rate limit** : 500 ms (`JUDILIBRE_RATE_LIMIT_MS`)

### Prérequis

1. Créer un compte sur [PISTE](https://developer.aife.economie.gouv.fr/)
2. S'abonner à l'API Judilibre
3. Obtenir client_id, client_secret et API key
4. Configurer les 5 variables d'environnement (voir [section 21](#21-variables-denvironnement))

### Données importées

- Décisions de la Cour de cassation
- Récupération ciblée à partir d'une **référence connue** : identifiant Judilibre, ECLI ou numéro de pourvoi
- Alimente une `CourtDecision` (juridiction, chambre, date, sens, ECLI, URL officielle)
- Déclenchement manuel depuis l'admin, jamais planifié

### Le flux, et celui qui est interdit

```text
référence judiciaire connue  →  recherche Judilibre ciblée  →  CourtDecision  →  affichage public
```

Le flux inverse est retiré du code, pas simplement désactivé :

```text
nom de personnalité  →  recherche Judilibre  →  création automatique d'Affair
```

La recherche par nom a produit **0 affaire sur 156 décisions** : le corpus de la chambre criminelle est une jurisprudence doctrinale pseudonymisée, où une personnalité publique ne peut pas être reconnue. Le pipeline a été désactivé le 2026-05-15, puis supprimé en #337. Un test d'architecture empêche sa réintroduction.

L'enrichissement n'écrit jamais sur une `Affair` : ni statut, ni publication, ni `court`, ni `verdictDate`. Un numéro de pourvoi qui rend plusieurs décisions arrête l'opération au lieu de choisir.

### Scripts

```bash
npm run judilibre:diagnostics   # lecture seule : comptes et traces de l'ancien pipeline
```

L'enrichissement se déclenche depuis la fiche admin d'une affaire, sur une décision déjà rattachée, avec confirmation explicite.

---

## 16. Candidatures municipales

- **URL de base** : `https://static.data.gouv.fr/resources/elections-municipales-2020-candidatures-au-1er-tour/`
- **Type d'accès** : Téléchargement CSV (TSV, encodage ISO-8859-1)
- **Authentification** : Aucune
- **Rate limit** : 200 ms (`DATA_GOUV_RATE_LIMIT_MS`)
- **Licence** : Licence Ouverte (Etalab)

### Données importées

- Candidatures : nom, prénom, commune, code département, nuance politique, liste
- Matching politiciens existants par nom + département
- Matching partis via mapping nuance politique (`src/config/labels.ts`)

### Script

```bash
npm run sync:elections:municipales
npm run sync:elections:municipales -- --dry-run
npm run sync:elections:municipales -- --limit=100
```

---

## 17. Photos

La synchronisation des photos interroge plusieurs sources par ordre de priorité.

### Sources par priorité

| Priorité | Source              | Pattern URL                                                               |
| -------- | ------------------- | ------------------------------------------------------------------------- |
| 10       | Assemblée nationale | `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/{id}.jpg` |
| 10       | Sénat               | `https://www.senat.fr/senimg/{matricule}.jpg`                             |
| 10       | Gouvernement        | Via HATVP                                                                 |
| 8        | HATVP               | `https://www.hatvp.fr/livraison/photos_gouvernement/{nom}-{prenom}.jpg`   |
| 6        | Wikidata            | Wikimedia Commons via propriété P18 (thumbnail MD5)                       |
| 5        | NosDéputés          | `https://www.nosdeputes.fr/depute/photo/{slug}/120`                       |
| 5        | NosSénateurs        | `https://archive.nossenateurs.fr/senateur/photo/{slug}/120`               |

### Fonctionnement

Le script effectue des requêtes HTTP HEAD pour valider chaque URL candidate, puis retient la source de plus haute priorité. Il ne downgrade jamais vers une source de priorité inférieure.

### Script

```bash
npm run sync:photos              # Photos manquantes
npm run sync:photos -- --validate  # Valider les URLs existantes + sync
```

---

## 18. Analyse presse

- **Type d'accès** : Analyse automatisée + scraping des sources en accès libre
- **Authentification** : **`ANTHROPIC_API_KEY`** (requis). Aucune vers un
  éditeur de presse ; les autres sources sont analysées sur titre +
  description RSS.
- **Rate limit** : 500 ms (`AI_RATE_LIMIT_MS`), backoff 30s sur 429

### Fonctionnement

1. Récupère les articles non analysés depuis la base
2. Scrape le contenu complet pour les sources accessibles (franceinfo, LCP, Public Sénat, Politico, Libération)
3. Analyse automatisée pour détecter d'éventuelles affaires judiciaires
4. Crée des affaires préfixées `[A VERIFIER]` (validation manuelle requise)
5. **Ne stocke PAS le contenu scrapé** (copyright), uniquement le résumé et les faits extraits
6. Intervalle minimum entre syncs : 6 heures

### Script

```bash
npm run sync:press-analysis              # Articles non analysés
npm run sync:press-analysis -- --limit=20
npm run sync:press-analysis -- --force
```

---

## 19. Enrichissement et contenus éditoriaux

### Scripts d'enrichissement

| Script                     | Fonction                                                                         |
| -------------------------- | -------------------------------------------------------------------------------- |
| `npm run classify:themes`  | Classification thématique des scrutins et dossiers (13 catégories)               |
| `npm run index:embeddings` | Indexation vectorielle pour le chatbot (Voyage AI). Env: `VOYAGE_API_KEY`        |
| `npm run discover:affairs` | Détection d'affaires judiciaires via Wikidata (P1399/P1595) + scraping Wikipedia |

### Contenus éditoriaux (admin)

Les contenus suivants sont saisis ou mis à jour via le dashboard admin :

| Contenu                         | Champs DB                            |
| ------------------------------- | ------------------------------------ |
| Biographies politiciens         | `biography`, `biographyGeneratedAt`  |
| Résumés de scrutins             | `summary`, `summaryDate`             |
| Impacts citoyens                | `citizenImpact`, `citizenImpactDate` |
| Résumés de dossiers législatifs | `summary`, `summaryDate`             |
| Descriptions de partis          | `description`                        |

### Newsletter "Alerte Vote"

- **Cron** : Inngest, tous les lundis à 7h00 UTC
- **Envoi** : Mailjet (Campaign Draft API)
- **Template** : MJML compilé en HTML
- **Données** : récap hebdomadaire (votes, affaires, presse) via `getWeeklyRecap()`

### Auto-post réseaux sociaux

- **Cron** : Inngest, 3 fois par jour (08:00, 12:30, 18:00 Paris)
- **Plateformes** : Twitter (API v2) + Bluesky (AT Protocol)
- **Contenu** : votes marquants, nouvelles affaires, faits saillants

### Tracker promesses 2027 (extraction depuis PressArticle + CRI AN)

Pipeline backend Q4 2026, exposition publique différée à Q1 2027. Extraction de promesses politiques depuis deux sources :

**Source A, PressArticle déjà ingéré (production Q4) :**

- Aucun nouveau fetch externe : on lit les `PressArticle` déjà en base via `sync:press` (section 12).
- Extraction via Claude Haiku (`src/services/promises/extractor.ts`) avec prompt strict (caractère prospectif, sujet politique précis, attribution claire).
- Tagging thématique hybride : règles mots-clés d'abord, Haiku en fallback (`src/services/promises/theme-classifier.ts`).
- Idempotence : chaque `PressArticle` porte un champ `promiseScanStatus` qui passe à `"scanned"`, `"skipped"` ou `"error"` après traitement.
- Volume estimé : 1 à 2 promesses par article qualifié, sur la moitié des articles politiques.

**Source B, Compte Rendu Intégral AN (proof-of-concept Q4, production Q1) :**

- **URL XML par séance** : `https://www.assemblee-nationale.fr/dyn/opendata/CRSANR5L{leg}S{year}O{session}N{numSeance}.xml`
- **Archive bulk** : `https://data.assemblee-nationale.fr/static/openData/repository/{leg}/vp/syceronbrut/syseron.xml.zip` (pour industrialisation Q1)
- **Authentification** : Aucune
- **Rate limit** : 200 ms (réutilise `ASSEMBLEE_DOCPARL_RATE_LIMIT_MS`)
- **Licence** : Licence Ouverte (Etalab)
- **Statut Q4** : parser XML opérationnel (`src/services/promises/cri-source.ts`) validé sur une séance réelle (668 interventions parsées). Pas encore d'industrialisation cron, pas de wiring vers `extractPromisesFromText`. Production Q1 2027.

### Scripts

```bash
# Échantillonnage et ingestion presse (Q4 production)
npx dotenv -e .env -- npx tsx scripts/promises-extract-sample.ts --limit=10 --dry-run
npx dotenv -e .env -- npx tsx scripts/promises-extract-sample.ts --limit=10

# Démonstration CRI AN (Q4 proof-of-concept)
npx dotenv -e .env -- npx tsx scripts/promises-cri-demo.ts
```

### Modération

Toutes les promesses extraites arrivent en statut `EXTRACTED` (libellé : « Extraite (non revue) ») et doivent être revues manuellement à `/admin/promises` avant publication. Une promesse passée en `PUBLISHED` est prête pour exposition publique (page comparative présidentielle 2027, Q1).

---

## 20. Ordre d'exécution

Le script `npm run sync:full` exécute toutes les étapes dans l'ordre de dépendance. Voici les 8 phases :

### Phase 1 : Sources institutionnelles

```
1. sync:assemblee          # Députés
2. sync:senat              # Sénateurs
3. sync:gouvernement       # Ministres
4. sync:president          # Président
5. sync:europarl           # Eurodéputés
```

### Phase 2 : Enrichissement Wikidata

```
6.  sync:wikidata-ids      # Associer les Q-IDs
7.  sync:partis            # Partis politiques
8.  sync:careers           # Carrières (P39, P488, P112), ~20 min
9.  populate-party-leaders # Dirigeants de partis historiques
```

### Phase 3 : Sources complémentaires

```
10. sync:hatvp             # Déclarations patrimoine
11. sync:mep-parties       # Partis des eurodéputés
12. sync:birthdates        # Dates de naissance
13. sync:deceased          # Décès
14. sync:photos            # Photos
15. sync:history           # Historique mandats
```

### Phase 4 : Votes et législation

```
16. sync:scrutins-an          # Scrutins AN, ~20 min
17. sync:scrutins-senat --all # Scrutins Sénat, ~20 min
18. sync:legislation       # Dossiers législatifs, ~15 min
19. sync:legislation:content # Exposés des motifs, ~15 min
20. reconcile-scrutin-dossier # Liaison scrutins/dossiers
```

### Phase 5 : Presse et fact-checks

```
21. sync:press             # Flux RSS
22. sync:factchecks        # Google Fact Check
```

### Phase 6 : Élections

```
23. sync:rne:maires        # Maires (RNE)
24. sync:elections:municipales # Candidatures
```

### Phase 7 : Backfills

```
25. migrate-slugs              # Générer les slugs manquants
```

### Phase 8 : IA (optionnel, `--skip-ai` pour ignorer)

```
26. classify:themes            # Classification thématique
27. index:embeddings           # Embeddings vectoriels, ~20 min
```

> Les autres contenus (biographies, résumés, impacts citoyens) sont saisis via le dashboard admin.

### Commandes orchestrateur

```bash
npm run sync:full              # Tout (~30-60 min)
npm run sync:full -- --dry-run # Preview
npm run sync:full -- --skip-ai # Sans étapes IA
npm run sync:full -- --from=16 # Reprendre depuis l'étape 16
```

### Sync quotidienne

Le script `npm run sync:daily` exécute un sous-ensemble incrémentiel (3x/jour via GitHub Actions) :

```bash
npm run sync:daily              # Votes du jour + législation active + presse + IA
npm run sync:daily -- --dry-run
```

---

## 21. Variables d'environnement

### Requises (toute utilisation)

| Variable       | Description                                 |
| -------------- | ------------------------------------------- |
| `DATABASE_URL` | URL PostgreSQL (Supabase connection pooler) |

### Par source

| Variable                   | Source                                               | Obligatoire                       |
| -------------------------- | ---------------------------------------------------- | --------------------------------- |
| `GOOGLE_FACTCHECK_API_KEY` | Google Fact Check (#13)                              | Pour `sync:factchecks`            |
| `JUDILIBRE_CLIENT_ID`      | Judilibre (#15)                                      | Pour l'enrichissement ciblé (#15) |
| `JUDILIBRE_CLIENT_SECRET`  | Judilibre (#15)                                      | Pour l'enrichissement ciblé (#15) |
| `JUDILIBRE_API_KEY`        | Judilibre (#15)                                      | Pour l'enrichissement ciblé (#15) |
| `JUDILIBRE_BASE_URL`       | Judilibre (#15)                                      | Pour l'enrichissement ciblé (#15) |
| `JUDILIBRE_OAUTH_URL`      | Judilibre (#15)                                      | Pour l'enrichissement ciblé (#15) |
| `ANTHROPIC_API_KEY`        | Analyse presse, classification thématique (#18, #19) | Pour scripts d'enrichissement     |
| `VOYAGE_API_KEY`           | Embeddings RAG (#19)                                 | Pour `index:embeddings`           |
| `MAILJET_API_KEY`          | Newsletter (#19)                                     | Pour la newsletter                |
| `MAILJET_SECRET_KEY`       | Newsletter (#19)                                     | Pour la newsletter                |
| `CRON_SECRET`              | Cache revalidation (sync:daily en écriture)          | Requis                            |

### Configuration des URLs

```env
# Judilibre (PISTE)
JUDILIBRE_BASE_URL="https://api.piste.gouv.fr/cassation/judilibre/v1.0"
JUDILIBRE_OAUTH_URL="https://oauth.piste.gouv.fr/api/oauth/token"
```

---

## 22. Rate limits

Tous les rate limits sont centralisés dans `src/config/rate-limits.ts`.

| Constante                          | Valeur    | Source             | Notes                         |
| ---------------------------------- | --------- | ------------------ | ----------------------------- |
| `DATA_GOUV_RATE_LIMIT_MS`          | 200 ms    | data.gouv.fr       | Politesse                     |
| `ASSEMBLEE_OPENDATA_RATE_LIMIT_MS` | 300 ms    | opendata AN        | Textes des documents (HTML)   |
| `SENAT_RATE_LIMIT_MS`              | 200 ms    | senat.fr           | Non documenté, politesse      |
| `EUROPARL_RATE_LIMIT_MS`           | 200 ms    | europarl.europa.eu | Politesse                     |
| `HATVP_RATE_LIMIT_MS`              | 200 ms    | hatvp.fr           | Politesse                     |
| `WIKIDATA_RATE_LIMIT_MS`           | 200 ms    | Wikidata REST      | Politique officielle          |
| `WIKIDATA_SPARQL_RATE_LIMIT_MS`    | 300 ms    | Wikidata SPARQL    | Empirique (timeout fréquents) |
| `LEGISLATION_RATE_LIMIT_MS`        | 300 ms    | Légifrance         | Non documenté                 |
| `RSS_RATE_LIMIT_MS`                | 1000 ms   | Flux RSS           | Politesse standard            |
| `FACTCHECK_RATE_LIMIT_MS`          | 200 ms    | Google Fact Check  | Politesse                     |
| `JUDILIBRE_RATE_LIMIT_MS`          | 500 ms    | PISTE/Judilibre    | Politesse                     |
| `AI_RATE_LIMIT_MS`                 | 500 ms    | API IA             | Entre appels IA               |
| `AI_429_BACKOFF_MS`                | 30 000 ms | API IA             | Backoff sur rate limit 429    |

### HTTPClient

Tous les scripts sync utilisent le `HTTPClient` centralisé (`src/lib/api/http-client.ts`) qui fournit :

- **Retry automatique** : 3 tentatives avec backoff exponentiel
- **Gestion 429** : retry avec backoff + logging de la source
- **Rate limiting** : délai configurable entre requêtes
- **Timeout** : 30s par défaut, configurable par script

---

## 23. Troubleshooting

### SPARQL timeout (Wikidata)

**Symptôme** : `QueryTimeoutException` ou pas de réponse de `query.wikidata.org/sparql`

**Solutions** :

- Réduire la taille des requêtes (moins de `VALUES` par batch)
- Préférer l'API REST Wikidata (`wbgetclaims`) au SPARQL quand possible
- Augmenter le délai entre requêtes (`WIKIDATA_SPARQL_RATE_LIMIT_MS`)
- Relancer avec `--resume` (le script sauvegarde sa progression)

### 429 Too Many Requests

**Symptôme** : `[HTTPClient] 429 Too Many Requests from {source}`

**Solutions** :

- Le HTTPClient retry automatiquement avec backoff exponentiel
- Si le problème persiste, augmenter le rate limit dans `src/config/rate-limits.ts`
- Pour les API IA, le backoff est de 30s (`AI_429_BACKOFF_MS`)

### ZIP corrompus (Votes AN / Législation)

**Symptôme** : Erreur de décompression ZIP

**Solutions** :

- Le script utilise ETag + hash pour détecter les changements, relancer suffit généralement
- Vérifier que `data.assemblee-nationale.fr` est accessible
- Utiliser `--force` pour forcer le re-téléchargement

### CSV avec encodage incorrect

**Symptôme** : Caractères accentués cassés (mojibake)

**Solutions** :

- Les CSV data.gouv.fr peuvent être en ISO-8859-1 (pas UTF-8)
- Le `HTTPClient.getBuffer()` télécharge en binaire, puis `TextDecoder("iso-8859-1")` décode correctement
- Vérifier l'encodage documenté par la source

### Judilibre inaccessible

**Symptôme** : Erreur OAuth ou 401/403

**Solutions** :

- Vérifier que les 5 variables `JUDILIBRE_*` sont configurées
- Les tokens OAuth expirent, le script les renouvelle automatiquement
- Vérifier l'abonnement PISTE (peut expirer)
- En sandbox : utiliser `https://sandbox-oauth.piste.gouv.fr/api/oauth/token`

### Sync interrompue

**Symptôme** : Script arrêté en cours de route

**Solutions** :

- `sync:full -- --from=N` pour reprendre depuis l'étape N
- `sync:wikidata-ids --resume` pour reprendre le matching Wikidata
- La plupart des scripts sont idempotents (upsert), relancer est sans risque

---

## 24. Crédits

Les données utilisées proviennent de sources officielles et de projets citoyens :

- **Assemblée Nationale** : https://data.assemblee-nationale.fr, Licence Ouverte (Etalab)
- **Sénat** : https://www.senat.fr, Licence Ouverte
- **Gouvernement** : https://www.data.gouv.fr, Licence Ouverte (Etalab)
- **HATVP** : https://www.hatvp.fr/open-data/, Licence Ouverte (Etalab)
- **Parlement européen** : https://data.europarl.europa.eu, Open Data
- **Wikidata** : https://www.wikidata.org, CC0 (domaine public)
- **Regards Citoyens** : https://www.regardscitoyens.org, CC-BY-SA (NosDéputés, NosSénateurs)
- **data.gouv.fr** : https://www.data.gouv.fr, Licence Ouverte (Etalab)
- **PISTE / Judilibre** : https://developer.aife.economie.gouv.fr, API publique
- **Google Fact Check Tools** : https://developers.google.com/fact-check/tools/api

Merci à ces organisations pour leur engagement en faveur de l'Open Data et de la transparence démocratique.
