# SourceAttribution : attribution de source

« Données publiques, regard indépendant » n'est une promesse tenue que si chaque fait mène à sa source. Ce pattern couvre aussi ce qui quitte le site.

## Quand l'employer

Sur toute affirmation factuelle : une peine, un vote, un montant de patrimoine, une date, un mandat, un résumé généré.

## Anatomie, sur la page

- **Ligne de source** sous le bloc concerné : nom de l'organe (`DATA_SOURCE_LABELS`), date de consultation, lien sortant. 11,5 px, `var(--muted-foreground)`.
- **`CiteAnchor`** en fin de titre de bloc, pour que le bloc soit citable par un tiers.
- **Mention de génération** quand un texte est produit automatiquement : « Résumé généré automatiquement à partir de sources publiques », avec un symbole discret en gris.
- **« Signaler une erreur »** accessible depuis toute fiche. Ce n'est pas un aveu de faiblesse, c'est la méthode.
- **Date de vérification** quand elle existe : « Vérifié le 12 mai 2026 ». Une donnée sans date de vérification n'est pas fausse, mais elle n'est pas datée : le dire.

## Anatomie, hors la page

C'est la partie qu'on oublie, et celle qui fait le plus de dégâts. Quatre surfaces, une seule règle.

| Surface                       | Règle                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `<title>`                     | N'accole le nom d'une personne au titre d'une affaire que si `isAccusedInvolvement(involvement)`.      |
| `og:title` / `og:description` | Idem, et le statut de la procédure figure dans la description.                                         |
| `opengraph-image`             | Même règle que le titre. Jamais un visage plus un chef d'infraction sans le statut.                    |
| Texte de `ShareBar`           | Énonce le rôle quand il n'est pas « mis en cause » : « Affaire : <titre>, rôle de <nom> : mentionné ». |

## Règles

- **[I6](../legal-invariants.md)** : une affirmation sans source est un bug de contenu.
- **[I7](../legal-invariants.md)** : ce qui quitte le site est soumis aux mêmes règles que la page.
- Nommer l'organe, pas le pipeline : « Assemblée nationale », pas « import AN v3 ».
- Un lien sortant porte `target="_blank" rel="noopener noreferrer"` et un libellé qui dit où il mène.
- Ne pas confondre source (d'où vient la donnée) et preuve (la décision de justice). Judilibre est une source consultable ; la presse est une source rapportée. Le dire quand c'est le cas.
- Les résumés générés sont signalés à chaque occurrence, pas une fois en pied de page.

## Thème sombre

Les liens sortants à `var(--primary)` deviennent le bleu clair du thème sombre : vérifier le contraste sur `var(--card)` sombre (viser 4,5:1 sur du texte à 11,5 px, ce qui est déjà petit). Ne pas descendre toute la ligne de source à `var(--muted-foreground)` en sombre : la date de consultation peut rester discrète, le nom de l'organe doit rester lisible.

## À ne pas faire

- Une source affichée uniquement au survol.
- Un « Sources (3) » replié qui masque l'origine de la donnée la plus sensible de la page.
- Un partage qui gagne en clarté ce qu'il perd en exactitude.
- Marquer « Vérifié » sans date : c'est une affirmation non vérifiable sur une plateforme de vérification.

## État actuel dans le code

- Libellés : `DATA_SOURCE_LABELS`, `SOURCE_TYPE_LABELS` dans `src/config/labels.ts`. Primitives : `src/components/ui/CiteAnchor.tsx` (`src/lib/cite.ts`), `src/components/ui/ShareBar.tsx` (`src/lib/share.ts`).
- Diffusion : `generateMetadata()` dans `src/app/affaires/[slug]/page.tsx`, image OG dans `src/app/affaires/[slug]/opengraph-image.tsx`.
- **À vérifier** : que le gating `isAccusedInvolvement` s'applique bien au `<title>`, à l'`og:*` et à l'image OG (c'est la surface la plus exposée : hors du site, il ne reste qu'un nom et un titre d'affaire).
