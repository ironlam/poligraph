# Journal des évolutions : prompt de revue

À coller dans une session de revue. Branche : `claude/clever-euler-p517i1` (4 commits après `efa434b`).
Maquettes (privées) : page publique https://claude.ai/artifact/1jhVDDammfsD21oKszrRFt, admin https://claude.ai/artifact/7mmbjnY4DeuZquSHfoc5Za (écran « Journal des évolutions »).

## Mission

Revoir, sans réécrire, l'ajout d'un journal des évolutions éditable depuis l'admin. Lire d'abord `AGENTS.md` (sections 2, 5, 6, 7, 9). Signaler les écarts avec fichier et ligne, classés bloquant, important, mineur. Ne rien corriger sans accord.

## Besoin

- Les citoyens voient ce qui change sur Poligraph, chaque entrée avec sa source.
- L'équipe rédige et publie sans PR ni redéploiement.
- Une entrée naît en `DRAFT`. Elle ne devient `PUBLISHED` que par une action explicite et avec un lien source.

## Périmètre

| Couche           | Fichiers                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schéma           | `prisma/schema.prisma` (`ChangelogEntry`, `ChangelogType`), `prisma/migrations/20261028180000_add_changelog_entries/migration.sql`                        |
| Domaine          | `src/lib/changelog/format.ts` (date, flux RSS), `src/lib/changelog/publish-guard.ts`                                                                      |
| Validation       | `src/lib/security/schemas/changelog.ts`                                                                                                                   |
| Lecture publique | `src/lib/data/changelog.ts`, `src/app/changelog/page.tsx`, `src/app/changelog/_components/ChangelogList.tsx`, `src/app/changelog/rss.xml/route.ts`        |
| Admin            | `src/app/api/admin/changelog/route.ts`, `src/app/api/admin/changelog/[id]/route.ts`, `src/app/admin/changelog/page.tsx`, `src/config/admin-navigation.ts` |
| Divers           | `src/config/labels.ts`, `src/config/navigation.ts` (pied de page), `src/app/sitemap.ts`                                                                   |

## Points à vérifier en priorité

1. **Publication** : aucun chemin ne met `PUBLISHED` sans `isChangelogPublishable`. `POST` ne peut pas choisir le statut.
2. **Lecture publique** : seule `PUBLISHED_CHANGELOG_WHERE` filtre les surfaces publiques (page, RSS). Aucun brouillon ne fuit.
3. **Sécurité** : `withAdminAuth` et `withValidation` sur chaque mutation, écriture dans `db.auditLog`, lien source limité à `https:`, contenu échappé dans le RSS.
4. **Cache** : `cacheLife("synced")` et `cacheTag("changelog")` en lecture, `revalidateTags(["changelog"])` à chaque écriture. Pas de timer court.
5. **Couches** (`layering-guards.test.ts`) : la lecture dans `src/lib/data/` n'écrit jamais, les écritures restent dans les routes admin.
6. **Migration** : cohérence avec le schéma Prisma, index, RLS activée et privilèges retirés (SEC-03), `lock_timeout`.
7. **Dates** : `date` est un jour calendaire (`@db.Date`), lu et écrit en UTC. Chercher tout décalage d'un jour possible.
8. **Accessibilité** (WCAG 2.1 AA) : cibles de 44 px, `aria-pressed`, libellés, liens externes en `noopener noreferrer` avec mention du nouvel onglet.
9. **Texte français** : accents réels, aucun tiret long ni demi-cadratin, pas de transition stéréotypée.
10. **Écart maquette / code** : comparer l'écran admin et la page publique aux maquettes, lister les différences.

## Commandes

```bash
npm ci --ignore-scripts
DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
npx eslint src/app/changelog src/app/admin/changelog src/app/api/admin/changelog src/lib/changelog src/lib/data/changelog.ts
npx prettier --check src/app/changelog src/app/admin/changelog src/app/api/admin/changelog src/lib/changelog
npx vitest run src/lib/changelog src/lib/security src/__tests__ src/app/__tests__ src/lib/seo
```

État connu : typecheck, lint et ces suites passent. L'application n'a pas été lancée et la migration n'a pas été appliquée sur une base.

## Limites connues, à confirmer ou à contester

- Aucun test de route admin ni de la page publique (seulement schéma, RSS, dates, règle de publication).
- La suppression est définitive (pas d'archivage), tracée dans l'audit.
- Pas de rôle dédié pour publier : tout administrateur authentifié peut le faire.
- Les filtres de `/changelog` sont côté client (liste bornée à 200 entrées).
- Aucune entrée en base : les 6 de la maquette viennent de l'historique git et restent à saisir.
- L'aperçu et le texte d'aide de l'admin disent « pas de chiffre qui deviendrait faux demain » : règle éditoriale non vérifiée par le code.

## Format de réponse attendu

Liste classée (bloquant, important, mineur), chaque point avec fichier:ligne, le risque en une phrase et la correction proposée. Terminer par un verdict : prêt à fusionner, ou non.
