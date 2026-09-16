# Lectures des sujets et du comparateur présidentiel

## Décision et périmètre

Investigation locale depuis `329ce33d` (16 septembre 2026). Le signal de production
désigne `presidential.subject.load`, qui regroupait les pages de thèmes et le
comparateur filtré. Les 91,2 % du périmètre web observé ne peuvent pas être
attribués au seul comparateur. Aucun gain de production n'est encore mesuré.

La reproduction PostgreSQL montre que le comparateur charge toutes les mesures
du thème, leurs preuves d'extraction, leur glossaire et leurs relations aux votes,
avant de retenir trois candidatures au plus et six mesures par candidature.

Deux changements ciblés :

- `getPublicMeasuresByTheme` sélectionne les champs du DTO public. Il conserve
  détails, sources, qualifications, retraits, sous-thèmes et guides ; les champs
  internes, dont `evidenceSnapshot`, ne traversent plus le driver.
- Le comparateur lit les métadonnées communes et les totaux groupés, puis applique
  `skip`/`take` dans PostgreSQL pour chaque candidature sélectionnée. Seuls les
  champs utilisés dans ses colonnes sont sélectionnés. Aucune relation aux votes
  ni mention de glossaire n'est chargée pour ce parcours.

Les pages de thèmes gardent leur contenu complet : leur nombre de lignes reste
proportionnel au contenu affiché. Aucun changement de schéma ni nouvel index.

## Mesures synthétiques

Node 22 Docker, PostgreSQL 17 jetable, Prisma du lockfile. Trois élections
synthétiques indépendantes. Chaque mesure porte deux sources, une qualification,
un sous-thème approuvé, une mention de guide et une preuve interne de 4 096
caractères. La deuxième mesure de chaque candidature est retirée. La sélection
est de deux candidatures, page 2 pour la première et page 1 pour la seconde.
Les hooks de cache sont neutralisés dans Vitest : chaque chargement s'exécute.

Les octets ci-dessous sont ceux des tableaux de lignes sérialisés par l'observateur
de test #881 au retour de node-postgres. Ce ne sont ni des octets du protocole
PostgreSQL, ni une mesure de l'egress facturé. Aucune sérialisation de mesure
de taille n'est ajoutée au runtime.

| Candidatures × mesures | Parcours    | Requêtes avant/après | Lignes avant/après | Octets de test avant/après (environ) |
| ---------------------- | ----------- | -------------------- | ------------------ | ------------------------------------ |
| 4 × 12                 | Thème       | 20 / 20              | 356 / 356          | 323 499 / 108 150                    |
| 4 × 60                 | Thème       | 20 / 20              | 1 700 / 1 700      | 1 602 426 / 525 700                  |
| 8 × 12                 | Thème       | 20 / 20              | 704 / 704          | 645 529 / 214 800                    |
| 4 × 12                 | Comparateur | 21 / 21              | 357 / 93           | 323 530 / 10 915                     |
| 4 × 60                 | Comparateur | 21 / 21              | 1 701 / 93         | 1 602 457 / 10 920                   |
| 8 × 12                 | Comparateur | 21 / 21              | 705 / 109          | 645 560 / 13 250                     |

Sur la fixture de 240 mesures, le comparateur reçoit environ 94,5 % de lignes
en moins et 99,3 % d'octets de test en moins. Le thème reçoit environ 67 %
d'octets en moins, avec autant de lignes et le même DTO.

Décomposition de la page de thème avant correction, fixture 4 × 60 :

| Lecture                | Requêtes | Lignes | Octets de test |
| ---------------------- | -------: | -----: | -------------: |
| Candidatures publiques |        5 |     12 |          2 199 |
| Mesures et relations   |        8 |  1 682 |      1 599 981 |
| Deux compteurs         |        2 |      2 |             14 |
| Dernière relecture     |        2 |      2 |            122 |
| Index des thèmes       |        2 |      2 |            108 |
| Relations aux votes    |        1 |      0 |              2 |

Une page sélectionnée de six mesures reçoit 37 lignes via six requêtes et
environ 4,2 Ko sérialisés. Les relations publiques de ces six mesures restent
variables : le budget ne promet pas de borner le nombre de sources ou de
qualifications attachées au contenu effectivement affiché.

Durées indicatives de la première passe, fixture 4 × 60 : thème 49,4 ms avant,
34,1 ms après ; comparateur 42,3 ms avant, 12,3 ms après. Mesures locales uniques,
sensibles aux caches PostgreSQL, au démarrage et à la charge de la machine :
aucun seuil temporel CI et aucune promesse de latence en production.

## Parité et budgets

`subject-reads.performance.integration.test.ts` compare le DTO du thème à la
lecture complète historique sur la même fixture, et les colonnes du comparateur
aux mesures de cette page découpées en mémoire. Il vérifie également sources,
qualifications, retrait, totaux, date de relecture, navigation et ordre.

`subject-page.integration.test.ts` couvre les candidatures non publiées, les
brouillons, les mesures dépubliées, les thèmes sous le seuil et la candidature
sans mesure. La nouvelle lecture reprend `PUBLIC_MEASURE_WHERE` et
`PUBLIC_CANDIDACY_WHERE`, avec les retraits inclus. L'ordre reste `createdAt ASC` ;
`id ASC` départage désormais les créations simultanées pour stabiliser les pages.

Budgets CI sur les fixtures :

- Deux candidatures affichées : au plus 21 requêtes et 15 000 octets de test.
- À population et page constantes, multiplier les mesures par cinq n'augmente
  pas les lignes du comparateur ; tolérance de 256 octets pour les compteurs,
  dates et identifiants synthétiques.
- La lecture d'une page reste à six requêtes, au plus 40 lignes et 5 000 octets.
  Ni les mesures hors page ni les candidatures hors sélection ne la font croître.
- La liste complète de choix et les totaux par candidature sont nécessaires.
  Doubler les candidatures autorise quatre lignes de métadonnées par candidature
  supplémentaire, mais aucune croissance du contenu de la page sélectionnée.
- La projection du thème doit rester sous 50 % des octets de la projection
  historique sur ces fixtures à preuves internes lourdes.

Le nombre de requêtes du comparateur dépend du nombre de colonnes non vides :
neuf pour le contexte et la résolution de l'élection, puis six par colonne
sur cette fixture. Trois colonnes peuvent donc coûter 27 requêtes à froid,
contre 21 avant. C'est un compromis explicite pour transférer seulement le
contenu visible. Les agrégats et les `OFFSET` peuvent toujours parcourir des
lignes côté serveur ; des lignes reçues constantes ne prouvent pas un coût CPU
constant dans PostgreSQL.

Le job CI `presidential-measure-loads-postgres` exécute les tests #881 et ces
deux suites, valide qu'elles ne sont ni absentes ni ignorées, et conserve
`subject-read-metrics.json` avec les métriques détaillées. Pour reproduire,
utiliser les commandes Docker sécurisées de
[postgres-read-telemetry.md](postgres-read-telemetry.md#vérification-locale),
puis lancer la liste de fichiers et le validateur du job. Les trois variables
`DATABASE_URL`, `DIRECT_URL` et `DOTENV_CONFIG_PATH=/dev/null` restent ensemble.

## Cache et attribution après déploiement

La page de thème garde sa frontière existante. Le comparateur a un cache de
contexte par élection et thème, et un cache par candidature publique, thème et
page. Les candidatures inconnues sont exclues et les pages normalisées avant
la clé de cache ; les paramètres libres de l'URL n'y entrent pas. Les deux
frontières utilisent `synced` et les mêmes tags `election-measures:<id>` et
`election-candidacies:<id>`. Aucune configuration de télémétrie dans les clés.
Les tests vérifient les tags, pas le taux réel de réutilisation des instances Next.

Deux noms fermés distinguent les chargements réellement exécutés après défaut
de cache : `presidential.comparison.context.load` et
`presidential.comparison.page.load`. Le second compte une page d'une candidature,
pas une requête HTTP ni un comparateur complet. Le premier peut avoir un enfant
`presidential.themes.load` ; additionner les compteurs exclusifs une seule fois.
La résolution de l'élection reste hors instrumentation, comme avant.

La fréquence de `presidential.subject.load` change de sens : le comparateur
n'en fait plus partie. Ne pas annoncer une réduction de lectures uniquement
parce que ce nom diminue. Pour comparer les releases :

1. Vérifier le SHA déployé et les nouvelles opérations sur des chargements à froid.
2. Conserver régulièrement les exports, puis assembler 24 à 48 h complètes par
   release, avec les synchronisations. Écarter les fenêtres incomplètes ou
   saturées et appliquer `1/sampleProbability` aux compteurs exploitables.
3. Pour le volume total attribué aux deux parcours, comparer l'ancien groupe
   racine `presidential.subject.load` à la somme des groupes racines sujet,
   contexte du comparateur et pages du comparateur, enfants compris une seule
   fois. Conserver les contextes web, build et scheduled séparés.
4. Pour lignes par chargement, fréquence et durée, afficher séparément les
   nouvelles opérations. L'ancienne fenêtre ne permet pas de reconstituer un
   avant/après propre au comparateur. Les durées de ses chargements parallèles
   ou imbriqués ne doivent pas être additionnées comme latence HTTP.
5. Examiner séparément l'egress quotidien Supabase, avec unité, fuseau et
   ventilation identiques. Aucun pourcentage local ci-dessus ne prédit une
   réduction de facture.

Pistes distinctes si les mesures ultérieures le justifient : projection des
métadonnées de candidature, indexation des pages SQL profondes, et cache partagé
entre instances. Aucune de ces modifications n'est incluse ici.
