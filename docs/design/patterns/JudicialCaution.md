# JudicialCaution : encart de prudence

Le rappel qui accompagne toute affaire publiée : la qualification procédurale exacte, énoncée avant toute lecture à charge.

## Quand l'employer

Sur toute vue publiant une affaire. Il n'y a pas de couple (statut, implication) qui dispense d'encart. C'est précisément le trou constaté : `getAffairNoticeVariant()` renvoie `null` pour une personne non mise en cause dont l'affaire n'est pas une condamnation, c'est-à-dire le cas le plus exposé du produit.

## Variantes

Neuf variantes, une par situation. Les huit premières existent, `not_accused` est la variante manquante.

| Variante            | Situation                                                        | Ton                                             |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `presumption`       | Procédure active, personne mise en cause                         | Présomption d'innocence                         |
| `non_definitive`    | Condamnation de 1re instance, ou appel en cours                  | Recours possible                                |
| `pourvoi`           | Condamnation en appel, pourvoi en cassation                      | Non définitive, la cassation peut annuler       |
| `definitive`        | Condamnation définitive                                          | Factuel, sans emphase                           |
| `favorable`         | Relaxe, acquittement, non-lieu, classement                       | Dominant, ne se lit pas comme une mise en cause |
| `prescription`      | Action publique éteinte                                          | Close sans décision sur le fond                 |
| `instruction_close` | Instruction close sans mise en examen                            | Réquisitions à venir                            |
| `third_party`       | Personne non mise en cause, affaire conclue par une condamnation | La peine concerne quelqu'un d'autre             |
| `not_accused`       | Personne non mise en cause, procédure en cours                   | Manquant : ni mise en cause, ni poursuivie      |

Wording de `not_accused` : le rôle en clair, la négation explicite, et le rappel que les qualifications décrivent les faits reprochés dans l'affaire sans viser cette personne.

## Anatomie

Un `role="note"`, bordé, `border-radius: var(--radius-lg)`, `padding: 16px`. Un intertitre en gras suivi de deux-points, puis la phrase. Un `data-variant` sur le nœud, indispensable pour les tests de non-régression.

Couleurs : `--notice-<variant>-border / -bg / -fg`. Le rouge de marque n'est jamais employé ici : un encart de prudence protège, il n'alerte pas.

## Règles

- **[I5](../legal-invariants.md)** : toute affaire publiée porte un encart.
- Le wording colle exactement à l'état de la procédure. « Appel en cours » sur un pourvoi en cassation est faux : l'appel est terminé.
- La prescription a un wording distinct des autres issues favorables : elle éteint l'action publique sans décision sur le fond.
- Une issue favorable est rendue en vert sobre et se lit comme favorable. Ne pas la neutraliser en gris « pour rester neutre » : la neutralité de forme produit ici un doute injustifié.
- Placement : après le bandeau de rôle, avant la description. Jamais en pied de page, jamais replié.
- Ne jamais mettre l'encart dans un accordéon, un tooltip, une modale.

## Thème sombre

Tous les tokens basculent. Le principe : en clair les fonds sont plus clairs que la carte, en sombre ils sont plus sombres. Vérifier que `favorable` reste identifiable comme vert (`#a7f3d0` sur fond vert très sombre) et que `presumption` ne devient pas un jaune criard : l'ambre sombre doit rester une information, pas un avertissement de danger.

## À ne pas faire

- Un pictogramme d'alerte rouge : la présomption d'innocence n'est pas un danger.
- Réutiliser `third_party` pour une procédure en cours : son wording suppose une condamnation déjà prononcée.
- Retirer l'encart d'une fiche « parce qu'il est déjà sur la page de liste ».
- Faire dépendre l'encart d'un état d'interface (onglet actif, filtre) : il suit la donnée, pas la vue.

## État actuel dans le code

- `src/components/affairs/AffairStatusNotice.tsx` : `getAffairNoticeVariant(status, involvement)` mappe les 8 variantes existantes ; `getJudicialMaturity()` vit dans `src/config/judicial-maturity.ts`.
- **Écart (violation I5)** : pour une implication non poursuivie (`isAccusedInvolvement` faux) hors condamnation, la fonction renvoie `null`, donc aucun encart, alors que la page montre le visage de la personne à côté des qualifications de l'affaire. C'est la variante `not_accused` à ajouter (un correctif prod ciblé, à coordonner avec le travail en cours sur les affaires).
- **Écart tokens** : `NOTICES` utilise des classes Tailwind codées en dur (`border-amber-200 bg-amber-50 ...`), pas les tokens `--notice-*` du bundle (absents de `globals.css`).
