# Recherche en langage naturel dans le corpus présidentiel 2027

## Décision

Faire évoluer la recherche existante vers une recherche hybride, pas vers un chatbot qui invente
une réponse. Le premier résultat doit rester une liste structurée de thèmes, candidats et mesures
publiées, avec un lien direct vers chaque source. Une réponse rédigée pourra être ajoutée ensuite,
uniquement à partir des résultats retrouvés et avec des références visibles.

Cette approche conserve trois propriétés éditoriales : une absence reste qualifiée comme une
absence dans le corpus Poligraph, les mêmes règles s'appliquent à tous les candidats et aucun modèle
ne juge la pertinence ou la faisabilité d'une mesure.

## État actuel à conserver

- `SearchDocument` est l'index public central. Il contient déjà les candidatures et les mesures,
  leur périmètre électoral, leur visibilité et leur URL canonique.
- `searchPublicPage()` fournit une recherche lexicale rapide, accentuée et déterministe. Elle reste
  le premier passage et le repli en cas d'indisponibilité d'un service d'IA.
- les transitions éditoriales synchronisent l'index et `search:reindex` permet une reconstruction
  bornée par élection et type d'entité ;
- l'autocomplétion et la page de résultats hydratent les identifiants par les autorités publiques,
  ce qui empêche un index obsolète d'exposer un brouillon ;
- `ChatEmbedding` ne doit pas être réutilisé pour ce chantier : il ne connaît pas les mesures,
  stocke des vecteurs JSON et calcule les similarités dans Node.js. Il appartient au RAG historique
  du chatbot général, pas à l'index électoral public.

## Parcours de recherche

### 1. Pendant la saisie

À partir de deux caractères, conserver l'autocomplétion lexicale actuelle. Elle répond aux noms,
titres et préfixes sans appeler un modèle à chaque frappe. Le délai de 150 ms et l'annulation des
requêtes précédentes restent adaptés. Le panneau annonce le chargement, les erreurs et le nombre de
résultats dans une région accessible.

Une phrase complète peut être envoyée avec Entrée, par exemple : « Que proposent les candidats pour
réduire le coût du logement ? ». Aucun appel sémantique ne part pendant la frappe.

### 2. À la soumission

Exécuter en parallèle :

1. la recherche lexicale actuelle ;
2. un embedding de la requête puis une recherche vectorielle dans les seuls documents publics de
   `presidentielle-2027` ;
3. la détection déterministe des noms de candidats et des thèmes connus.

Fusionner les deux listes avec un classement réciproque, sans score politique. Un résultat trouvé
exactement par son nom ou son titre reste prioritaire. La recherche sémantique récupère les
formulations proches, par exemple « faire baisser les loyers » face à une mesure parlant
« d'encadrement locatif ».

La première version ne fait pas de reranking externe. Le benchmark hybride atteint déjà le niveau
de rappel attendu et un second appel payant ajouterait de la latence sans gain démontré. Cette
décision devra être réévaluée seulement si des requêtes éditoriales documentent un défaut de
classement que la fusion réciproque ne corrige pas.

### 3. Format des résultats

La page conserve des groupes explicites :

- thèmes correspondants ;
- candidats mentionnés ou retrouvés ;
- mesures, regroupées par thème puis par candidat, avec la formulation publiée et la source ;
- raccourci vers le comparateur lorsque la requête concerne au moins deux candidats ou un thème
  comparable.

Une synthèse générée n'est pas nécessaire à la première version. Dans une seconde version, un bouton
« Résumer ces résultats » pourra produire 80 à 120 mots à partir d'un maximum de huit mesures. Chaque
phrase factuelle devra référencer au moins une mesure affichée. Sans références suffisantes, le
service retourne les résultats sans synthèse.

## Index sémantique

Ajouter à `SearchDocument` les informations de version et le vecteur sémantique, ou une table
`SearchEmbedding` strictement liée à son couple `(entityType, entityId)`. Le stockage doit utiliser
`pgvector`, avec un index de voisinage et un filtre préalable sur `visibility = PUBLIC` et
`electionId`. Il ne faut pas charger tous les vecteurs JSON dans une fonction Vercel.

Le texte embarqué pour une mesure est composé uniquement de données publiées : candidat, parti,
thème, sous-thèmes validés, formulation, détails relus et titre du programme. Pour une candidature :
nom, parti et statut public. Le modèle d'embedding et la révision source sont enregistrés afin de
détecter les lignes périmées.

La synchronisation suit les mêmes événements que l'index lexical : publication, nouvelle révision,
retrait, dépublication et changement de candidature. Une écriture éditoriale ne doit pas attendre
le fournisseur d'embeddings : elle marque le vecteur comme à reconstruire, puis une tâche asynchrone
le calcule. La recherche lexicale couvre cet intervalle.

Le CLI existant devient :

```bash
npm run search:reindex -- --election=presidentielle-2027 --entity-type=MEASURE
npm run search:embed -- --election=presidentielle-2027 --entity-type=MEASURE --stale-only
```

Le lot d’indexation sémantique peut être contrôlé sans appel à Mistral ni écriture :

```bash
npm run search:embed -- \
  --election=presidentielle-2027 \
  --entity-type=MEASURE \
  --limit=500 \
  --dry-run
```

Après application séparée de la migration pgvector, retirer `--dry-run` construit uniquement les
vecteurs absents ou périmés. La commande accepte `--after=IDENTIFIANT` pour reprendre après le
dernier curseur affiché et `--stale-only=false` uniquement pour une reconstruction volontaire.
L’indexation des candidatures se lance séparément avec `--entity-type=CANDIDACY`.

Le modèle `mistral-embed` produit 1 024 dimensions. Le texte envoyé est limité à 500 caractères,
traité par lots de 16 et identifié par un hash versionné. Une mise à jour du document lexical rend
le vecteur détectablement périmé sans bloquer la publication. `SearchEmbedding` n’expose aucune
politique de lecture anonyme : la future recherche vectorielle devra toujours joindre
`SearchDocument` et vérifier son élection et sa visibilité publique avant de classer les résultats.

L'administration expose les deux opérations avec progression, reprise sur curseur et audit du
nombre de documents publics sans embedding. Aucun bouton ne lance une reconstruction synchrone dans
une requête HTTP.

## Modèles et maîtrise des coûts

La première version utilise le modèle d'embedding multilingue `mistral-embed`. Elle ne génère ni
interprétation ni synthèse de la réponse. Les identifiants de modèles restent dans la configuration,
jamais dans le composant.

Garde-fous de coût :

- zéro LLM pendant l'autocomplétion ;
- un embedding au maximum par recherche soumise, mis en cache sur le hash de la requête normalisée ;
- texte limité à 500 caractères, résultats candidats limités avant reranking ;
- synthèse uniquement sur action explicite dans la deuxième version ;
- mesure des tokens renvoyés par le SDK, coût estimé, latence et fournisseur pour chaque appel ;
- plafonds journalier et mensuel avec coupure automatique de la partie IA ;
- repli immédiat vers la recherche lexicale en cas de quota, délai dépassé ou erreur fournisseur ;
- réindexation différentielle par révision, avec traitement par lots et concurrence bornée.

Les plafonds partagés sont fixés par défaut à 5 000 embeddings par jour et 100 000 sur trente jours.
Ils peuvent être abaissés avec `PRESIDENTIAL_SEARCH_DAILY_EMBEDDING_LIMIT` et
`PRESIDENTIAL_SEARCH_MONTHLY_EMBEDDING_LIMIT`. En production, l'absence du compteur Upstash coupe
la branche sémantique et conserve la réponse lexicale. Le journal technique conserve fournisseur,
modèle, latence et tokens, jamais le texte recherché.

Cloudflare Workers n'est pas nécessaire au premier déploiement. Vercel, PostgreSQL et le rate limit
existant suffisent pour exécuter le parcours. Cloudflare pourra servir plus tard de cache de requêtes
ou de protection supplémentaire, mais ne doit pas devenir un second backend tant qu'une limite
mesurée ne le justifie pas.

## Accessibilité et interface

- conserver un vrai formulaire GET et une page de résultats utilisable sans JavaScript ;
- afficher un libellé visible et des exemples de questions, sans faux historique de conversation ;
- annoncer le nombre de résultats via `aria-live`. Le formulaire GET recharge une page complète et
  laisse le navigateur annoncer la navigation, sans simuler un état asynchrone trompeur ;
- rendre chaque résultat comme un lien autonome avec candidat, thème et source lisibles hors
  contexte ;
- éviter l'animation de texte tapé et respecter `prefers-reduced-motion` ;
- conserver la page et toutes ses variantes en `noindex,follow` avec un canonical sans requête.

## Évaluation avant ouverture

Constituer un jeu de 50 à 100 requêtes françaises validées manuellement : mots exacts, synonymes,
fautes, questions complètes, candidat plus thème, requêtes sans réponse et formulations pouvant
produire des faux positifs. Exemples : « loge », « encadrer les loyers », « que propose X pour les
déserts médicaux ? », « retraite » contre « retrait ».

Mesurer séparément recherche lexicale, vectorielle et hybride : rappel dans les cinq premiers
résultats, précision, taux de zéro résultat, faux positifs éditoriaux, latence p50/p95 et coût par
requête. Le lancement exige une amélioration mesurable sur les synonymes et les phrases, sans
régression sur les noms propres et les recherches exactes.

Le benchmark lexical de référence se lance en lecture seule avec :

```bash
npm run search:evaluate -- --election=presidentielle-2027 --top-k=5 --limit=12
```

Après construction des embeddings, le même jeu éditorial mesure la fusion hybride :

```bash
npm run search:evaluate -- \
  --election=presidentielle-2027 \
  --strategy=hybrid \
  --top-k=5 \
  --limit=12
```

La contribution vectorielle seule se mesure séparément, sans résultat lexical ni carte de thème :

```bash
npm run search:evaluate -- \
  --election=presidentielle-2027 \
  --strategy=semantic \
  --top-k=5 \
  --limit=12
```

Calibration du 31 août 2026 sur les 50 requêtes éditoriales, après exclusion des cartes de thème du
calcul :

| Stratégie  | Rappel@5 | Précision@5 | Faux positifs négatifs | Latence p95 |
| ---------- | -------: | ----------: | ---------------------: | ----------: |
| Lexicale   |    0,783 |       0,609 |                    0 % |      201 ms |
| Sémantique |    0,957 |       0,826 |                    0 % |      419 ms |
| Hybride    |    1,000 |       0,835 |                    0 % |      703 ms |

Le léger recul de précision de la fusion face au vectoriel seul est compensé par un rappel complet
et par la protection des recherches exactes. Il ne justifie pas un second appel de reranking.

L'autocomplétion reste explicitement lexicale. Seule la soumission de la page complète utilise la
recherche hybride. Si Mistral dépasse le délai maximal de 2,5 secondes, atteint son quota ou renvoie
une erreur, le serveur restitue les résultats lexicaux.

L'embedding d'une requête est mis en cache pendant vingt-quatre heures sous une clé SHA-256 qui ne
contient pas la phrase en clair. Le cache partagé utilise l'Upstash déjà configuré pour le projet.
Sans Upstash, un cache mémoire borné évite au moins les appels répétés sur une même instance.

Il exécute les 50 cas éditoriaux de `src/config/presidential-search-evaluation.ts` et écrit un
rapport JSON dans `.tmp/presidential-search-evaluation/`. Ce rapport doit être conservé hors Git
avec les données d'analyse privées, puis comparé aux rapports vectoriel et hybride du même corpus.

## Découpage proposé

1. Jeu d'évaluation et instrumentation de la recherche actuelle.
2. Migration `pgvector`, index sémantique des mesures et CLI de reconstruction différentielle.
3. Recherche hybride côté serveur, sans génération de texte.
4. Nouvelle page de résultats et autocomplétion conservée, tests clavier et lecteur d'écran.
5. Commande d'administration, budgets, métriques et coupe-circuit.
6. Expérimentation séparée de la synthèse Mistral sourcée, après validation de la recherche hybride.
