# Gabarits Instagram

Les visuels Instagram de Poligraph sont des pages HTML rendues en PNG par Playwright. Ce dossier
contient les gabarits vides et les scripts d'export. Les règles de fond sont dans
[`../reseaux-sociaux.md`](../reseaux-sociaux.md) : elles s'appliquent à chaque écran.

Les publications elles-mêmes, leurs briefs et leurs textes ne sont pas versionnés ici. Ils sont
datés et portent des contenus à venir.

## Les deux formats

| Gabarit                  | Format      | Usage                                   | Export                 |
| ------------------------ | ----------- | --------------------------------------- | ---------------------- |
| `gabarit-story.html`     | 1080 × 1920 | Story, une mise à jour ou un résultat   | `export-story.mjs`     |
| `gabarit-carrousel.html` | 1080 × 1350 | Post en carrousel, un sujet à expliquer | `export-carrousel.mjs` |

Chaque écran est une `<section>` portant un attribut `data-screen-label`. L'export en fait un PNG
numéroté par rang, dans l'ordre du fichier. On duplique ou on supprime des sections selon la
quantité réelle d'information, sans viser un nombre fixe d'écrans.

## Préparer un kit

Un kit est un dossier hors du dépôt qui contient :

- une copie du gabarit, à remplir ;
- un dossier `public/` avec `logo.svg` et `logo-inverse.svg`, copiés depuis `public/` du dépôt ;
- `BRIEF.md` : l'objectif, les faits, leurs sources et la date à laquelle les chiffres ont été
  relevés ;
- `TEXTE.md` (story) ou `LEGENDE.md` (carrousel) : le texte qui accompagne la publication ;
- `ALT.md` : le texte alternatif de chaque image, dans l'ordre.

## Exporter

Les scripts se lancent depuis n'importe quel dossier, Playwright est résolu depuis ce dépôt :

```bash
node <dépôt>/docs/editorial/instagram/export-story.mjs "<kit>/Instagram Story.html" "<kit>/export"
node <dépôt>/docs/editorial/instagram/export-carrousel.mjs "<kit>/Instagram Kit.html" "<kit>/export"
node <dépôt>/docs/editorial/instagram/audit-typo.mjs "<kit>/Instagram Kit.html"
```

Les deux exports vident le dossier de sortie avant d'écrire, refusent de produire des images si la
police Outfit n'a pas chargé, et sortent en erreur si un écran n'a pas la bonne taille ou contient
encore un texte du gabarit (« à remplacer »). L'export carrousel écrit aussi un premier jet de
`ALT.md`, à relire. `audit-typo.mjs` relève les tailles de texte rendues et leur taille apparente
sur un téléphone.

Un export réussi ne dit rien de la mise en page : regarder chaque PNG avant de publier.

## Charte

- Titres en Outfit, corps en Atkinson Hyperlegible.
- Bleu nuit pour la couverture et la clôture, papier clair pour les écrans de contenu, filet
  rouge et bleu en haut de chaque écran.
- Portraits seulement en bichromie, depuis un fichier Wikimedia Commons à licence libre, avec le crédit dans
  le pied de l'écran (voir `illustrations/`). Jamais sur un sujet judiciaire.
- Une ligne de source dans le pied de chaque écran qui porte des données.
- Pas d'indice de défilement : Instagram affiche déjà sa pagination.
- Graphiques : une seule série se dessine d'une seule teinte, la valeur est écrite à côté de la
  barre.

## Illustrations

`illustrations/` contient des illustrations vectorielles au style de la charte (hémicycle, urne, Journal
officiel, façade d'institution) et `portrait.mjs`, qui produit un portrait en bichromie.

- Les SVG se posent avec `<img src="public/illustrations/<nom>.svg" alt="" />` : copier le dossier dans
  `public/` du kit. Palette : bleu nuit, bleu clair, rouge, crème. Sur fond bleu nuit, les poser sur un
  fond clair.
- `node illustrations/portrait.mjs "<Titre du fichier Commons>" <sortie.png> [x,y,l,h]` télécharge la photo,
  refuse toute licence non libre, recadre, applique la bichromie et écrit le crédit à côté. Une photo de
  la base n'a pas de licence enregistrée : ne pas l'utiliser.
- Le crédit (auteur, licence, Wikimedia Commons) figure dans le pied ou la ligne de source de l'écran.
- Aucun portrait ni illustration sur un sujet judiciaire. Les portraits ne se génèrent ni ne se retouchent
  par IA : une image de situation fabriquée avec un vrai élu se repartage hors contexte et ne se corrige pas.
