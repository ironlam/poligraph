# Repères pour comprendre les mesures

Les repères expliquent un sigle, un mécanisme juridique, un dispositif administratif ou un terme
employé dans un sens technique. Ils ne résument pas la mesure et ne portent aucun jugement sur son
coût, sa faisabilité ou son opportunité.

## Séparation des responsabilités

1. Mistral détecte des termes candidats dans la formulation et le contexte déjà publié.
2. Une correspondance exacte avec le libellé ou un alias peut rattacher la suggestion à un repère
   existant. Une suggestion inconnue reste conservée sans définition.
3. Une personne rédige ou vérifie le repère à partir de la source du programme ou d'une source
   institutionnelle officielle.
4. La publication du repère et son rattachement à une révision sont des décisions humaines. Elles
   peuvent être prises séparément dans l'administration ou réunies dans une commande de
   finalisation après la lecture humaine du lot.

Une suggestion n'est jamais publique. Le site affiche uniquement un rattachement `APPROVED` vers
un repère actif et `PUBLISHED`. Chaque création, publication, suggestion et décision produit une
entrée dans `AuditLog`.

Une source de programme doit être une source primaire de type programme de parti, programme de
candidature ou propositions de candidature déjà rattachée à la révision. Une interview ou un
article de presse ne peut pas être présenté comme une source de programme.

Un repère publié dont la définition ou la source devient incorrecte peut être désactivé depuis
`/admin/mesures/reperes`. La désactivation est auditée, le retire immédiatement des pages publiques
et resynchronise les documents de recherche concernés. Une définition corrigée est ensuite créée et
validée comme un nouveau repère, afin de conserver l'historique de la version retirée.

## Synchroniser le catalogue

Le catalogue relu dans `src/config/measure-reader-guides.ts` crée des brouillons et ne remplace
jamais un repère déjà publié.

```bash
npm run measures:sync-reader-guides
npm run measures:sync-reader-guides -- --apply
```

Les brouillons sont relus puis publiés dans `/admin/mesures/reperes`.

## Analyser le corpus

Le script est cursorisé. Le dry-run ne produit aucune écriture et place son rapport dans
`scripts/.local/`, qui est ignoré par Git.

```bash
npm run measures:detect-reader-guides -- \
  --election presidentielle-2027 \
  --limit 100 \
  --dry-run

npm run measures:detect-reader-guides -- \
  --election presidentielle-2027 \
  --limit 100 \
  --after IDENTIFIANT \
  --apply
```

L'application crée uniquement des suggestions. Leur validation se fait sur la fiche admin de la
mesure. Une validation resynchronise le document de recherche concerné et invalide uniquement les
caches de cette mesure et de son élection.

## Finaliser un lot relu

Pour un petit volume, l'administration permet de publier un repère puis d'approuver chaque
rattachement séparément. Après avoir lu un lot important, une commande regroupe ces opérations.
Elle publie les brouillons déjà complets et sourcés, résout les termes par libellé ou alias, puis
approuve les rattachements correspondants. Chaque opération conserve son audit, sa synchronisation
de recherche et son invalidation de cache.

La simulation est sans écriture et produit un rapport dans `scripts/.local/` :

```bash
npm run measures:finalize-reader-guides -- \
  --election presidentielle-2027 \
  --all \
  --dry-run
```

Chaque proposition du rapport contient le texte de la mesure, l'extrait probant et la raison de
détection, en plus du repère proposé. Ces éléments participent à l'empreinte du lot relu.

Après lecture du rapport et du lot, une seule commande finalise toutes les entrées prêtes :

```bash
npm run measures:finalize-reader-guides -- \
  --apply \
  --confirm-reviewed \
  --report scripts/.local/reader-guide-finalization-IDENTIFIANT.json
```

La même commande peut être relancée après une interruption. Les décisions déjà appliquées sont
ignorées et le reste du rapport relu est repris, sans intégrer de nouvelle suggestion.

`--confirm-reviewed` indique que la personne qui lance la commande assume la validation
éditoriale du lot. La commande ne crée jamais une définition à partir d'un simple terme. Les
suggestions sans repère correspondant et les brouillons incomplets restent dans le rapport pour
traitement ultérieur. `--limit` et `--after` permettent de limiter ou reprendre un lot, mais ne se
combinent pas avec `--all`. L'application reprend exclusivement le rapport fourni et s'arrête si
une suggestion ou un repère a changé depuis le dry-run.

## Publication et maillage public

Le site construit le glossaire public à partir des mesures publiques, jamais directement à partir
du catalogue. Un repère apparaît seulement si son statut est `PUBLISHED`, s'il a été relu et si au
moins une mention `APPROVED` existe sur la révision publiée d'une mesure encore défendue par une
candidature publique.

Chaque page de repère relie la définition à sa source, aux mesures qui emploient le terme, aux
candidats concernés et aux pages thématiques. Les fiches de mesure et les pages thématiques font le
lien inverse. Le hub ne montre qu'une sélection bornée de repères afin de ne pas devenir un nuage de
mots sans hiérarchie.

Une définition trop courte ou un repère sans mesure publique reste en `noindex,follow` et n'entre
pas dans le sitemap. La page d'ensemble suit la même règle tant qu'aucun repère ne produit une page
substantielle. Cette porte est centralisée dans `src/lib/seo/reader-guide-robots.ts`.

## Limites

La détection ne consulte pas le Web et ne produit pas de définition. Un terme nouveau demande donc
une recherche éditoriale séparée. La liste de domaines officiels est volontairement restrictive ;
un nouvel organisme public doit être ajouté avec un test avant de pouvoir servir de source.
