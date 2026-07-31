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

## Passage axe automatisé (addon a11y)

`@storybook/addon-a11y` est désormais branché (`.storybook/main.ts`), avec une
config globale dans `.storybook/preview.tsx` (`parameters.a11y.test = "todo"` :
axe s'exécute dans le panneau a11y de chaque story et remonte les écarts sans
faire échouer la CI). Toute la famille `@storybook/*` a été alignée sur `10.5.5` :
un addon en retard de version casse le rendu du renderer en build statique
(`MissingRenderToCanvasError`).

Premier balayage : les 100 stories passées à `@axe-core/playwright`, en thème
clair **et** sombre (200 analyses), tags WCAG 2.0/2.1 A + AA. Résultat : **26
écarts, ramenés à 11** après correction des défauts propres aux stories.

### Corrigé dans les stories

- **Champs sans nom accessible** (`label`, `select-name`, critique) : `Input`,
  `Textarea` et les quatre `Select` de démonstration n'avaient ni `<label>` ni
  `aria-label`. Ajout d'un `aria-label` décrivant le champ. Les composants
  eux-mêmes sont conformes ; c'étaient les stories qui ne modélisaient pas un
  usage accessible.
- **Légendes invisibles en sombre** (`color-contrast`) : trois stories de la
  marque (`Tailles`, `Monochrome`, `Zone de protection`) posent leur texte sur un
  panneau fixe couleur « page » (`#fbfaf7`) qui ne bascule pas avec le thème ; en
  sombre le texte héritait du premier plan clair (ratio 1,1:1). Couleur de texte
  fixée à la marine de marque sur ces panneaux.

### Écarts restants (11) : décisions de tokens, hors périmètre de cette passe

Ces écarts ne sont **pas** des bugs de story : ils viennent des tokens et de
composants de production, avec un rayon d'impact sur tout le site. Ils sont
laissés visibles par l'addon (en `todo`) et documentés ici pour une correction
coordonnée, séparée de ce branchement d'outillage.

| Cause                                                           | Ratio (sombre)                                           | Où                                              | Correctif à cadrer                                           |
| --------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `--muted-foreground` sombre (`#808080` sur `#262626`)           | 3,83:1 (< 4,5)                                           | onglets et bascules inactifs, libellés atténués | éclaircir le token `--muted-foreground` en sombre            |
| Premier plan `accent` / `destructive` (`#0b0b0b` sur `#de3b3d`) | 4,49:1 (< 4,5 d'un cheveu)                               | `Badge` accent, carte profil                    | assombrir le rouge ou passer le texte en noir pur            |
| `StatCard` : accents hex fournis par l'appelant                 | 2,67:1 (nombre) et 1,06:1 (libellé sur fond actif clair) | toutes les stories `StatCard`                   | adapter les accents au thème (tokens ou calcul de contraste) |

Une passe axe permanente en CI (via l'intégration Vitest/test-runner de
Storybook) reste l'étape suivante recommandée : elle transformerait ces `todo` en
garde-fou bloquant une fois les tokens corrigés.

## Recommandations (étapes suivantes)

- **Cibles tactiles** : `Button size="icon"` fait 36 px (conforme AA 2.5.8, sous le
  seuil AAA 44 px). Acceptable, mais pour les boutons icône seule sur surfaces
  tactiles denses, préférer `icon-lg` (40 px) ou garantir l'espacement.
- **Tooltip au tactile** : Radix Tooltip ne s'ouvre pas au tap et n'est pas fiable
  pour l'AT sur mobile. Pour une info _essentielle_ (glossaire), envisager un
  Popover. `InfoTooltip` porte déjà le terme dans son `aria-label`, ce qui limite
  le risque.

## Vérification

- `tsc --noEmit` : 0 erreur sur les primitives (baseline conservée).
- `vitest run src/components/ui` : 20 tests verts (dont 3 sur CollapsibleCard),
  passe historique des corrections de primitives.
- `storybook build` : succès avec l'addon a11y, famille `@storybook/*` alignée
  sur `10.5.5`.
- Balayage axe (100 stories × 2 thèmes, 200 analyses) : 26 écarts avant, 11
  après, 0 story en erreur. Les 11 restants sont des décisions de tokens
  documentées ci-dessus, pas des régressions.
- Aucune régression de comportement : les changements sont additifs, purement
  ARIA, ou limités aux stories de démonstration.
