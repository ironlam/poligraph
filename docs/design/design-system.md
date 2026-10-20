# Design system Poligraph

Référence centrale du design system : où vivent les tokens et composants, la
langue visuelle, les conventions pour ajouter/modifier un composant, et les
garanties d'accessibilité.

Source de vérité visuelle : l'export du design system Poligraph (claude.ai Design
/ bundle `poligraph-design-system-*.zip`) — tokens, guidelines, UI kit et
patterns. Le code de l'app est l'implémentation vivante ; le bundle est la
spécification. Les valeurs de tokens du bundle sont d'ailleurs reprises de
`src/app/globals.css`.

## Où vivent les choses

| Couche                                     | Emplacement                                                   |
| ------------------------------------------ | ------------------------------------------------------------- |
| Tokens (couleurs oklch, radius, typo)      | `src/app/globals.css` (`@theme inline` + `:root` / `.dark`)   |
| Couleurs identité (hors thème)             | `src/config/brand.ts` (`BRAND_NAVY`, `BRAND_RED`)             |
| Couleurs data / partis / vote / judiciaire | `src/config/{colors,party-colors,labels,judicial-anchors}.ts` |
| Primitives UI                              | `src/components/ui/*`                                         |
| Specimens de fondations                    | `src/components/foundations/*` (Typography, Colors, Spacing)  |
| Documentation vivante                      | Storybook (`npm run storybook`)                               |
| Patterns et invariants légaux              | `docs/design/patterns/*`, `docs/design/legal-invariants.md`   |
| Assets de marque                           | `docs/design/*`, `public/*`                                   |

## Langue visuelle

- **Identité tricolore** : `BRAND_NAVY` (#002654) porte l'identité, `BRAND_RED`
  (#ed2939) est réservé aux signaux (condamnations, alertes). Ces constantes sont
  **indépendantes** des tokens sémantiques (`--primary`, `--brand`,
  `--destructive`) qui changent avec le thème.
- **Typographie** : **Outfit** en display (`--font-display`, titres/chiffres),
  **Atkinson Hyperlegible** en corps/UI (`--font-body`), chargées via `next/font`.
  Atkinson est choisie pour sa lisibilité maximale (données civiques denses).
  Les variables sont posées sur `<html>` (et non sur `<body>`) : le preflight Tailwind lit
  `--font-body` sur `<html>`, sinon le texte retombe sur la police système. `h1` à `h4` sont en
  Outfit par une règle globale (`globals.css`), une classe utilitaire peut la surcharger.
- **Graisses** : seules 400 et 700 (Atkinson) et 700 et 800 (Outfit) sont chargées, ce sont les
  seules des kits graphiques. 500 s'affiche en 400 et 600 en 700.
- **Échelle des titres** (`globals.css`, en `rem` pour suivre le zoom du texte) :

  | Classe          | Mobile | Dès 640 px | Graisse | Usage                                   |
  | --------------- | ------ | ---------- | ------- | --------------------------------------- |
  | `title-page`    | 30 px  | 38 px      | 800     | `h1` des pages Législatures             |
  | `title-section` | 22 px  | 24 px      | 700     | sections d'une page                     |
  | `title-card`    | 18 px  | 20 px      | 700     | titre d'une carte (fiche, Législatures) |

  Le niveau visuel est indépendant de la balise. Les titres de blocs latéraux (« En bref »)
  restent au corps de texte. Les autres pages gardent leurs tailles actuelles tant qu'elles
  n'ont pas été reprises. Les kits sont une référence visuelle, pas une spécification : leurs
  niveaux de titres (`h1` d'annotation, `h2` pour le titre de page) ne se copient pas.

- **Ton** : sobre, factuel, neutre. Tout en français, chiffres au format `fr-FR`,
  pas d'emoji. Présomption d'innocence et données sourcées.

## Ajouter ou modifier un composant

1. Primitive dans `src/components/ui/`, variantes via `class-variance-authority`,
   composition via Radix quand un comportement accessible existe déjà, classes
   fusionnées avec `cn()` (`@/lib/utils`).
2. Une story `*.stories.tsx` (c'est la doc du composant, pas un extra).
3. A11y d'emblée : focus visible (le global `globals.css` couvre la plupart des
   cas), rôles/labels ARIA, icônes décoratives `aria-hidden`, cibles tactiles
   suffisantes, `prefers-reduced-motion` respecté (géré globalement).
4. Test co-localisé pour la logique interactive (ex. `CollapsibleCard.test.tsx`).

## Accessibilité

Cible : WCAG 2.1/2.2 AA. `globals.css` fournit le focus-visible global
(`outline-2 outline-offset-2`), le skip-link, la neutralisation des animations
sous `prefers-reduced-motion`, et le dark mode. L'audit par primitive et les
corrections sont consignés dans [`a11y-perf-audit.md`](./a11y-perf-audit.md).

Guardrail a11y branché : `@storybook/addon-a11y` passe axe sur chaque story (voir
[`a11y-perf-audit.md`](./a11y-perf-audit.md) pour le balayage et les écarts de
contraste restants).

## Patterns et invariants

La couche **patterns** vit dans [`patterns/`](./patterns/README.md) : huit fiches
(InvolvementBand, JudicialCaution, MissingData, ClickTarget, ContextNav,
SourceAttribution, VoteBreakdown, PoliticianIdentity) qui documentent comment
résoudre un problème récurrent du produit, et pourquoi la solution évidente est
souvent fausse.

Elles s'ancrent sur le chapitre normatif [`legal-invariants.md`](./legal-invariants.md)
(I1 à I9, vocabulaire imposé, checklist avant publication, cas de refus). Ce
chapitre décrit des obligations RGPD article 10, pas des préférences : un écran
qui enfreint un invariant se refuse.

## Reste à faire (finalisation)

- Composants **dataviz** partagés (CompassRadar, PositionAxis, VoteBar,
  ParticipationRing) : à extraire des surfaces existantes (`VoteCard`, `Hemicycle`,
  `RadarChart`), c'est un refactor à cadrer, pas un ajout greenfield.
- Écarts de contraste en thème sombre relevés par l'addon a11y et les écarts prod
  catalogués dans les fiches patterns (par exemple la variante `not_accused` de
  `JudicialCaution`) : correctifs à cadrer séparément.
