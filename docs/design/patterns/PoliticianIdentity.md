# PoliticianIdentity : identité d'élu

Une personne se présente toujours de la même façon, partout dans le produit : même ordre, même densité, mêmes attributs. C'est ce qui rend les fiches comparables, et ce qui empêche une mise en page de charger quelqu'un.

## Quand l'employer

Carte d'élu, en-tête de fiche, ligne de résultat, bandeau de rôle dans une affaire, restitution de Boussole, résultat de recherche.

## Anatomie : l'ordre est normatif

1. **Photo** : ronde, `var(--muted)` en fond, initiales en repli. Ne jamais afficher une silhouette générique : les initiales sont plus dignes.
2. **Nom complet** : Outfit 700/800, `tracking-tight`. C'est le seul élément à ne jamais tronquer.
3. **Mandat en cours** : `MANDATE_TYPE_LABELS`, féminisé par `feminizeRole()` selon la civilité. « Députée du Calvados », pas « Député ».
4. **Circonscription / territoire** : le rattachement géographique, souvent ce que le citoyen cherche.
5. **Parti** : puce de la couleur du parti (15 % de fond, 30 % de bordure, texte contrasté par la règle BT.601 via `getContrastTextColor`). Toujours un libellé, jamais la couleur seule.
6. **Chambre** : `CHAMBER_LABELS`, quand plusieurs chambres cohabitent dans la même vue.

Tout le reste (statistiques, affaires, patrimoine, activité) vient après et n'entre jamais dans le bloc d'identité.

## Règles

- **[I1](../legal-invariants.md)** : aucun badge de certitude, de statut judiciaire ou de catégorie d'infraction dans le bloc d'identité. Une personne n'est pas une affaire. Les affaires ont leur propre section, avec leur bandeau de rôle.
- **La féminisation est obligatoire.** `feminizeRole()` et `feminizePartyRole()` existent : les utiliser. Un titre au masculin par défaut est une erreur de données visible par la personne concernée.
- **Un compteur d'affaires ne se met pas sur une carte d'identité** sans distinguer les implications et les statuts. « 3 affaires » additionne un mis en cause et deux mentions : c'est faux et diffamant ([I1](../legal-invariants.md), cas de refus 4).
- Le badge de condamnation, s'il existe, dérive uniquement de `CONVICTION_BADGE_WHERE` (`DIRECT` + `CONDAMNATION_DEFINITIVE` + `CRITIQUE`). Aucune autre dérivation n'est admise.
- Les mandats antérieurs vont dans un `CollapsibleCard`, jamais dans l'en-tête.
- La puce de parti cliquable fait 44 px minimum (voir [`ClickTarget`](./ClickTarget.md)). C'est le défaut le plus fréquent en mobile.
- Sur une carte, la densité est modérée : photo, nom, mandat, territoire, parti. Cinq informations, pas huit.

## Thème sombre

Les couleurs de parti sont des hex de marque, non tokenisées par thème : elles ne basculent pas. Trois conséquences :

- Le fond à 15 % devient très sombre sur `var(--card)` sombre : monter à 22 % pour garder la puce identifiable.
- Le texte contrasté calculé par la règle BT.601 l'est sur la couleur du parti, pas sur le fond de carte : il reste valide, ne pas le forcer en blanc.
- L'avatar de repli (`var(--muted)` plus initiales) doit rester distinct de la carte : `var(--muted)` sombre est proche de `var(--card)`, ajouter une bordure `1px var(--border)`.

## À ne pas faire

- Trier ou colorer des personnes par gravité supposée.
- Afficher un parti par sa seule couleur (illisible pour un daltonien, incompréhensible pour un citoyen non initié).
- Un badge « suivi » ou « à surveiller » : Poligraph documente, ne désigne pas.
- Tronquer un nom pour tenir une grille : c'est la grille qui s'adapte.
- Mélanger des personnes et des personnes morales dans la même liste sans le dire.

## État actuel dans le code

- Surfaces : `src/components/politicians/PoliticianCard.tsx`, `src/app/politiques/[slug]/page.tsx`, `src/components/politicians/ProfileTabs.tsx`.
- Contraste : `getContrastTextColor()`, `ensureContrast()` dans `src/config/party-colors.ts`. Libellés et féminisation : `MANDATE_TYPE_LABELS`, `feminizeRole()`, `feminizePartyRole()`, `CHAMBER_LABELS`, `CONVICTION_BADGE_WHERE` dans `src/config/labels.ts`.
- Les couleurs de parti restent des hex de marque (non tokenisées par thème), conformément à la règle ci-dessus.
