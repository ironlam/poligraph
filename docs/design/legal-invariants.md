# Invariants juridiques et éditoriaux

> Chapitre **normatif**. Les autres pages du design system décrivent des intentions esthétiques ; celle-ci décrit des obligations. Un écran qui enfreint un invariant se refuse, il ne s'ajuste pas.
>
> Poligraph publie, sur des personnes nommées, des données judiciaires, la catégorie de données la plus encadrée du RGPD (article 10). La conception visuelle **fait partie** de la conformité : une pastille mal placée attribue une infraction à quelqu'un aussi sûrement qu'une phrase.

## Le modèle de données, en deux axes

Toute affaire porte deux informations distinctes. **Confondre les deux est la faute la plus grave** du produit.

| Axe             | Enum                              | Ce qu'il dit                                                     | Ce qu'il ne dit pas           |
| --------------- | --------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| **Statut**      | `AffairStatus` → `CertaintyLevel` | Où en est la procédure, et son issue pour la personne poursuivie | Qui est cette personne        |
| **Implication** | `Involvement`                     | À quel degré la personne suivie est liée à l'affaire             | Comment, ni à la place de qui |

```
Involvement          isAccusedInvolvement()   Le statut la décrit ?
DIRECT               true                     oui
INDIRECT             true                     oui
MENTIONED_ONLY       false                    NON
VICTIM               false                    NON
PLAINTIFF            false                    NON
```

**I1. Un badge de certitude ne peut être rendu à côté d'une personne que si `isAccusedInvolvement(involvement)` est vrai.** « Condamnation définitive » sur la fiche d'une victime est une diffamation par mise en page. Source de vérité : `isAccusedInvolvement()` dans `src/config/certainty.ts`, qui garde aussi `AffairStatusNotice`.

**I2. Une catégorie d'infraction qualifie l'affaire, jamais la personne non mise en cause.** « Atteintes à la probité » posé au-dessus d'un portrait se lit comme le sien. Il faut préfixer (« Faits qualifiés : ») et sortir cette information de la ligne de pastilles d'identité.

**I3. Le degré d'implication ne s'énonce pas en pastille, mais en phrase.** Un mot gris de la même taille que trois autres pastilles n'est pas lu. Voir [`patterns/InvolvementBand.md`](./patterns/InvolvementBand.md).

**I4. Aucune escalade automatique d'implication.** Aucun script, aucune heuristique, aucun modèle ne fait passer un `Involvement` vers un degré plus incriminant sans relecture humaine. Les sorties automatiques vont en `DRAFT`.

**I5. Toute affaire publiée porte un encart de prudence.** La qualification procédurale exacte est énoncée avant toute lecture à charge, et les issues favorables sont dominantes. Voir [`patterns/JudicialCaution.md`](./patterns/JudicialCaution.md).

**I6. Toute donnée renvoie à sa source.** Une affirmation sans source est un bug de contenu, pas un manque de finition.

**I7. Ce qui quitte le site est soumis aux mêmes règles.** `<title>`, `og:title`, image OG, texte de partage : hors du site, il ne reste souvent qu'un nom et un titre d'affaire. Voir [`patterns/SourceAttribution.md`](./patterns/SourceAttribution.md).

**I8. Le doute se documente, il ne se comble pas.** Une donnée absente s'affiche comme absente. Ni tiret, ni zéro, ni bloc vide réservé à un procès qui ne concerne pas la personne. Voir [`patterns/MissingData.md`](./patterns/MissingData.md).

**I9. La prudence par défaut n'est pas neutre.** Qualifier de `MENTIONED_ONLY` quelqu'un qui est en réalité **victime** produit une lecture plus défavorable que la réalité : la page montre son visage sous des qualifications d'infraction sans dire que ce n'est pas lui qui est visé. Le degré juste et sourcé protège mieux que le degré le plus faible.

## Vocabulaire imposé

Ces mots ne sont pas interchangeables. Les libellés font foi : `AFFAIR_STATUS_LABELS`, `INVOLVEMENT_LABELS`, `CERTAINTY_LABELS` (dans `src/config/labels.ts`).

| Écrire                                   | Jamais                                      |
| ---------------------------------------- | ------------------------------------------- |
| mis en cause, visé par une procédure     | coupable, corrompu, fraudeur                |
| mise en examen                           | inculpation (terme abandonné en 1993)       |
| condamnation non définitive              | condamné (sans qualifier), reconnu coupable |
| condamnation définitive                  | seul cas où « condamné » est exact          |
| relaxe, acquittement, non-lieu           | blanchi, innocenté, s'en sort               |
| action publique éteinte par prescription | prescrit (sans plus), échappe à la justice  |
| classement sans suite                    | affaire enterrée                            |
| affaire, procédure, dossier              | scandale, casserole, affaire louche         |

- **Vouvoiement** pour le citoyen, « nous » pour Poligraph.
- **Sentence case** dans les titres.
- Chiffres en `fr-FR` (`toLocaleString("fr-FR")`), espace insécable pour les milliers.
- **Pas d'emoji**, jamais, ni en UI ni en copie.
- Contenus générés : mention explicite (« Certains résumés sont générés automatiquement à partir de sources publiques »).

## Checklist avant publication

À passer sur tout écran qui affiche une affaire, une personne ou un chiffre.

**Attribution**

- [ ] Aucun badge de certitude ni de statut n'est adjacent au nom d'une personne dont `isAccusedInvolvement` est faux.
- [ ] Aucune catégorie d'infraction n'est rendue comme un attribut de la personne.
- [ ] Si la personne n'est pas mise en cause, la page dit qui est visé, ou dit explicitement que ce n'est pas elle.
- [ ] Le degré d'implication est lisible sans défilement, en clair et en mobile.

**Prudence**

- [ ] Un encart de prudence est rendu, quel que soit le couple (statut, implication).
- [ ] Le wording de l'encart correspond exactement à l'état de la procédure (pas « appel en cours » pour un pourvoi en cassation).
- [ ] Une issue favorable est rendue comme favorable, pas comme une mise en cause éteinte.

**Sources et données**

- [ ] Chaque affirmation factuelle porte une source consultable.
- [ ] Les données absentes sont annoncées absentes ; aucun bloc n'est rempli de « non renseigné » pour tenir la grille.
- [ ] Aucun message contradictoire (« les peines ne concernent pas cette personne » et « pas encore de verdict »).
- [ ] Les résumés générés sont signalés comme tels.

**Diffusion**

- [ ] `<title>` et `og:title` n'accolent pas le nom d'une personne non mise en cause à un titre d'affaire.
- [ ] Le texte de partage énonce le rôle quand il n'est pas « mis en cause ».
- [ ] L'image OG suit la même règle que le titre.

**Accessibilité** (elle fait partie de la mission civique)

- [ ] Cibles tactiles supérieures ou égales à 44 px, y compris les puces de parti et les liens de navigation.
- [ ] Contraste vérifié sur les fonds colorés (`ensureContrast` / règle BT.601 côté données).
- [ ] Navigation clavier complète, anneau de focus visible.
- [ ] `prefers-reduced-motion` respecté.
- [ ] Aucune information portée par la seule couleur (un parti, un vote, un statut portent toujours un libellé).

## Cas de refus

Un agent ou un contributeur doit **refuser de produire** :

1. Un écran qui range des personnes par gravité supposée sans que le statut judiciaire soit lisible sur chaque ligne (« palmarès des élus les plus véreux »).
2. Un composant qui affiche un compteur d'affaires sans distinguer condamnations définitives et procédures en cours.
3. Un visuel de partage qui montre un visage et un chef d'infraction sans le statut de la procédure.
4. Une carte, un graphe ou un classement qui agrège « nombre d'affaires » toutes implications confondues : additionner un mis en cause et une victime n'a aucun sens et diffame la seconde.
5. Un ton militant, ironique ou moralisateur, y compris dans un état vide ou un message d'erreur.
6. Un badge « condamné » dérivé d'autre chose que `CONDAMNATION_DEFINITIVE` + `DIRECT` (voir `CONVICTION_BADGE_WHERE`, source de vérité unique).
7. Une donnée judiciaire sur une personne qui n'est pas une personnalité publique au sens du produit.

Dans ces cas, le bon comportement est de dire ce qui bloque et de proposer la version conforme, pas de livrer puis d'avertir.
