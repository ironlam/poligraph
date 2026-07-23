# Runbook

Procédures opérationnelles pour Poligraph. Ce document couvre l'observabilité minimale (Sentry + notifications GitHub sur échec de workflow cron). Pour l'architecture et les sources de données, voir `ARCHITECTURE.md` et `DATASOURCES.md`.

---

## 1. Observabilité

### 1.1 Sentry (erreurs runtime de l'app Next.js)

- **Produit** : `@sentry/nextjs` — intégré via `src/instrumentation.ts` (serveur + edge) et `src/instrumentation-client.ts` (navigateur).
- **Dashboard** : https://sentry.io → organisation `$SENTRY_ORG` → projet `$SENTRY_PROJECT`.
- **Activation** : Sentry ne démarre que si `NEXT_PUBLIC_SENTRY_DSN` (ou `SENTRY_DSN`) est défini. Mettre `NEXT_PUBLIC_SENTRY_ENABLED=false` pour désactiver explicitement.
- **Sampling** : `tracesSampleRate: 0.1` en production (10% des transactions). `replaysOnErrorSampleRate: 1.0` (replay uniquement quand une erreur se produit).
- **Filtrage** : les erreurs de flow Next.js (`NEXT_REDIRECT`, `NEXT_NOT_FOUND`, `DYNAMIC_SERVER_USAGE`) et quelques bruits navigateur (`ResizeObserver`, `AbortError`, erreurs réseau) sont ignorées.
- **Upload des source maps** : actif uniquement si `SENTRY_AUTH_TOKEN` est présent à la build. Sans token, les stack traces restent minifiées mais Sentry fonctionne.

### 1.2 Workflows cron (GitHub Actions)

Les 5 workflows cron suivants ouvrent automatiquement une issue GitHub en cas d'échec :

| Workflow                    | Cron               | Label issue                     |
| --------------------------- | ------------------ | ------------------------------- |
| `sync-daily.yml`            | 3 × par jour       | `sync-daily-failure`            |
| `sync-scrutins-an.yml`      | Dimanche 04:00 UTC | `sync-scrutins-an-failure`      |
| `sync-content.yml`          | Dimanche 05:00 UTC | `sync-content-failure`          |
| `sync-politicians.yml`      | Dimanche 03:00 UTC | `sync-politicians-failure`      |
| `sync-wikidata-affairs.yml` | Dimanche 02:00 UTC | `sync-wikidata-affairs-failure` |

Une seule issue ouverte à la fois par label : si la précédente n'est pas fermée, un deuxième échec ne crée pas de doublon. **Fermer l'issue fait partie de la résolution** — sinon le prochain incident reste silencieux.

Pour recevoir un email à chaque nouvelle issue, activer les notifications GitHub sur `ironlam/poligraph` (Settings → Notifications → Watching → Custom → Issues) ou s'abonner uniquement aux labels ci-dessus via GitHub Mobile ou RSS (`https://github.com/ironlam/poligraph/labels/sync-daily-failure`).

### 1.3 Limitation de débit et mode dégradé

- **Produit** : Upstash Redis (`@upstash/ratelimit`), piloté par `middleware.ts`. Cinq tiers : `general` 60/min, `search` 30/min, `export` 5/min, `admin` 30/min, `subscribe` 8/min. Décision pure et testée dans `src/lib/ratelimit/degraded-mode.ts`.
- **Activation** : la limitation ne fonctionne que si `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` sont définis côté Vercel.
- **Mode dégradé (Upstash absent)** : le middleware ne retombe plus en silence. Comportement explicite :
  - **hors production** (dev, preview, `VERCEL_ENV` ≠ `production`) : les requêtes passent, un log léger throttlé est émis. Pas d'alerte Sentry, pas de blocage.
  - **en production** (`VERCEL_ENV=production`) :
    - détection explicite et **alerte throttlée** (au plus une fois toutes les 5 minutes par instance) : `console.error` visible dans les logs Vercel, plus `Sentry.captureMessage(..., "warning")` ;
    - le tier **`export` échoue fermé** (HTTP 503, `Retry-After: 60`) : c'est le seul endpoint lourd et vecteur de scraping sans dépendance opérateur, donc le bloquer pendant une panne est sûr et borné ;
    - les autres tiers (`general`, `search`, `admin`, `subscribe`) **passent** : on évite de verrouiller l'admin et de casser le site public pendant une panne Upstash ;
    - aucun en-tête public ne révèle l'état dégradé (ne pas signaler aux clients que la limitation est désactivée).
- **Réaction à l'alerte** : restaurer `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (Vercel → Settings → Environment Variables), puis redéployer ou attendre le prochain cold start. Vérifier l'état d'Upstash (https://status.upstash.com). Tant que la configuration manque, les exports restent en 503 ; le reste du site fonctionne sans limitation.

---

## 2. Variables d'environnement Sentry

Sentry reste totalement désactivé tant que `NEXT_PUBLIC_SENTRY_DSN` n'est pas défini. Aucune action n'est donc requise avant de créer le projet Sentry.

### 2.1 Variables à ajouter côté Vercel

| Variable                     | Scope            | Usage                                                     | Obligatoire                                            |
| ---------------------------- | ---------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN`     | All environments | DSN public du projet Sentry, inclus dans le bundle client | Oui, pour activer Sentry                               |
| `SENTRY_ORG`                 | Build only       | Slug de l'organisation Sentry                             | Oui, pour l'upload de source maps                      |
| `SENTRY_PROJECT`             | Build only       | Slug du projet Sentry                                     | Oui, pour l'upload de source maps                      |
| `SENTRY_AUTH_TOKEN`          | Build only       | Token d'upload (scope `project:releases`)                 | Optionnel, sans lui les stack traces restent minifiées |
| `NEXT_PUBLIC_SENTRY_ENABLED` | All environments | `false` pour désactiver explicitement en prod             | Optionnel                                              |

Le DSN est public par nature : il peut figurer en `NEXT_PUBLIC_*` sans risque (voir https://docs.sentry.io/concepts/key-terms/dsn-explainer/). L'auth token, lui, ne doit **jamais** partir côté client.

### 2.2 Création du projet Sentry

1. Créer un compte sur https://sentry.io (plan free jusqu'à 5 000 events/mois, suffisant pour démarrer).
2. Créer un projet Next.js nommé `poligraph` (ou similaire). Sentry fournit un DSN de la forme `https://<publicKey>@o<orgId>.ingest.sentry.io/<projectId>`.
3. Créer un auth token dans Settings → Account → Auth Tokens avec le scope `project:releases` (pour l'upload de source maps). Ne jamais le commiter.
4. Ajouter les 4 variables ci-dessus côté Vercel.
5. Redéployer.

---

## 3. Triage d'une issue cron automatique

Chaque issue créée par un workflow cron suit le même format (label dédié, lien vers le run, checklist). Procédure standard :

1. **Ouvrir le run** via le lien `Workflow run:` dans l'issue.
2. **Identifier l'étape qui a échoué** — pour `sync-politicians.yml` et `sync-wikidata-affairs.yml`, l'étape `Fail job if any sub-sync failed` liste les sous-syncs en échec.
3. **Consulter les logs** de l'étape. Cas fréquents :
   - `429 Too Many Requests` → rate limit atteint chez la source. Relancer plus tard ou ajuster `src/config/rate-limits.ts`.
   - `QueryTimeoutException` Wikidata SPARQL → préférer l'API REST ou ajuster `WIKIDATA_SPARQL_RATE_LIMIT_MS`.
   - `ZIP` corrompu → relancer, le sync utilise ETag + hash pour sauter si rien n'a changé.
   - `OAuth 401/403` Judilibre → vérifier les 5 variables `JUDILIBRE_*` côté GitHub secrets.
   - Voir `docs/DATASOURCES.md` §23 Troubleshooting pour le catalogue complet.
4. **Relancer le workflow** via l'interface GitHub (`Re-run failed jobs` ou `Run workflow` pour un run manuel). La plupart des syncs sont idempotents (upsert), relancer est sans risque.
5. **Fermer l'issue** une fois le workflow vert. Tant qu'elle reste ouverte, aucune nouvelle issue ne sera créée pour le même workflow.

### 3.1 Quand escalader

- Trois runs consécutifs en échec sur la même étape → la source externe a probablement changé de format ou d'URL. Vérifier sur le site source, puis ouvrir un ticket de fond (pas juste relancer).
- Échec systémique sur plusieurs workflows en même temps → vérifier l'état de Supabase (https://status.supabase.com) et de Vercel (https://www.vercel-status.com).
- Erreur Prisma `P2022` (colonne absente) → drift de schéma entre le code déployé et la base. Voir `AGENTS.md` §8 "Expand-Contract Migrations".

### 3.2 Issue "Amendment linking stalled" (watchdog `monitor-amendment-links.yml`)

Signal principal : l'écart entre le dernier scrutin amendable et le dernier scrutin lié dépasse 48h alors que des scrutins liables (type `AMENDEMENT` avec dossier) restent sans lien. Contrairement à un échec de workflow, ce cas est silencieux : le daily sync reste vert car ses étapes amendements/link se marquent `completed` même avec 0 ligne.

1. **Confirmer l'état** en lecture seule : `npx tsx --env-file=.env scripts/check-amendment-link-freshness.ts` (ne touche rien, imprime le verdict et les compteurs).
2. **Cause la plus fréquente** : l'ingestion des amendements ne progresse pas. Vérifier `SyncMetadata.policy-titles:amendments` (`extra.created`, `extra.anomaly`). Le feed AN (`Amendements.json.zip`, ~123k entrées) est parcouru en entier depuis le correctif `amendmentsSafetyCap` ; si `seen` explose au-delà de `POLICY_TITLE_AMENDMENTS_SAFETY_CAP` (500k), le job échoue explicitement (jamais de troncature silencieuse) → relever le plafond après vérification de la croissance du feed.
3. **Rattrapage** (idempotent, écrit en prod, à faire en connaissance de cause) :
   - Ingestion complète : `npx tsx --env-file=.env -e "..."` appelant `syncAmendmentsAN({ legislature: 17, force: true })` (dedup par contentHash, n'écrit que les deltas).
   - Liaison : `npx tsx --env-file=.env scripts/backfill-scrutin-amendment-links.ts --apply --batch=600`. **`--batch` doit dépasser le nombre de candidats liables** (le service scanne les N plus récents, sans curseur) ; sans `--apply`, le script ne fait qu'un rapport de classification.
   - Génération des titres : soumise à un échantillon de 20 + estimation de coût Mistral avant tout run de masse (voir la PR `fix-amendments-ingestion-cap`). Ne pas lancer l'auto-approbation sur tout le backlog sans contrôle qualitatif.
4. **Critère de succès** : `recentLinkableUnlinked = 0` (les scrutins non-`AMENDEMENT` — ARTICLE/MOTION/FINAL/AUTRE — sont hors périmètre et rapportés à part, pas comptés dans le critère).

---

## 4. Triage d'une erreur Sentry

1. **Ouvrir l'issue dans Sentry**.
2. **Regarder le `release`** : correspond au `VERCEL_GIT_COMMIT_SHA` du déploiement qui a produit l'erreur. Permet de savoir quel commit a introduit la régression.
3. **Regarder `environment`** : `production`, `preview`, ou `development`. Les erreurs `preview` n'exigent pas d'intervention immédiate.
4. **Regarder le taux d'occurrence** : une erreur qui touche 100+ utilisateurs sur 1 heure est une incidente, une erreur isolée est souvent un cas limite.
5. Reproduire si possible en local avec l'URL et les paramètres de la breadcrumb.
6. **Assigner l'issue Sentry** à la personne qui a poussé le commit responsable (lien commit dans le release).
7. Après fix, **résoudre l'issue Sentry** en cochant `Resolve in next release`. Elle se fermera automatiquement si elle ne revient pas sur la release suivante.

### 4.1 Erreurs à ignorer en priorité

Les erreurs suivantes sont déjà filtrées côté SDK (`ignoreErrors` dans `src/instrumentation.ts` et `src/instrumentation-client.ts`) :

- `NEXT_REDIRECT`, `NEXT_NOT_FOUND`, `DYNAMIC_SERVER_USAGE` — patterns de flow Next.js, pas de vrais bugs.
- `ResizeObserver loop limit exceeded` — bug Chromium connu, inoffensif.
- `AbortError`, `Network request failed` — l'utilisateur a annulé ou perdu sa connexion.

Si une erreur de ces catégories remonte malgré tout, il y a probablement une variante à ajouter à la liste.

---

## 5. Tests en local avant déploiement

```bash
# 1. Installer les nouvelles dépendances
npm install

# 2. Vérifier que la build passe sans DSN (Sentry doit se désactiver proprement)
unset NEXT_PUBLIC_SENTRY_DSN
npm run build

# 3. Vérifier que la build passe AVEC un DSN de test (doit wrapper next.config.ts sans erreur)
NEXT_PUBLIC_SENTRY_DSN="https://test@o0.ingest.sentry.io/0" SENTRY_ORG="test-org" SENTRY_PROJECT="test-project" npm run build

# 4. Vérifier le typecheck
npm run typecheck
```

La CI valide lint + typecheck + format + tests unitaires : si ces 4 jobs passent sur le PR, la build est sûre.

---

## 6. Désactivation d'urgence

### 6.1 Désactiver Sentry sans redéployer

Mettre `NEXT_PUBLIC_SENTRY_ENABLED=false` dans les variables d'environnement Vercel de production et redéployer. Ou plus radical : supprimer `NEXT_PUBLIC_SENTRY_DSN`. Dans les deux cas, `src/instrumentation.ts` et `src/instrumentation-client.ts` sortent tôt et aucun event n'est envoyé.

### 6.2 Désactiver les notifications workflow

Supprimer le label associé (`sync-*-failure`) fait taire les futures issues jusqu'à recréation manuelle du label. Le workflow continue de tourner mais l'issue ne sera plus créée. À utiliser uniquement pour éteindre un incident bruyant pendant une intervention longue — pas comme solution permanente.

---

## 7. Évolutions prévues (non incluses dans cette passe)

- Remplacer `'unsafe-inline'` dans la CSP par des nonces (cf. audit technique).
- Budget + circuit-breaker sur les appels Anthropic.
- Base de dev isolée de la production (actuellement `.env` pointe vers la prod).

Ces chantiers sont suivis séparément et ne sont pas couverts par ce runbook.
