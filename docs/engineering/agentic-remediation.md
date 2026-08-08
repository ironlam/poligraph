# Protocole de remédiation agentique

Ce protocole est obligatoire pour tout lot identifié par `SEC-*`, `CI-*`, `DB-*`, `UX-*` ou
`AGENT-*`. Le registre de référence se trouve dans
[`docs/audits/security-ux-baseline-2026-08.md`](../audits/security-ux-baseline-2026-08.md).

Une même personne peut piloter le lot, mais un agent ou contexte ne peut pas auto-certifier sa
propre modification. Les rôles Scout, Implementer et Verifier décrivent des responsabilités. Le rôle
Adversary et la vérification finale doivent utiliser un second contexte suffisamment indépendant
pour contester les hypothèses de l'implémentation.

## 1. Scout

Le Scout :

- lit le code et les règles du dépôt ;
- reproduit le problème sans action dangereuse ;
- recherche les appels, consommateurs, dépendances et voies alternatives ;
- mesure si nécessaire ;
- produit une analyse de root cause fondée sur des preuves ;
- délimite les invariants et le hors-périmètre ;
- ne modifie pas le code.

Le rapport du Scout cite les fichiers et lignes pertinents, les commandes reproductibles, les
hypothèses non confirmées et les données qui ne doivent pas être copiées dans la PR.

## 2. Reproduction

Avant la correction, produire si possible un test qui échoue avec le comportement actuel. Le test
doit démontrer l'invariant violé, pas seulement refléter la forme actuelle de l'implémentation.

Pour une vulnérabilité :

- reproduire uniquement dans un environnement de test ou isolé ;
- n'effectuer aucune action dangereuse contre un service externe ou la production ;
- utiliser des payloads inoffensifs et minimaux ;
- encoder la reproduction dans un test automatisé ;
- conserver la preuve avant sans secret ni donnée personnelle.

Si un test automatisé est impossible, la PR explique pourquoi et fournit une procédure manuelle
reproductible, bornée et sûre.

## 3. Implementer

L'Implementer :

- corrige uniquement le finding concerné ;
- choisit la correction minimale qui préserve les invariants ;
- conserve ou améliore la traçabilité des sources ;
- ne transforme pas le lot en refactoring sans rapport ;
- documente les compromis et les éléments laissés hors périmètre.

Une modification découverte mais indépendante reçoit un finding ou une PR séparée. Les sorties LLM
sont toujours traitées comme des données non fiables.

## 4. Adversary

Un second contexte ou agent examine la correction sans se limiter à relire la justification de
l'Implementer. Il cherche activement :

- un bypass ou un payload alternatif ;
- une régression métier ;
- une régression éditoriale ;
- une mauvaise hypothèse sur les données ou les appels ;
- une régression responsive ou d'accessibilité si le lot touche l'UI ;
- une régression de performance si le lot touche la base de données.

L'Adversary produit des scénarios concrets, distingue les blocages des suggestions et référence les
invariants concernés. L'Implementer traite les blocages, puis le Verifier rejoue les preuves.

## 5. Verifier

Le Verifier choisit les contrôles proportionnés au lot parmi :

- TypeScript ;
- ESLint ;
- Prettier ;
- tests unitaires ;
- tests de sécurité ;
- build ;
- tests DB ;
- Playwright ;
- axe ;
- mesures SQL.

Seuls les contrôles pertinents sont lancés pendant l'itération. La suite CI standard est exécutée
avant la PR. Le Verifier consigne les commandes exactes, leur résultat et les contrôles non lancés
avec leur justification. Il confirme aussi que le diff reste dans le périmètre annoncé.

## 6. PR

Chaque PR de remédiation documente :

- Finding ;
- Root cause ;
- Scénario de régression ou attaque ;
- Preuve ou reproduction avant ;
- Correction ;
- Tests après ;
- Invariants concernés ;
- Éléments hors périmètre ;
- rollback si le changement est risqué.

Une PR DB ajoute la métrique ou l'`EXPLAIN` avant et après. Une PR UI ajoute une vérification mobile
et desktop pertinente. Les résultats du second contexte sont visibles dans la description ou dans
la revue.

## Règles de travail

- Un agent ne doit pas auto-certifier sa propre modification.
- Aucune modification directe de la production ne sert à faire correspondre la production au code.
- Les changements DB permanents sont versionnés.
- Supabase production peut être interrogé en lecture pour mesurer lorsque les outils disponibles le
  permettent. Les résultats sensibles restent hors du dépôt et de la PR.
- Les expérimentations utilisent un environnement isolé.
- PostgreSQL 17 sous Docker est privilégié pour les tests DB locaux.
- Une recommandation Supabase Advisor ne devient jamais un changement automatique sans analyse.
- Une requête n'est pas optimisée uniquement parce qu'un index semble manquer.
- Toutes les sorties LLM sont considérées comme non fiables.
- Les règles éditoriales de Poligraph restent prioritaires sur les optimisations techniques.
- Les critères sont appliqués de façon identique à tous les partis et toutes les personnes.
- Aucun changement de donnée judiciaire ne contourne les guards de publication, de matching ou de
  présomption d'innocence.

## Séquence et preuves minimales

| Phase        | Entrée             | Sortie obligatoire                      | Écrit du code  |
| ------------ | ------------------ | --------------------------------------- | -------------- |
| Scout        | Finding versionné  | Root cause, périmètre, appels, mesure   | Non            |
| Reproduction | Root cause         | Test rouge ou procédure sûre justifiée  | Test seulement |
| Implementer  | Preuve avant       | Correction minimale et tests ciblés     | Oui            |
| Adversary    | Diff et invariant  | Tentatives de bypass et régressions     | Non par défaut |
| Verifier     | Diff révisé        | Résultats indépendants et CI standard   | Non par défaut |
| PR           | Toutes les preuves | Description complète et rollback adapté | Non            |

Le finding ne peut être déclaré `Vérifié` que lorsque la preuve avant échoue sur le comportement
vulnérable, passe après correction, et que le second contexte n'a plus de blocage ouvert.
