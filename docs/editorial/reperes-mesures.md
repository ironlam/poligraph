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
4. La publication du repère et son rattachement à une révision sont deux décisions humaines
   distinctes.

Une suggestion n'est jamais publique. Le site affiche uniquement un rattachement `APPROVED` vers
un repère actif et `PUBLISHED`. Chaque création, publication, suggestion et décision produit une
entrée dans `AuditLog`.

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

## Limites

La détection ne consulte pas le Web et ne produit pas de définition. Un terme nouveau demande donc
une recherche éditoriale séparée. La liste de domaines officiels est volontairement restrictive ;
un nouvel organisme public doit être ajouté avec un test avant de pouvoir servir de source.
