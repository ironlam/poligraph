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
| Assets de marque                           | `docs/design/*`, `public/*`                                   |

## Langue visuelle

- **Identité tricolore** : `BRAND_NAVY` (#002654) porte l'identité, `BRAND_RED`
  (#ed2939) est réservé aux signaux (condamnations, alertes). Ces constantes sont
  **indépendantes** des tokens sémantiques (`--primary`, `--brand`,
  `--destructive`) qui changent avec le thème.
- **Typographie** : **Outfit** en display (`--font-display`, titres/chiffres),
  **Atkinson Hyperlegible** en corps/UI (`--font-body`), chargées via `next/font`.
  Atkinson est choisie pour sa lisibilité maximale (données civiques denses).
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

Guardrail recommandé (non encore branché) : `@storybook/addon-a11y` pour passer
axe sur chaque story et capter les régressions.

## Reste à faire (finalisation)

- Brancher le guardrail a11y Storybook (sur un checkout propre).
- Couche **patterns** du bundle (JudicialCaution, MissingData, SourceAttribution,
  VoteBreakdown, PoliticianIdentity, ContextNav…), ancrée sur les invariants
  légaux.
- Composants **dataviz** partagés (CompassRadar, PositionAxis, VoteBar,
  ParticipationRing), en consolidant les Hemicycle existants.
