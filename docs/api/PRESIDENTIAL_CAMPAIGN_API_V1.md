# API publique de campagne présidentielle, contrat v1

Ce contrat additif expose le suivi public des candidatures et les mesures présidentielles
publiées. Il ne remplace pas `GET /api/elections/{slug}`, qui reste le contrat générique des
résultats électoraux.

## Principes

- Le suivi décrit des annonces et des hypothèses publiques sourcées. Il ne constitue pas une liste
  officielle de candidatures.
- Chaque candidature exposée possède un statut, une URL de source, un libellé de source et une fiche
  politique publiée.
- Les mesures cumulent le verrou de publication de la mesure, celui de sa révision publiée et celui
  de l'extension présidentielle de la candidature.
- Le contrat ne produit aucun score, classement, comparaison normative ou recommandation.
- Les réponses ne contiennent aucun champ de modération ou d'administration.

## GET `/api/elections/{slug}/candidacies`

### Paramètres

| Paramètre              | Valeurs                                      | Défaut |
| ---------------------- | -------------------------------------------- | ------ |
| `status`               | `DECLARE`, `PRESSENTI`, `ENVISAGE`, `RETIRE` | tous   |
| `hasPublishedMeasures` | `true` ou `false`                            | tous   |
| `page`                 | entier supérieur ou égal à 1                 | `1`    |
| `limit`                | entier entre 1 et 100                        | `20`   |

`page` et `limit` doivent être des entiers complets dans ces bornes. Une valeur malformée ou hors
bornes renvoie `400`.

### Statuts de suivi

| Code        | Libellé                 |
| ----------- | ----------------------- |
| `DECLARE`   | Candidature annoncée    |
| `PRESSENTI` | Personnalité pressentie |
| `ENVISAGE`  | Personnalité évoquée    |
| `RETIRE`    | Candidature retirée     |

Le champ `meta.statusScope` vaut toujours
`PUBLIC_TRACKING_NOT_OFFICIAL_CANDIDATE_LIST`.

### États de programme

| Code                                       | Signification                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `NO_PROGRAM_IDENTIFIED`                    | Aucun programme propre à la candidature n'est publié et aucune mesure accessible n'est exposée.      |
| `PROGRAM_IDENTIFIED_NO_PUBLISHED_MEASURES` | Un programme propre à la candidature est publié, mais aucune mesure accessible n'est encore exposée. |
| `PUBLISHED_MEASURES`                       | Une ou plusieurs mesures accessibles sont publiées.                                                  |

Une édition publiée par un parti n'est jamais attribuée automatiquement à une candidature. Seule
une édition explicitement rattachée à la candidature peut produire le deuxième état.

### Forme de réponse

```json
{
  "election": {
    "id": "...",
    "slug": "presidentielle-2027",
    "title": "Élection présidentielle 2027",
    "type": "PRESIDENTIELLE"
  },
  "data": [
    {
      "candidacyId": "...",
      "candidateName": "...",
      "politicianSlug": "...",
      "trackingStatus": {
        "code": "DECLARE",
        "label": "Candidature annoncée",
        "source": { "label": "...", "url": "https://..." }
      },
      "party": { "label": "...", "shortName": "..." },
      "programmeState": {
        "code": "PUBLISHED_MEASURES",
        "label": "Mesures publiées"
      },
      "publishedMeasureCount": 1,
      "themesCoveredCount": 1,
      "publicUrl": "/elections/presidentielle-2027/candidats/..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "meta": { "statusScope": "PUBLIC_TRACKING_NOT_OFFICIAL_CANDIDATE_LIST" }
}
```

## GET `/api/elections/{slug}/measures`

### Paramètres

| Paramètre          | Valeurs                                              | Défaut  |
| ------------------ | ---------------------------------------------------- | ------- |
| `candidateSlug`    | slug exact d'une candidature présidentielle publique | tous    |
| `theme`            | slug canonique d'un des treize thèmes                | tous    |
| `includeWithdrawn` | `true` ou `false`                                    | `false` |
| `page`             | entier supérieur ou égal à 1                         | `1`     |
| `limit`            | entier entre 1 et 100                                | `20`    |

Une élection inconnue ou une candidature qui n'appartient pas au champ public sourcé renvoie `404`.
Une candidature connue dont l'extension présidentielle n'est pas publiée renvoie `200` avec
`data: []`. Un thème, un booléen, une pagination ou un type d'élection invalide renvoie `400`. Le
filtre `candidateSlug` est limité à 200 caractères. Une page sans résultat renvoie `200` avec une
pagination cohérente.

### Publication et sources

Une mesure est exposée seulement si toutes les conditions suivantes sont vraies :

1. elle appartient à l'élection demandée ;
2. elle est rattachée à une candidature ;
3. la candidature possède un statut public non nul, une URL de source non nulle, un libellé de
   source non nul et un identifiant de personnalité non nul ;
4. la personnalité associée franchit la porte de publication publique ;
5. l'extension présidentielle existe et possède le statut `PUBLISHED` ;
6. la mesure possède le statut de publication `PUBLISHED` et désigne une révision publiée ;
7. la révision désignée est relue, publiée, non supplantée, non écartée, non rejetée et associée à
   au moins une source.

Chaque entrée est un DTO en liste blanche. Il contient le texte et la précision de la révision
publiée, le thème, l'attribution, l'identité publique de la candidature, les sources de la révision
et l'état de retrait. Aucun objet Prisma brut n'est sérialisé.

Les sources d'une mesure sont ordonnées par date de publication croissante, puis par identifiant
interne croissant lorsque plusieurs sources partagent la même date. Cet identifiant stabilise
l'ordre sans être nécessairement exposé dans le DTO public.

Les URLs de fiche candidat et de page sujet sont incluses lorsqu'elles existent. Aucune URL de
détail de mesure n'est inventée.

### Retraits

Par défaut, une liste répond à la question des mesures actuellement défendues et exclut donc les
mesures retirées. `includeWithdrawn=true` les rend consultables pour l'historique. Une mesure active
porte exactement la forme suivante :

```json
{
  "withdrawal": null
}
```

Une mesure retirée porte exactement la forme suivante :

```json
{
  "withdrawal": {
    "withdrawnAt": "2026-08-01T10:00:00.000Z",
    "sourceUrl": "https://source.example/retrait",
    "sourceLabel": null
  }
}
```

`sourceUrl` et `sourceLabel` sont indépendamment nullables. L'absence de l'un ne permet pas
d'inventer l'autre. Une mesure retirée ne doit pas être présentée comme actuellement défendue.

## Évolution du contrat

Ce document couvre uniquement les deux endpoints présidentiels. L'issue `#737` reste le chantier
du contrat OpenAPI global et n'est pas traitée ici.
