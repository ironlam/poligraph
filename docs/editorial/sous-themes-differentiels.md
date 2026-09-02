# Analyse différentielle des sous-thèmes

## Objectif

L'ajout d'un sous-thème ne doit pas provoquer une reclassification aveugle du corpus ni écraser les
décisions éditoriales existantes. Le workflow différentiel sélectionne un lot borné de mesures,
demande une décision structurée à Mistral et produit un rapport local avant toute écriture.

Une attribution créée par ce workflow reste `SUGGESTED`. Elle n'est jamais approuvée, publiée ou
rendue visible automatiquement.

## Ajouter un sous-thème

1. Ajouter sa définition dans `src/config/measure-subtopics.ts`.
2. Incrémenter `MEASURE_SUBTOPIC_TAXONOMY_VERSION` et conserver la version précédente.
3. Définir ses alias, son périmètre de classification et, si nécessaire, les sous-thèmes voisins
   utilisés pour la sélection différentielle.
4. Utiliser `syncMeasureSubtopicTaxonomy()`. Aucun SQL ponctuel n'est nécessaire.

Le modèle actuel impose un thème parent unique. Un sous-thème transversal reste donc rattaché à un
seul thème principal tant qu'une évolution explicite du modèle n'a pas été décidée.

## Simulation

```bash
npm run measures:classify-subtopic-delta -- \
  --subtopic racisme-antisemitisme \
  --election presidentielle-2027 \
  --limit 500 \
  --dry-run
```

La commande parcourt au maximum le nombre de mesures indiqué par `--limit`. Elle sélectionne les
candidates à partir des éléments suivants :

- présence du libellé ou d'un alias dans la formulation ou le contexte ;
- rattachement à un sous-thème voisin configuré ;
- résultat de l'index lexical public existant ;
- échantillon témoin déterministe parmi les mesures restantes.

Chaque mesure sélectionnée reçoit une décision `APPLIES`, `DOES_NOT_APPLY` ou `UNCERTAIN`, une
confiance bornée, une justification et un extrait provenant de la mesure. Seule une décision
`APPLIES` peut devenir une suggestion lors de l'application.

Le rapport JSON est écrit dans `.tmp/measure-subtopic-delta/`, qui est ignoré par Git. Son chemin et
le prochain curseur sont affichés en fin d'exécution. Pour reprendre le corpus :

```bash
npm run measures:classify-subtopic-delta -- \
  --subtopic racisme-antisemitisme \
  --election presidentielle-2027 \
  --limit 500 \
  --after IDENTIFIANT_AFFICHE \
  --dry-run
```

Le dry-run ne synchronise pas la taxonomie et n'écrit rien en base. Il conserve notamment la
version de taxonomie, les paramètres, les signaux de sélection, les décisions, les erreurs et une
empreinte des révisions analysées.

## Application après validation du rapport

L'application relit exactement le rapport produit par le dry-run. Elle ne rappelle pas le modèle.
Elle refuse le lot si la taxonomie, les paramètres, une révision ou son empreinte ont changé.

```bash
npm run measures:classify-subtopic-delta -- \
  --apply \
  --report .tmp/measure-subtopic-delta/IDENTIFIANT.json
```

Avant une application sur la base de production, suivre le workflow `dbwrite` : simulation à jour,
liste des identifiants, sauvegarde et confirmation humaine explicite.

L'application :

- conserve toutes les attributions existantes, y compris `APPROVED` ;
- ne supprime ni ne remplace aucun autre sous-thème ;
- crée uniquement des attributions `SUGGESTED` pour les décisions `APPLIES` ;
- enregistre l'identifiant d'exécution, les versions, les raisons de sélection, la justification et
  l'extrait probant dans le journal d'audit ;
- reste idempotente si le même rapport est appliqué une seconde fois.

## Validation humaine et recherche

Les suggestions sont traitées dans :

```text
/admin/mesures?enrichissement=SUBTOPICS_PENDING
```

L'approbation existante écrit son propre audit, synchronise le `SearchDocument` de la mesure et
invalide ses caches. Aucun réindex global n'est nécessaire. Une suggestion refusée reste invisible
publiquement et ne déclenche pas de synchronisation de l'index public.
