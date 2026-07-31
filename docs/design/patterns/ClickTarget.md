# ClickTarget : cible de clic

Une ligne de résultat est une porte. Elle doit s'ouvrir partout où le lecteur appuie.

## Quand l'employer

Toute liste de résultats : affaires, élus, scrutins, dossiers législatifs, fact-checks. Toute carte qui mène à une fiche.

## Le défaut qu'il corrige

La liste des affaires exposait des lignes entières non cliquables, avec un unique lien « Voir détails » de 11 px poussé à droite. Sur mobile, la cible faisait moins de 30 px de haut, à l'endroit le plus difficile à atteindre au pouce.

## Anatomie

Un seul lien, qui enveloppe toute la ligne (ou toute la carte) et porte le libellé accessible complet. Les éléments internes ne sont pas des liens, sauf l'exception ci-dessous.

```jsx
<a href={href} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
  <article
    style={{
      minHeight: 44,
      padding: "14px 16px",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      background: "var(--card)",
      transition: "box-shadow 200ms, transform 200ms, border-color 200ms",
    }}
  >
    …
  </article>
</a>
```

Affordance : `box-shadow: var(--shadow-sm)` au repos, `var(--shadow-md)` plus `translateY(-1px)` plus `border-color: color-mix(in oklch, var(--primary) 30%, var(--border))` au survol. Un chevron `ChevronRight` en `var(--muted-foreground)` à droite, qui avance de 2 px au survol.

## Liens imbriqués

Quand un élément interne doit mener ailleurs (une puce de parti vers la fiche du parti), ne pas imbriquer deux `<a>`. Deux solutions :

1. **Préférée** : la ligne entière est le lien ; les cibles secondaires sortent du lien et se placent en frères, dans une colonne dédiée.
2. Un lien de recouvrement (`position: absolute; inset: 0`) sur le titre, les cibles secondaires au-dessus en `z-index`. Le conteneur reste `position: relative`.

## Règles

- **Minimum 44 x 44 px** pour toute cible tactile, sans exception : puces de parti, chips de filtre, chevrons, boutons de pagination. En production, `min-h-11`.
- Le libellé accessible du lien décrit la destination complète, pas « Voir détails » : « Affaire : tentatives d'ingérence… fiche complète ».
- Un `:focus-visible` visible : `outline: 2px solid var(--ring); outline-offset: 2px`. Le survol seul ne suffit pas.
- Le curseur `pointer` sur toute la surface, pas seulement sur le texte.
- Transitions de 200 à 300 ms, annulées sous `prefers-reduced-motion`.
- Ne pas mettre de `onClick` sur un `div` : un lien est un lien, il s'ouvre dans un nouvel onglet au clic milieu.

## Thème sombre

Les ombres portées ne se voient pas sur fond sombre. Porter l'affordance de survol sur la bordure et le fond : `border-color` vers `var(--primary)`, `background` vers `color-mix(in oklch, var(--card) 92%, var(--primary))`. Garder le micro-lift, retirer l'ombre.

## À ne pas faire

- Un lien « Voir détails » comme unique cible.
- Rendre cliquable la carte et le titre séparément avec deux destinations différentes.
- Compacter les lignes en mobile en dessous de 44 px pour « en voir plus ».
- Un survol qui déplace le contenu (changement de padding) : seul le conteneur bouge.

## État actuel dans le code

- Référence de dimension : `src/components/ui/ToggleGroup.tsx` (`min-h-11`, soit 44 px). La liste d'affaires et sa carte de résultat sont dans `src/app/affaires/page.tsx`.
- Le focus-visible global (`outline-2 outline-offset-2`) et la neutralisation des transitions sous `prefers-reduced-motion` sont déjà dans `src/app/globals.css`.
- C'est le pattern le moins sensible juridiquement : il pourrait être extrait en helper réutilisable (`ClickableRow` ou équivalent) plus une story, sans toucher aux surfaces affaires/légales.
