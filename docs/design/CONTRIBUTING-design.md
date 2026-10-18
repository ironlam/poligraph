# Contribuer au design

Ce guide s'adresse aux designers et aux contributeurs qui veulent proposer un changement
visuel sans connaître toute la base de code.

## Voir le design system

- **En ligne** : le Storybook est publié à chaque fusion sur `main` (GitHub Pages). Chaque
  composant a une page avec ses variantes, un sélecteur de thème clair et sombre, et un
  panneau d'accessibilité (axe) pour vérifier les contrastes.
- **En local** : `npm ci && npm run storybook`, puis ouvrir http://localhost:6006.
- **Tokens lisibles par un outil** : `docs/design/tokens.generated.json` liste toutes les
  variables de `src/app/globals.css` en clair et en sombre, plus les couleurs d'identité.
  Ce fichier est généré, ne le modifiez pas à la main.

## Proposer un changement sans écrire de code

Ouvrez une issue avec :

1. le lien de la story concernée (bouton « Share » de Storybook) ;
2. une capture ou une maquette de ce que vous proposez ;
3. le token ou le composant visé, et la raison du changement ;
4. le contraste mesuré si la proposition touche une couleur de texte (4,5:1 minimum, 3:1
   pour le texte de 24px et plus et pour les bordures et icônes porteuses de sens).

## Proposer un changement avec du code

1. Créer une branche : `git checkout -b feat/design-mon-changement`.
2. Modifier la source de vérité : `src/app/globals.css` pour un token de thème,
   `src/config/brand.ts` pour l'identité, `src/config/colors.ts` pour les palettes de données.
3. Régénérer l'export : `npm run design:tokens`, puis committer `tokens.generated.json`.
   La CI échoue si cette étape est oubliée.
4. Mettre à jour la story du composant touché dans `src/components/**` et vérifier le panneau
   d'accessibilité.
5. Lancer `npm run lint && npm run typecheck && npm run test:run`.
6. Ouvrir la pull request avec des captures clair et sombre.

## Règles qui ne se négocient pas

Poligraph publie des données judiciaires sur des personnes nommées : le design fait partie de
la conformité. Un écran qui enfreint une invariante est refusé, pas ajusté. Lire
[`legal-invariants.md`](./legal-invariants.md) et les [fiches de patterns](./patterns/README.md)
avant de toucher à un badge, une bande de rôle ou un encart de prudence.

Rappels :

- aucun emoji, aucune information portée par la couleur seule ;
- cibles interactives de 44px minimum, focus visible conservé ;
- une couleur de statut judiciaire ne s'applique jamais à une personne qui n'est pas mise en cause ;
- les couleurs des partis restent celles des partis, y compris en thème sombre.
