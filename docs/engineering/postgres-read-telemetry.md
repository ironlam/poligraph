# Attribution des lectures PostgreSQL

## Périmètre et audit

Audit depuis `origin/main` (`3f9db5a3`), après #873, #874, #875 et #881.
Cette PR ajoute une observation ciblée. Elle ne change ni les requêtes métier,
ni les règles de publication, ni les caches et leurs invalidations.
Elle ne configure aucun service externe et reste désactivée par défaut.

### Consommateurs de la lecture complète

Recherche de toutes les références à `getPublicMeasuresByElection` dans `src/`
et `scripts/`, puis vérification des imports et des appels :

| Consommateur actuel                                          | Finalité                                                                        | Exécution               | Cache      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------- | ---------- |
| `measures.integration.test.ts`                               | Parité de visibilité et retraits                                                | Test PostgreSQL jetable | Aucun      |
| `presidential-measure-loads.performance.integration.test.ts` | Référence complète de #881, comparaison aux agrégations et oracle de télémétrie | Test PostgreSQL jetable | Aucun      |
| `hub.ts`                                                     | Référence dans un commentaire explicatif                                        | Aucun appel             | Sans objet |
| `public-page-performance-guards.test.ts`                     | Interdit la réintroduction de cet appel dans le champ des candidatures          | Analyse statique        | Sans objet |

**Aucun consommateur applicatif actuel de cette fonction.** Son opération reste
instrumentée pour détecter une réutilisation. Ne pas annoncer une économie future
en supprimant une lecture que le runtime n'effectue déjà plus.

Les consommateurs historiques ont été remplacés par
`getPublicMeasureRollupsByElection`, `getPublicMeasureThemeRollupsByElection`,
`getPublicMeasureSubtopicRollupsByElection` et les résumés des guides.
Ces lectures restent attribuables par les loaders qui les exécutent.

### Opérations couvertes

Le registre fermé est `src/lib/telemetry/read-operations.ts`.
Les arguments métier ne deviennent jamais des noms ou dimensions d'événement.

| Opération                         | Fonction / finalité                                              | Frontière et contexte                                                    |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `measures.election.full`          | `getPublicMeasuresByElection`, toutes les mesures avec relations | Non cachée ; tests aujourd'hui, contexte inconnu sans appelant explicite |
| `presidential.hub.load`           | `loadHubMeasureContext`, agrégations du hub                      | Dans `getHubMeasureContextCached`, `use cache`, profil `synced`          |
| `presidential.field.load`         | `getHubCandidacyField`, champ sourcé des candidatures            | Pas de cache propre ; appelé depuis le hub et les priorités              |
| `presidential.themes.load`        | `loadThemesIndex`, compteurs par thème et sous-thème             | Cache de l'index ; appels directs depuis hub, priorités et sujet         |
| `presidential.subject.load`       | `loadSubjectPageData`, comparaison d'un thème                    | Derrière le cache du sujet                                               |
| `presidential.priorities.load`    | `loadPrioritesData`, distribution des mesures                    | Derrière le cache des priorités                                          |
| `presidential.reader-guides.load` | `loadPresidentialReaderGuideSummaries`, résumés du hub           | Appel direct depuis le chargement du hub, sous son cache                 |
| `elections.details.load`          | `getPublicElectionDetails`, page bornée de candidatures          | Pas de cache de données ; appelé par le handler                          |
| `elections.details.http`          | Corps du handler GET `/api/elections/[slug]`                     | Exécution web ; CDN `s-maxage=300`, `stale-while-revalidate=120`         |
| `presidential.snapshots.sync`     | `computePresidentialSnapshots`                                   | Script ; `scheduled` si `GITHUB_EVENT_NAME=schedule`                     |
| `presidential.probity.load`       | `computeProbityCandidateCountLive`                               | Lecture du snapshot ou repli public si snapshot absent                   |

Les caches présidentiels gardent leurs tags `election-measures` et
`election-candidacies`, ainsi que `cacheLife("synced")`. Les recherches préalables
de l'identifiant d'élection dans les wrappers restent hors du périmètre. Les
pages ont également leur cache de rendu : une invocation de loader n'est donc
ni une visite, ni nécessairement une requête HTTP.

Le glossaire complet (`loadPresidentialReaderGuideIndex`, pages et sitemap)
est distinct du résumé du hub et reste hors périmètre. Les appels directs au
champ des candidatures hors `getHubCandidacyField`, autres domaines, clients
Prisma indépendants et pools `pg` construits ailleurs ne sont pas couverts.

### Infrastructure observée

- `db.ts` construit un seul pool partagé (max 2), un `PrismaPg`, puis le client
  étendu avec `createPoligraphIdExtension`. L'extension alloue les identifiants
  via le client brut. L'observation est en dessous des deux clients.
- Les options SSL, timeouts, `allowExitOnIdle`, options de transaction et arrêt
  du pool sont conservés. Les transactions interactives utilisent le même
  client `pg` emprunté. Les verrous consultatifs passent par ce pool aussi.
- `instrumentation.ts` initialise Sentry si configuré : traces échantillonnées,
  release Vercel et capture des erreurs Next. Aucun logger structuré central
  dédié aux lectures n'existe. Les services utilisent déjà `console`.
  Cette télémétrie émet une ligne JSON par résumé sur `console.info` ; elle
  n'active pas une intégration Sentry ni un exporteur OpenTelemetry supplémentaire.
- #873 mutualise le contexte du resolver d'affaires dans les lots de presse
  et de découverte. Ces synchronisations ne consomment pas la lecture des
  mesures. Leurs requêtes et les autres pipelines restent hors périmètre ici.
- Le snapshot présidentiel s'exécute par CLI / GitHub Actions, pas dans Inngest.
  Les étapes `step.run` des autres synchronisations sérialisent leur résultat :
  aucun contexte de télémétrie n'est transmis dans ces résultats. Toute extension
  future à Inngest doit ouvrir l'observation **dans** le callback d'une étape,
  à chaque exécution réelle, y compris les nouvelles tentatives.

## Mécanisme et limites

`ObservedPool` fournit un constructeur `Client` personnalisé, point d'extension
de [pg-pool](https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/README.md).
Il délègue aux méthodes publiques `query` et `connect`. Aucun prototype global
n'est remplacé. Aucun import de `src/test` n'entre dans le runtime.

Un `AsyncLocalStorage` capture l'opération au moment de l'appel `Client.query`.
Le callback d'acquisition du pool est lié au contexte d'entrée, même vide ou
non échantillonné : libérer une connexion depuis A ne doit pas attribuer à A
la requête de B qui attendait. La complétion conserve le collecteur capturé.
Les `PrismaPromise`, paresseuses, sont attendues dans le contexte actif.

La mesure des lignes est `result.rows.length` au niveau du driver, avant
transformation par Prisma. Elle est différente de `result.rowCount`, qui compte
parfois les lignes affectées sans retour de données, et de la taille d'un tableau
Prisma. Voir la [définition node-postgres du résultat](https://node-postgres.com/apis/result).
Un agrégat SQL retournant un compteur coûte une ligne reçue, quel que soit le
nombre de lignes parcourues dans PostgreSQL. Ce n'est pas une mesure du travail
interne du serveur, des octets réseau ou de l'egress facturé.

Une opération Prisma peut produire plusieurs requêtes SQL et reconstruire
plusieurs objets depuis leurs résultats. Ces niveaux ne sont pas interchangeables.
Le compteur d'opérations Prisma et le nombre d'objets Prisma ne sont pas collectés.
Une commande SQL peut aussi contenir plusieurs instructions ou appeler une fonction
serveur. L'observateur ne peut pas compter ces instructions internes sans parser
le SQL ou ajouter une instrumentation côté serveur.

Les appels au driver ayant échoué sont comptés séparément : un échec local ou
réseau ne prouve pas que PostgreSQL a exécuté une instruction. Les lignes reçues
avant un échec mais non exposées dans un résultat final sont indisponibles.
Les curseurs, flux et objets `Submittable` restent hors couverture. Les résultats
multiples de requêtes bufferisées sont additionnés, sans lire les cellules.

L'attribution désigne l'opération active au dispatch. Si Prisma regroupe des
lectures de plusieurs consommateurs dans un seul appel driver, cet appel ne peut
être réparti honnêtement entre ces consommateurs : il appartient au dispatch qui
le porte. Il ne faut pas extrapoler cette instrumentation à une couverture
exhaustive de tous les appels Prisma. La parité est testée sur les loaders ciblés.

### Imbrication

Les requêtes et lignes sont comptées **exclusivement** sur l'opération active la
plus proche. Le parent ne recompte pas les requêtes du fils. Le champ `root`
permet de regrouper toutes les lectures causées par une même catégorie d'entrée.
`parent` et `root` sont des noms du registre, pas des identifiants de requête.
Il n'y a pas de reconstruction événement par événement d'une trace distribuée.

La durée d'une opération est inclusive (attentes du pool, sous-opérations et
travail applicatif). Ne jamais additionner les durées parent et enfant pour
calculer une durée totale. Les opérations doivent attendre leurs requêtes ; les
travaux lancés sans attente peuvent apparaître dans `pendingDriverCalls` puis
leurs complétions sont ignorées après clôture.

## Configuration

| Variable              | Valeur par défaut             | Règle                                                                             |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `DB_READ_TELEMETRY`   | désactivée                    | Seule la chaîne `true` active les résumés                                         |
| `DB_READ_SAMPLE_RATE` | `0.1`                         | Probabilité de sélection à l'entrée racine ; bornée entre 0 et 1                  |
| `DB_READ_MAX_EVENTS`  | `60`                          | Nombre maximal de tentatives d'émission par instance et fenêtre, entre 1 et 10000 |
| `DB_READ_WINDOW_MS`   | `60000`                       | Fenêtre entre 1000 et 3600000 ms                                                  |
| `DB_READ_CONTEXT`     | `unknown` sans preuve d'appel | `web`, `build`, `scheduled`, `script`, `unknown`                                  |
| `DB_READ_ENVIRONMENT` | `VERCEL_ENV`, sinon `local`   | `production`, `preview`, `local` ; configurer explicitement les scripts distants  |

Les valeurs numériques invalides utilisent le défaut. Un taux nul exclut toutes
les opérations. Les opérations imbriquées héritent du même tirage et de sa
probabilité ; les requêtes d'une opération ne sont jamais tirées individuellement.

`npm run build` force `DB_READ_CONTEXT=build` pour Next. `npm run dev` et
`npm start` imposent `web`. `NEXT_PHASE=phase-production-build`, lorsqu'il est
présent, est aussi reconnu. Un `NODE_ENV=production` seul n'est jamais une preuve
d'exécution web. Pour un build lancé directement, utiliser
`DB_READ_CONTEXT=build npx next build --webpack`.

Pour Vercel, configurer `DB_READ_CONTEXT=web` au runtime et conserver la commande
de build npm qui le remplace par `build`. Pour les jobs distants, renseigner
`DB_READ_ENVIRONMENT` et `DB_READ_CONTEXT=scheduled` ou `script`. Les noms et
identifiants des jobs ne sont pas envoyés. Une release est le SHA Git de 40
caractères hexadécimaux fourni par `VERCEL_GIT_COMMIT_SHA` ou `GITHUB_SHA`, sinon
`null` ; aucune chaîne arbitraire n'est journalisée comme version.

Arrêt : retirer `DB_READ_TELEMETRY=true` ou mettre `false`, puis appliquer cette
configuration selon le mécanisme normal de la plateforme. Aucun accès en base
n'est requis. Le changement d'une configuration de plateforme n'est pas supposé
modifier magiquement l'environnement des instances déjà démarrées. Cette PR ne
change aucune configuration de production et n'effectue aucun déploiement.

## Schéma des événements v1

Chaque événement a exactement les champs suivants :

| Champs                                                  | Type / définition                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `event`, `schemaVersion`                                | Constantes `db.read.operation`, `1`                                                         |
| `timestamp`                                             | ISO UTC à la fin de l'opération                                                             |
| `operation`, `parent`, `root`                           | Noms fermés ; parent `null` à l'entrée racine                                               |
| `environment`, `context`, `release`                     | Métadonnées définies ci-dessus                                                              |
| `sampleProbability`                                     | Probabilité du tirage racine, strictement positive sur un événement émis                    |
| `success`                                               | La promesse applicative s'est résolue ; ce n'est pas un statut HTTP 2xx                     |
| `durationMs`                                            | Durée monotone inclusive, arrondie au centième de ms, avant émission                        |
| `driverCalls`                                           | Appels bufferisés à `Client.query`, succès et échecs, contrôle des transactions inclus      |
| `driverSucceeded`, `driverFailed`                       | Appels terminés avec résultat / erreur ; aucun message ou code d'erreur                     |
| `driverRows`                                            | Somme exclusive des longueurs des tableaux de lignes reçus par le driver                    |
| `unsupportedCalls`                                      | Appels Submittable exclus et résultats bufferisés dont le contrat `rows` n'est pas reconnu  |
| `pendingDriverCalls`                                    | Appels capturés mais non terminés à la clôture ; attendu : zéro                             |
| `coverage`                                              | Constante `scoped-pg-buffered-v1`, pas un pourcentage de couverture globale                 |
| `prismaOperations`, `prismaObjects`, `serverStatements` | `null` : métriques indisponibles                                                            |
| `suppressedSinceLastEmission`                           | Événements sélectionnés supprimés par plafond ou taille depuis la dernière émission réussie |
| `emissionFailuresSinceLastEmission`                     | Échecs d'émission attrapés depuis la dernière émission réussie                              |
| `windowMs`, `instanceEventLimit`                        | Configuration du plafond appliquée à cet événement                                          |
| `lastSlotInWindow`                                      | Cette tentative consomme la dernière place de la fenêtre                                    |

Exemple synthétique (aucune donnée de production) :

```json
{
  "event": "db.read.operation",
  "schemaVersion": 1,
  "timestamp": "2026-09-15T12:00:00.000Z",
  "operation": "presidential.themes.load",
  "parent": "presidential.hub.load",
  "root": "presidential.hub.load",
  "environment": "preview",
  "context": "web",
  "release": null,
  "sampleProbability": 0.1,
  "success": true,
  "durationMs": 12.34,
  "driverCalls": 2,
  "driverSucceeded": 2,
  "driverFailed": 0,
  "driverRows": 18,
  "unsupportedCalls": 0,
  "coverage": "scoped-pg-buffered-v1",
  "prismaOperations": null,
  "prismaObjects": null,
  "serverStatements": null,
  "pendingDriverCalls": 0,
  "suppressedSinceLastEmission": 0,
  "emissionFailuresSinceLastEmission": 0,
  "windowMs": 60000,
  "instanceEventLimit": 60,
  "lastSlotInWindow": false
}
```

Aucun texte SQL, paramètre SQL, contenu métier, résultat, slug, identifiant de
personne, URL, secret ou message d'erreur n'entre dans ces événements. Les logs
historiques de l'application et Sentry ne sont pas modifiés par cette garantie.

## Coût, pertes et biais

Le plafond est **par processus / instance**, partagé via `globalThis` entre
imports et rechargements. Ce n'est pas un plafond global Vercel. Un démarrage
d'instance ouvre une nouvelle fenêtre ; davantage d'instances produisent
potentiellement davantage de logs.

Chaque événement JSON est borné à 2048 octets, hors séparateur de ligne et
encadrement ajouté par la plateforme. Au défaut : au plus 120 Kio par fenêtre et
instance, avant ces ajouts.
Seuls des compteurs scalaires sont conservés entre événements. Pas de buffer
d'événements, pas de timer, pas de requête SQL ni d'appel réseau par requête.
L'émission est synchrone via le mécanisme `console` existant, sans attente
d'exporteur, retry ou flush. Ses exceptions sont absorbées. Un stdout bloquant
reste une limite du logger existant, à surveiller après déploiement.

Lorsqu'une fenêtre est saturée, les suppressions sont comptées et indiquées au
prochain événement autorisé. Aucun timer ne force cet événement. Si l'instance
meurt avant, le nombre exact est perdu ; `lastSlotInWindow` est un avertissement
de saturation possible, pas une preuve du nombre de pertes. Les interruptions
de fonction peuvent aussi supprimer un résumé avant son émission.

Le tirage seul permet des estimations pondérées par `1 / sampleProbability`.
Le plafonnement, lui, sélectionne les premières complétions de la fenêtre : son
biais dépend de la charge et de la durée des opérations. Il n'existe pas de
coefficient fiable pour corriger ce biais. Les suppressions ne sont pas
attribuables à un consommateur individuel. Ne pas traiter une période saturée
comme un échantillon aléatoire complet. Les tirages des sous-opérations sont
corrélés au tirage de leur racine.

## Agrégation et choix de la prochaine optimisation

Exporter les lignes `db.read.operation` vers un fichier local hors Git, sans
ajouter de service. Séparer environnement, contexte, release et version de schéma.
Ne comparer que des fenêtres entièrement postérieures au déploiement de leur
version, de durée comparable et couvrant les mêmes plages de tâches planifiées.
Exclure explicitement les builds de la mesure du runtime web.

Sur une période sans perte connue ni saturation, pour chaque opération :

Vérifier aussi `pendingDriverCalls=0` et `unsupportedCalls=0`. Un compteur
incomplet ne doit pas être utilisé comme s'il représentait toute l'opération.

- chargements estimés : `sum(1 / sampleProbability)` ;
- lignes reçues estimées : `sum(driverRows / sampleProbability)` ;
- appels driver estimés : `sum(driverCalls / sampleProbability)` ;
- fréquence estimée : chargements estimés / durée de la période ;
- durée moyenne estimée : `sum(durationMs / p) / sum(1 / p)` ;
- lignes par chargement estimées : lignes estimées / chargements estimés.

Classement à produire :

| Rang | Opération, contexte, release | Lignes estimées sur la période | Chargements estimés / heure | Durée moyenne, p95 observé          | Pertes / couverture |
| ---- | ---------------------------- | ------------------------------ | --------------------------- | ----------------------------------- | ------------------- |
| 1..N | Groupe homogène              | Tri décroissant                | Estimation, pas visites     | Ne pas sommer les durées imbriquées | Afficher limites    |

Pour attribuer le coût aux surfaces, sommer les lignes par `root` (tous les
enfants, comptage exclusif) et compter les invocations uniquement sur les
événements avec `parent=null`. Pour identifier le loader responsable, grouper
par `root`, `operation`, `parent`. Ne pas additionner ensuite ces deux tableaux.
Le p95 observé décrit l'échantillon ; il n'est pas une mesure exacte de toutes
les invocations. Si le taux varie, utiliser des quantiles pondérés ou séparer
les périodes à taux constant.

Ce classement ne peut pas être rempli honnêtement avant collecte. Aucun chiffre
de fréquence de production n'a été déduit des fixtures. Il n'est pas une
estimation de facture : largeur des lignes, protocole, compression et volume
facturé ne sont pas mesurés. Les octets synthétiques de #881 restent une référence
locale de comparaison des projections.

## Validation après un déploiement ultérieur

1. Vérifier le SHA actif et sa présence dans les événements, sans mélanger les
   anciennes instances et la nouvelle version.
2. Démarrer avec un taux modéré, par exemple 0,1, et les plafonds par défaut.
   Vérifier un chargement web et un build : contextes distincts. Vérifier les
   scripts distants avec leur environnement explicite.
3. Collecter une fenêtre représentative incluant les tâches planifiées et les
   effets des caches. Une absence d'événement seule ne prouve pas un cache hit.
4. Contrôler le volume réel des logs, `lastSlotInWindow`, suppressions, échecs
   d'émission, appels incomplets et couverture. Vérifier les logs d'infrastructure
   pour les fonctions interrompues. Baisser le taux si le coût le demande.
5. Produire le classement précédent, par contexte. Documenter les exclusions et
   les incertitudes. Choisir un consommateur combinant lignes, fréquence et durée.
6. Proposer sa réduction de projection ou de fréquence dans une PR distincte,
   puis comparer deux fenêtres entièrement postérieures à leurs déploiements.

Pistes à étudier séparément : coût du glossaire complet, lectures d'identifiant
d'élection précédant les caches, et charge des contextes mutualisés du resolver
d'affaires. Cette PR n'applique aucune de ces optimisations.

## Vérification locale

Exemple depuis un checkout avec dépendances installées par Node Docker, sans
charger de fichier `.env` :

```bash
docker run -d --rm --name poligraph-read-test-pg \
  -e POSTGRES_USER=poligraph_test -e POSTGRES_PASSWORD=poligraph_test \
  -e POSTGRES_DB=poligraph_test \
  -v "$PWD/docker/init-search.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  pgvector/pgvector:pg17 -p 55433
# Attendre que pg_isready réussisse avant l'application du schéma.
docker exec poligraph-read-test-pg pg_isready -U poligraph_test -p 55433
docker run --rm --network container:poligraph-read-test-pg \
  -v "$PWD:/app" -w /app \
  -e DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test \
  -e DATABASE_SSL=false node:22-bookworm bash -lc \
  'npx prisma generate && npx prisma db push && npx vitest run src/lib/telemetry --no-file-parallelism'
docker stop poligraph-read-test-pg
```

Le port 55433 est interne au réseau partagé par ces deux conteneurs, sans port
hôte publié. Pour les suites de parité #881, reprendre la liste du job
`presidential-measure-loads-postgres` et son validateur JSON dans
`.github/workflows/ci.yml`. Recréer la base jetable entre deux passes complètes :
la fixture priorités existante laisse un sous-thème dont le slug est unique et
empêche son réensemencement dans une base réutilisée. Les jobs CI partent chacun
d'une base neuve. Cette limitation des fixtures est distincte de l'instrumentation.

Les tests utilisent Node 22 Docker et PostgreSQL 17 jetable. Le driver de #881
sert uniquement d'oracle de test. La suite PostgreSQL est ajoutée au job CI
présidentiel et à son validateur de rapports, qui refuse les suites absentes ou
ignorées. Les fixtures de l'API vérifient aussi la séparation HTTP / loader et
l'absence de paramètres de requête dans les événements.

Versions relevées : Node 22.23.2, pg 8.18.0, Next 16.3.4 et PostgreSQL 17.10.
La passe finale ciblée exécute 72 tests dans 11 fichiers, sans échec ni test
ignoré, avec validation du rapport JSON de #881.

Le benchmark `pg-pool.integration.test.ts` alterne désactivé / activé sur 100
lectures de 100 lignes, après échauffement. Il mesure séparément la durée, le
volume JSON et la variation du heap, sans assertion temporelle. Le compteur SQL
est comparé à l'oracle dans une passe distincte pour ne pas inclure sa
sérialisation dans le chronométrage. La variation du heap n'est pas un compteur
d'allocations : GC et rétention du collecteur de logs du test l'affectent.

Passes locales avec le schéma final : 72,10 et 56,78 ms désactivé ; 65,00 et
83,25 ms activé pour 100 opérations. Une requête par opération dans les deux
modes. Environ 63,9 Ko de JSON pour 100 événements, zéro désactivé.
Le heap a varié d'environ -7,0 à +4,9 Mo : pas d'estimation fiable des allocations.
Ces durées montrent le bruit de mesure et ne constituent pas une garantie de
latence. Le logger était capturé en mémoire : mesurer aussi le coût du sink réel
pendant la validation après déploiement.

Le smoke test du build Next réel a renvoyé deux réponses API 200 : chacune
produit un événement HTTP et un événement loader en contexte `web`, avec la
release synthétique configurée. Deux lectures successives de la page thèmes ont
renvoyé `x-nextjs-cache: HIT`, sans nouvel événement de loader. Le build émet
bien en contexte `build`. Il a aussi exposé un résumé avec un appel encore en
cours à sa clôture : cette limite est visible via `pendingDriverCalls`, et ces
observations doivent être isolées avant agrégation. Le test statique vérifie le
placement de l'observation derrière les frontières de cache, sans prétendre
simuler le cache distribué Vercel.
