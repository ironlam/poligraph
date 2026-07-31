# InvolvementBand : bandeau de rôle

Le pattern le plus important du produit. Il répond à la question qu'un lecteur se pose en arrivant sur une fiche d'affaire : qu'est-ce que cette personne a à voir avec ça ?

## Quand l'employer

Sur toute vue qui associe une personne nommée à une affaire (fiche d'affaire, onglet « Affaires » d'une fiche d'élu, résultat de recherche), et **obligatoirement** dès que `isAccusedInvolvement(involvement)` est faux (`MENTIONED_ONLY`, `VICTIM`, `PLAINTIFF`).

## Le défaut qu'il corrige

Le rôle était rendu comme une pastille parmi d'autres : « Mentionné » en gris, même taille et même forme que « Atteintes à la probité » et « Conflit d'intérêts », juste au-dessus d'un portrait. Résultat, sur une affaire visant un groupe de presse, le lecteur voyait un élu, son parti, et trois qualifications d'infraction, et rien ne disait que la personne poursuivie était quelqu'un d'autre.

Un mot gris ne porte pas une nuance juridique. Une phrase, si.

## Anatomie

Un seul bloc bordé, sous le titre de l'affaire, avant la description. Deux étages :

1. **Étage identité** : avatar, nom lié à la fiche, mandat, fonction en lien avec l'affaire, puce de parti. Fond `color-mix(in oklch, var(--muted) 55%, var(--card))`.
2. **Étage explicatif** : disque « i », un intertitre « Son rôle dans cette affaire : <rôle> », puis une phrase affirmative disant ce que la personne n'est pas, et ce que les qualifications ne visent pas. Fond `var(--notice-not-accused-bg)`, texte `var(--notice-not-accused-fg)`.

Quand un sujet réel est renseigné, l'étage identité passe en deux colonnes : « Visé par la procédure » (le sujet réel, personne morale comprise) à gauche, « Suivi sur cette page » (l'élu) à droite. C'est la seule mise en page qui nomme l'accusé sans le confondre avec la personne suivie.

## Règles

- **[I3](../legal-invariants.md)** : le rôle s'énonce en phrase, jamais en pastille seule.
- **[I1](../legal-invariants.md)** : aucun badge de certitude dans ce bloc quand la personne n'est pas mise en cause.
- **[I2](../legal-invariants.md)** : les catégories d'infraction sortent de ce bloc ; elles appartiennent à l'affaire, préfixées « Faits qualifiés : ».
- La phrase dit deux choses : la position réelle (« président de la commission visée ») et la négation explicite (« il n'est ni mis en cause, ni poursuivi »). L'une sans l'autre ne suffit pas.
- Lisible sans défilement, en mobile comme en desktop. C'est un critère d'acceptation, pas une préférence.
- Un lien « Que veulent dire mis en cause, mentionné, victime ? » sort vers la page de méthode.
- Le nom est un lien réel vers la fiche, souligné, à `var(--primary)`, pas un simple texte gras.
- Couleur d'implication : `--inv-<value>-bg / -fg / -border`. Elle teinte le bloc, elle ne le remplace pas.

## Thème sombre

Les tokens `--notice-not-accused-*` et `--inv-*` basculent seuls. Deux pièges :

- Ne pas éclaircir l'étage explicatif au point qu'il se confonde avec la carte : en sombre il doit rester plus foncé que `var(--card)`, l'inverse du clair.
- Les puces de parti gardent leur hex de marque : vérifier le contraste du libellé dessus (règle BT.601, `getContrastTextColor`), ne pas passer le texte en blanc par défaut.

## À ne pas faire

- Rendre le rôle uniquement dans un tooltip ou un `title` : un avertissement doit être lisible sans interaction.
- Écrire « simplement mentionné » : le mot minimise et n'est pas neutre.
- Employer `MENTIONED_ONLY` par prudence quand la personne est en réalité victime ([I9](../legal-invariants.md)). Le degré juste et sourcé protège mieux.
- Mettre le bloc après la description : le fait décisif arrive alors sous la ligne de flottaison.
- Additionner les implications dans un compteur d'affaires.

## État actuel dans le code

- `src/components/affairs/LinkedAffairBanner.tsx` rend aujourd'hui le lien entre une personne et une affaire ; `src/app/affaires/[slug]/page.tsx` porte l'en-tête et la ligne de pastilles.
- Garde-fou : `isAccusedInvolvement()` dans `src/config/certainty.ts`. Libellés et couleurs : `INVOLVEMENT_LABELS`, `INVOLVEMENT_COLORS` dans `src/config/labels.ts`.
- **Écart** : les tokens `--inv-*` et `--notice-not-accused-*` du bundle ne sont pas encore dans `src/app/globals.css` (les couleurs d'implication vivent en chaînes de classes Tailwind). L'étage explicatif à deux colonnes « Visé / Suivi » est une proposition du bundle, pas encore implémentée.
