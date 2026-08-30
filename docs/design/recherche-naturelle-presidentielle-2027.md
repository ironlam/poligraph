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

Le reranking externe n'est déclenché que si la fusion produit plus de douze résultats plausibles et
peu discriminés. Cette condition évite un second appel payant sur les requêtes simples.

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

L'administration expose les deux opérations avec progression, reprise sur curseur et audit du
nombre de documents publics sans embedding. Aucun bouton ne lance une reconstruction synchrone dans
une requête HTTP.

## Modèles et maîtrise des coûts

La première version utilise un modèle d'embedding multilingue Mistral. L'interprétation facultative
d'une requête complexe et la synthèse de résultats utilisent un petit modèle Mistral avec sortie
JSON validée. Les identifiants de modèles et leurs tarifs doivent être vérifiés au moment de
l'implémentation, puis consignés dans la configuration, jamais écrits dans le composant.

Garde-fous de coût :

- zéro LLM pendant l'autocomplétion ;
- un embedding au maximum par recherche soumise, mis en cache sur le hash de la requête normalisée ;
- texte limité à 500 caractères, résultats candidats limités avant reranking ;
- synthèse uniquement sur action explicite dans la deuxième version ;
- mesure des tokens renvoyés par le SDK, coût estimé, latence et fournisseur pour chaque appel ;
- plafonds journalier et mensuel avec coupure automatique de la partie IA ;
- repli immédiat vers la recherche lexicale en cas de quota, délai dépassé ou erreur fournisseur ;
- réindexation différentielle par révision, avec traitement par lots et concurrence bornée.

Cloudflare Workers n'est pas nécessaire au premier déploiement. Vercel, PostgreSQL et le rate limit
existant suffisent pour exécuter le parcours. Cloudflare pourra servir plus tard de cache de requêtes
ou de protection supplémentaire, mais ne doit pas devenir un second backend tant qu'une limite
mesurée ne le justifie pas.

## Accessibilité et interface

- conserver un vrai formulaire GET et une page de résultats utilisable sans JavaScript ;
- afficher un libellé visible et des exemples de questions, sans faux historique de conversation ;
- annoncer « Recherche sémantique en cours » puis le nombre de résultats via `aria-live` ;
- déplacer le focus vers le titre des résultats seulement après une soumission volontaire, jamais
  pendant l'autocomplétion ;
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
