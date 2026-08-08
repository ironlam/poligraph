# Baseline sécurité, architecture, performance et UX, août 2026

Ce document est le registre versionné des constats retenus pour la remédiation agentique de
Poligraph. Il décrit des risques et des invariants cibles. Il ne vaut ni preuve d'exploitation en
production, ni autorisation de modifier la production, ni correction des constats.

## Métadonnées du baseline

| Champ                      | Valeur                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Lot                        | `AGENT-00`                                                                         |
| Date de référence          | 8 août 2026                                                                        |
| Révision du code inspectée | `a24fcc13`                                                                         |
| Branche de référence       | `origin/main`                                                                      |
| État initial des constats  | À instruire                                                                        |
| Protocole obligatoire      | [`docs/engineering/agentic-remediation.md`](../engineering/agentic-remediation.md) |

Les preuves ci-dessous sont des points de départ observés dans le dépôt. Le Scout de chaque lot
doit les revérifier sur le code et, si nécessaire, sur un environnement de mesure autorisé. Une
affirmation sur les données de production doit être confirmée par une mesure en lecture seule.

## États du registre

- `À instruire` : contexte initial versionné, reproduction et périmètre à confirmer.
- `Confirmé` : reproduction sûre ou mesure disponible.
- `En remédiation` : PR dédiée ouverte.
- `Vérifié` : correction testée par un contexte distinct de celui qui l'a implémentée.
- `Clos` : correction fusionnée et preuve après archivées.
- `Accepté` : risque explicitement accepté, avec responsable, justification et date de revue.

Un finding ne passe pas directement de `À instruire` à `Clos`. Les preuves avant et après restent
liées à son identifiant dans la PR de remédiation.

## Vue d'ensemble

| Identifiant | Priorité               | Domaine              | État initial | Invariant principal                                          |
| ----------- | ---------------------- | -------------------- | ------------ | ------------------------------------------------------------ |
| `SEC-01`    | P0                     | Sécurité applicative | À instruire  | Aucun HTML ou attribut exécutable issu d'un texte non fiable |
| `SEC-02`    | P0                     | Contrôle d'accès     | À instruire  | Aucune donnée non publiée par une voie alternative           |
| `SEC-03`    | P1                     | Supabase             | À instruire  | Surface publique explicitement minimale                      |
| `SEC-04`    | P1                     | Authentification     | À instruire  | Sessions admin séparées, révocables et fail-closed           |
| `CI-01`     | P1                     | CI                   | À instruire  | Chaque guard critique est testé en positif et en négatif     |
| `CI-02`     | P1                     | Qualité              | À instruire  | Les scripts sensibles passent une analyse statique adaptée   |
| `SEC-05`    | P1                     | Chaîne logicielle    | À instruire  | Dépendances et actions font l'objet de contrôles versionnés  |
| `DB-01`     | À prioriser par mesure | Performance DB       | À instruire  | Calculer seulement le travail nécessaire                     |
| `DB-02`     | Continu                | Performance DB       | À instruire  | Prioriser fréquence, coût et impact utilisateur              |
| `UX-01`     | P1                     | UX et qualité        | À instruire  | Les défauts récurrents deviennent des contrats sémantiques   |
| `AGENT-01`  | P1                     | Gouvernance          | À instruire  | Les règles critiques sont dérivables, testables ou vérifiées |

## Findings P0

### SEC-01: Eliminate Markdown stored-XSS path

**Contexte observé.** `src/components/ui/markdown.tsx` construit une chaîne HTML puis la transmet
à `dangerouslySetInnerHTML`. Le renderer échappe actuellement `&`, `<` et `>`, mais génère aussi
des attributs `href` à partir du texte Markdown sans échapper les guillemets. Il est utilisé pour
des contenus éditoriaux, externes ou produits par des pipelines IA. Toute sortie LLM est une donnée
non fiable.

**Invariant cible.** Aucun texte éditorial, externe ou généré par IA ne doit pouvoir injecter du
HTML ou des attributs exécutables dans l'application.

**Preuve attendue avant correction.** Un test automatisé, avec des payloads inoffensifs, démontre
qu'un texte non fiable ne peut créer ni élément HTML arbitraire, ni gestionnaire d'événement, ni URL
exécutable, y compris dans le texte et la destination d'un lien.

**Critères de clôture.** Le renderer repose sur une construction sûre ou une sanitisation éprouvée,
les cas de contournement sont couverts, les usages existants ont été inventoriés, et un Adversary
distinct a testé des payloads alternatifs.

**Mapping.** OWASP A05 Injection. OWASP A08 Software and Data Integrity Failures lorsque la donnée
provient d'un pipeline IA.

### SEC-02: Close unintended Supabase Data API exposure

**Contexte observé.** L'application utilise principalement PostgreSQL via Prisma et aucune
utilisation applicative évidente de `supabase-js` n'a été trouvée. Les fichiers SQL versionnés
activent RLS, mais `prisma/migrations/manual/rls-public-read-policies.sql` définit pour `FactCheck`
une policy `SELECT TO anon USING (true)`. Le modèle `FactCheck` possède `publicationStatus` avec
`DRAFT` par défaut. L'audit signale l'existence de fact-checks non publiés en production, point à
confirmer par une requête en lecture seule avant toute remédiation.

**Invariant cible.** Une donnée non publiée ne doit jamais devenir publiquement accessible par une
voie alternative à l'application.

**Preuve attendue avant correction.** Reproduire sur un environnement isolé les droits effectifs
des rôles Data API et inventorier les tables, vues, colonnes, policies, grants et RPC exposés. Une
mesure de production éventuelle reste strictement en lecture seule et ne contient aucune donnée
sensible dans les artefacts de PR.

**Critères de clôture.** Un test avec le rôle public refuse les fact-checks non publiés et autorise
uniquement la surface publique décidée. Le schéma versionné, l'état déployé et la documentation sont
alignés.

**Mapping.** OWASP A01 Broken Access Control. OWASP A02 Security Misconfiguration.

## Findings P1

### SEC-03: Least-privilege Supabase public surface

**But.** Décider explicitement si la Data API doit exister. Si elle est inutile, la désactiver. Si
elle est nécessaire, n'exposer que les vues, tables et colonnes explicitement publiques, puis revoir
les grants, les policies et les fonctions RPC avec le principe du moindre privilège.

**Investigation attendue.** Inventorier les clients réels, les clés publiques, les schémas exposés,
les privilèges par rôle, les fonctions `SECURITY DEFINER` et les dépendances externes. Ne pas déduire
l'état de production des seuls fichiers SQL manuels.

**Critères de clôture.** La décision d'architecture est documentée, la surface nécessaire est testée
par rôle et tout accès non prévu échoue par défaut.

### SEC-04: Harden admin authentication

**Contexte observé.** Le code actuel utilise `ADMIN_PASSWORD` pour vérifier le mot de passe et comme
clé HMAC d'un cookie de session stateless valable sept jours. L'absence de variable échoue fermée.
Le lot devra vérifier sans présumer de leur absence ou présence :

- la séparation du mot de passe et du secret de session ;
- la durée des sessions ;
- la révocation ;
- une limitation distribuée des tentatives de connexion ;
- le comportement fail-closed en production ;
- une évolution future vers MFA sans réécriture complète.

**Critères de clôture.** Le modèle de menace, les propriétés de session, la rotation et la révocation
sont testés. La correction reste compatible avec l'ajout futur de MFA et ne réduit pas les contrôles
d'accès existants.

### CI-01: Make security guards trustworthy

**Contexte observé.** `.github/workflows/code-quality.yml` contient plusieurs guards utiles. Le guard
`No JSON.parse of user input without try-catch` utilise `grep | while ...`; l'affectation
`FOUND=1` se produit dans un sous-shell Bash et peut être perdue avant `exit $FOUND`.

**Invariant cible.** Chaque guard critique doit disposer d'un cas volontairement invalide qui fait
échouer le guard et d'un cas valide qui passe.

**Critères de clôture.** Les guards critiques sont extraits ou structurés pour être testables, leurs
tests positif et négatif s'exécutent en CI, et les modes d'échec du shell sont explicites.

### CI-02: Bring scripts under static analysis

**Contexte observé.** `eslint.config.mjs` exclut `scripts/**`, alors que ce dossier contient des
importeurs, synchronisations, migrations, purges, backfills et traitements IA. TypeScript inclut la
majorité des fichiers `.ts`, sauf `scripts/tmp-*`, mais cela ne remplace pas les règles ESLint.

**But.** Définir une analyse statique adaptée aux scripts, sans masquer les écarts par une exclusion
globale. Les exceptions nécessaires doivent être étroites, justifiées et testées.

**Critères de clôture.** Les scripts durables passent une configuration versionnée, les scripts
temporaires suivent leur convention de sortie, et les règles de sécurité pertinentes couvrent les
chemins opérationnels.

### SEC-05: Software supply-chain baseline

**Contexte observé.** Les workflows référencent notamment `actions/checkout@v4`,
`actions/setup-node@v4` et `actions/github-script@v7`, sans pinning par SHA. Aucun fichier de
configuration CodeQL, Dependency Review ou Dependabot n'a été trouvé dans `.github/` lors de cette
révision. Le lockfile npm est versionné et les jobs CI utilisent `npm ci`.

**Évaluation attendue.** Évaluer CodeQL, Dependency Review, Dependabot ou équivalent, l'audit des
dépendances et le pinning SHA des GitHub Actions lorsque pertinent. Documenter la cadence, les
responsables, les seuils bloquants, la gestion des faux positifs et la procédure de mise à jour des
SHA.

**Critères de clôture.** Le dépôt possède un baseline reproductible, les alertes ont une voie de
triage, et les choix de non-adoption éventuels sont motivés et datés.

**Mapping.** OWASP A03 Software Supply Chain Failures.

## Performance

### DB-01: Incremental group-position computation

**Contexte de mesure.** L'audit a observé une requête liée au calcul des positions de groupes autour
de 11 à 12 secondes. Cette mesure n'a pas été reproduite dans `AGENT-00`. La requête utilise déjà des
indexes, donc un index supplémentaire n'est pas une conclusion par défaut.

**But.** Réduire la quantité de travail exécutée, notamment par calcul incrémental, projection ou
matérialisation si les mesures le justifient.

**Critères de clôture.** Le lot conserve la requête et le jeu de données de référence, mesure avant
et après, vérifie la fraîcheur des résultats et démontre l'absence de régression fonctionnelle.

### DB-02: Top SQL workload remediation

**Principe.** Prioriser avec `pg_stat_statements` selon fréquence multipliée par coût, puis impact
utilisateur. Une requête lente mais rare ne passe pas automatiquement devant une requête moins lente
qui domine le temps total ou bloque une surface citoyenne importante.

Toute optimisation documente :

1. la mesure avant ;
2. l'hypothèse ;
3. la modification ;
4. la mesure après ;
5. l'absence de régression.

Les mesures de production sont en lecture seule. Les expérimentations et écritures utilisent un
environnement isolé, de préférence PostgreSQL 17 sous Docker.

## UX et qualité

### UX-01: Convert recurring UX defects into semantic contracts

Les défauts récurrents doivent devenir des invariants testables ou des revues explicites :

- `unknown !== false` : une valeur inconnue ne doit pas être rendue comme fausse ;
- un état passé ou futur dérivé de dates ne doit pas être codé en dur ;
- le compteur affiché et la collection rendue partagent le même prédicat ;
- le libellé d'un lien décrit sa destination réelle ;
- un contenu généré par IA n'est pas un contenu vérifié ;
- une information publique importante conserve sa source ;
- un état n'est jamais communiqué uniquement par la couleur ;
- aucun overflow horizontal ne survient à partir de 320 px ;
- aucune nouvelle violation axe sérieuse n'est introduite.

**Critères de clôture.** Chaque invariant possède un emplacement de référence, un moyen de
vérification adapté et au moins un exemple de régression. Les contrats éditoriaux restent
prioritaires sur la compacité ou l'engagement.

## Gouvernance

### AGENT-01: Make AGENTS.md executable/verifiable

**Objectif.** Pour chaque règle critique d'`AGENTS.md`, déterminer progressivement si elle peut être
dérivée automatiquement du code, testée, ou vérifiée en CI. Les règles non automatisables gardent
un responsable et une checklist de revue explicite.

**Risque de dérive.** Une règle documentaire peut décrire une variable, une architecture ou un guard
qui n'existe plus. À l'inverse, le code peut ajouter une nouvelle voie publique ou opérationnelle
sans mise à jour du document. Toute automatisation qui recherche seulement du texte peut aussi
rester verte à cause d'un commentaire alors que l'invariant a disparu du code.

**Critères de clôture.** Un inventaire relie chaque règle critique à sa source de vérité, son test ou
sa revue. La CI détecte les divergences mécanisables et les exceptions sont étroites et justifiées.

## Limites de ce baseline

`AGENT-00` ne corrige aucun finding. Il ne modifie ni comportement produit, ni route, ni modèle
Prisma, ni migration, ni configuration Supabase, ni règle métier. Chaque remédiation reçoit une PR
dédiée et suit le protocole agentique lié ci-dessus.

## Dérive documentaire corrigée dans AGENT-00

`AGENTS.md` et `README.md` citaient encore `ADMIN_TOKEN`. Le code, `.env.example`, les tests visuels
et le script de setup utilisent `ADMIN_PASSWORD`. Ces deux références documentaires ont été
alignées sur le nom réel. Aucun code d'authentification, secret ou comportement de session n'a été
modifié.
