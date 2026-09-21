# Suspension des écritures RNE maires

Cartographie du code au 20 septembre 2026, base `bf01c27b`.

Le rapprochement des maires utilise le code INSEE de la commune comme s'il
identifiait une personne. En cas de succession, l'import peut réécrire le mandat
et la date de naissance du prédécesseur. Les écritures sont donc suspendues à
l'entrée du service, avant toute requête. Ce verrou ne corrige pas l'identité
et ne répare aucune donnée déjà importée.

## Chemins d'entrée

| Entrée                                      | Chemin vers les écritures                                                                                                                                                                   | Effet du verrou                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Commande manuelle `npm run sync:rne:maires` | `package.json` → `scripts/sync-rne.ts` → `syncRNEMaires()`                                                                                                                                  | Erreur `RNE_WRITES_SUSPENDED`, code de sortie 1.                                                                |
| Script direct `tsx scripts/sync-rne.ts`     | Même handler CLI et même service.                                                                                                                                                           | Même refus, y compris avec `--limit` ou `--force`.                                                              |
| Orchestrateur `npm run sync:full`           | `scripts/sync-full.ts`, étape « RNE (maires) » → script RNE.                                                                                                                                | Étape en échec ; l'orchestrateur poursuit les autres étapes puis sort en échec.                                 |
| GitHub Actions                              | `.github/workflows/sync-rne.yml`, déclenchement manuel `workflow_dispatch`, sans cron → commande npm.                                                                                       | Échec si la révision exécutée contient le verrou.                                                               |
| Import direct du service                    | `src/services/sync/rne.ts`, également réexporté par `src/services/sync/index.ts`.                                                                                                           | Même verrou, sans dépendre du CLI.                                                                              |
| Mode `--resolve-parties`                    | Le CLI appelle séparément `resolveParties()`, qui associe aussi les profils par commune.                                                                                                    | Écritures suspendues, même avec `--dry-run` : cette fonction ne possède pas de mode lecture.                    |
| Inngest                                     | Aucun handler RNE dans `src/inngest/index.ts` ni les fonctions enregistrées. `scripts/trigger.ts` peut envoyer un nom d'événement libre, sans créer de handler.                             | Aucun chemin vers ce service trouvé dans le code audité.                                                        |
| Routes API                                  | Aucun appel au service. `/api/inngest` expose les fonctions enregistrées. `/api/admin/syncs` accepte un nom de script et envoie un événement, mais aucun consommateur RNE n'est enregistré. | Aucun chemin vers ce service trouvé dans le code audité. Accepter un événement ne signifie pas exécuter le RNE. |
| Tableau des pipelines                       | `src/config/pipeline-registry.ts` affiche une commande manuelle.                                                                                                                            | Ce registre n'exécute pas la commande.                                                                          |

`sync:rne:arrondissements` appelle un autre service,
`syncArrondissementMayors()`, pour `MAIRE_ARRONDISSEMENT`. Il n'appelle pas
`syncRNEMaires()` et n'est pas couvert par ce verrou. Ceci n'est pas un gel
général des écritures sur les élus ou leurs mandats.

## Lecture encore disponible

- `npm run sync:rne:maires -- --stats` : compteurs en base, sans import.
- `npm run sync:rne:maires -- --dry-run --limit=100` : lectures en base,
  téléchargement et parsing du CSV, sans rapprochement ni écriture.
- Au niveau service, seul le booléen strict `dryRun: true` est admis.

Le dry-run existant affiche des compteurs prévisionnels « created ». Ce n'est
ni une preuve de création, ni une simulation fiable des successions. Il saute
le rapprochement, la clôture et la notification de plateforme.

Il n'existe aucune variable d'environnement ni option `--force` permettant
de réactiver les écritures. Lever le verrou nécessite une modification de code
revue avec le futur correctif d'identité.

## Activation et limites opérationnelles

Une branche ou une PR ne protège pas les anciens checkouts. Le confinement
n'est actif pour une exécution que si elle charge la révision contenant le
verrou. Un processus déjà démarré conserve son ancien code.

Avant de considérer la protection opérationnelle comme acquise :

1. Fusionner le verrou après validation des tests.
2. Mettre à jour chaque checkout utilisé pour les commandes manuelles et
   `sync:full`. Ne lancer aucun import manuel sur une ancienne révision.
3. Vérifier l'absence de processus RNE déjà actifs et de workflows en attente
   sur une ancienne révision. Ne pas relancer un ancien run GitHub Actions.
4. Si un service déployé expose ultérieurement le RNE, déployer aussi la
   révision protégée avant de l'activer.

Cette cartographie porte sur le dépôt, pas sur l'inventaire des machines,
processus externes ou fonctions historiques encore déployées. Elle ne prouve
pas à elle seule que le confinement est actif en production.

## Vérification

Les tests `rne-write-lock.test.ts` utilisent un CSV fictif et des doubles de
la base et du réseau. Ils vérifient le refus avant I/O, les options non typées,
le chemin CLI, le writer partisan indépendant, les statistiques et le dry-run.
Toute opération de base autre que les lectures autorisées fait échouer le test.

Le correctif d'identité reste une étape distincte, après ce confinement.
