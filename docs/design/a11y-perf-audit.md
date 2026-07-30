# Audit a11y / responsive / performance des primitives du design system

Périmètre : `src/components/ui/*` et `src/components/foundations/*` (les primitives
partagées). Les écrans et composants métier (`src/app/**`,
`src/components/{politicians,parlement,stats,affairs,votes}`) sont hors périmètre
de cette passe.

Critères : WCAG 2.1/2.2 AA (contraste, focus visible, cibles tactiles, clavier,
rôles/labels ARIA), responsive (débordement, zoom 200 %, tactile), performance
(rendu, poids, images).

## Constat général

Le socle est sain : shadcn/ui sur Tailwind v4, primitives Radix, et `globals.css`
gère déjà le focus-visible global (`outline-2 outline-offset-2`), le skip-link,
`prefers-reduced-motion` (neutralise toutes les animations/transitions) et le dark
mode. La plupart des primitives passent l'audit sans modification. Le durcissement
se limite donc à quelques écarts ciblés, plus une recommandation d'outillage.

## Verdict par primitive

| Primitive             | Verdict | Note                                                                 |
| --------------------- | ------- | -------------------------------------------------------------------- |
| Button                | PASS    | focus-visible, `aria-invalid`, tailles 32–40 px (AA)                 |
| Badge                 | PASS    | sens porté par le texte, pas par la couleur seule                    |
| Input / Textarea      | PASS    | `text-base` sur mobile (anti-zoom iOS), `aria-invalid`               |
| Label / Select        | PASS    | Radix, association via `htmlFor` côté consommateur                   |
| Tabs                  | PASS    | scroll horizontal + fades, focus-visible, `overflow-x-auto`          |
| Table                 | PASS    | conteneur `overflow-x-auto` déjà en place                            |
| Tooltip / InfoTooltip | PASS    | Radix, trigger focusable, icône `aria-hidden` (voir caveat)          |
| AlertDialog           | PASS    | Radix, `Title` + `Description`                                       |
| Breadcrumb            | PASS    | `nav` labellisé, `aria-current="page"`, chevrons `aria-hidden`       |
| SimplePagination      | PASS    | `nav` labellisé, `aria-current`                                      |
| ToggleGroup           | PASS    | `radiogroup` + roving tabindex + flèches, cible `min-h-11` (44 px)   |
| ShareBar              | PASS    | `role="group"`, `aria-label` par action, icônes `aria-hidden`, 40 px |
| StatCard              | PASS    | icônes `aria-hidden`, nombres en `fr-FR`                             |
| CiteAnchor            | PASS    | `aria-label`, visible au focus et au tactile                         |
| HexPattern            | PASS    | décoratif, `aria-hidden`                                             |
| CollapsibleCard       | CORRIGÉ | contenu replié désormais `inert` + `aria-controls`                   |
| Skeleton              | CORRIGÉ | `aria-hidden` par défaut (placeholder décoratif)                     |
| Spinner               | CORRIGÉ | prop `label` optionnelle pour annoncer un chargement isolé           |

## Corrections appliquées

1. **CollapsibleCard** — le contenu reste dans le DOM (SEO) mais était **focusable
   et lu par les lecteurs d'écran même replié**. Ajout de `inert` sur la région
   quand elle est fermée + `id`/`aria-controls`. Le texte reste indexable, mais le
   clavier et l'AT ne l'atteignent plus quand il est masqué. Couvert par
   `CollapsibleCard.test.tsx`.
2. **Skeleton** — `aria-hidden="true"` par défaut (surchargeable). Un placeholder
   décoratif ne doit pas être lu ; l'état de chargement doit être annoncé par la
   région englobante.
3. **Spinner** — prop `label` optionnelle. Par défaut le glyphe reste décoratif
   (`aria-hidden`) ; avec `label`, il devient `role="status"` avec nom accessible,
   pour les cas où le spinner est le seul indicateur de chargement.

## Recommandations (étapes suivantes)

- **Guardrail a11y automatisé** : brancher `@storybook/addon-a11y` (axe sur chaque
  story) pour capter les régressions. **Non appliqué ici** : le worktree partage son
  `node_modules` avec une session active ; l'ajout d'une dépendance doit se faire sur
  un checkout propre. Câblage prévu :

  ```ts
  // .storybook/main.ts
  addons: ["@storybook/addon-a11y"],
  ```

  ```bash
  npm i -D @storybook/addon-a11y
  ```

- **Cibles tactiles** : `Button size="icon"` fait 36 px (conforme AA 2.5.8, sous le
  seuil AAA 44 px). Acceptable, mais pour les boutons icône seule sur surfaces
  tactiles denses, préférer `icon-lg` (40 px) ou garantir l'espacement.
- **Tooltip au tactile** : Radix Tooltip ne s'ouvre pas au tap et n'est pas fiable
  pour l'AT sur mobile. Pour une info _essentielle_ (glossaire), envisager un
  Popover. `InfoTooltip` porte déjà le terme dans son `aria-label`, ce qui limite
  le risque.

## Vérification

- `tsc --noEmit` : 0 erreur sur les primitives (baseline conservée).
- `vitest run src/components/ui` : 20 tests verts (dont 3 nouveaux sur
  CollapsibleCard).
- Aucune régression de comportement : les changements sont additifs ou purement
  ARIA.
