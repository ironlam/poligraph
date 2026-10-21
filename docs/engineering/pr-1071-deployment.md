# Déploiement de la PR #1071

La PR utilise `Scrutin.officialDossierRef` pour rattacher un scrutin au dossier de l'Assemblée
nationale qui le publie. La colonne doit exister avant le déploiement du code. En production, le
schéma est appliqué avec le SQL manuel ci-dessous, pas avec `prisma migrate`.

## Ordre de déploiement

1. Vérifier que la table `AnOrgan` et le référentiel AMO30 des groupes des 15e à 17e législatures
   sont disponibles. Ils sont déployés par #1125. Pour contrôler les lignes importées :

   ```sh
   npm run sync:an-organes -- --stats
   ```

   Si le référentiel n'a pas encore été rempli, simuler puis lancer l'import officiel :

   ```sh
   npm run sync:an-organes -- --dry-run
   npm run sync:an-organes
   ```

2. Appliquer le SQL idempotent à la base de production avec la connexion directe (`DIRECT_URL`) :

   ```sh
   npx prisma db execute --file prisma/migrations/manual/2026-10-21-scrutin-official-dossier-ref.sql
   ```

   Vérifier la présence de la colonne et de l'index avant de poursuivre. Ne pas utiliser `db:push`
   pour cette étape de production.

3. Déployer le code. La migration Prisma
   `20261009090000_add_scrutin_official_dossier_ref` reste nécessaire pour les bases locales et
   toute base neuve.

4. Simuler le rafraîchissement des décomptes officiels, puis l'exécuter pour la 17e législature :

   ```sh
   npm run sync:scrutins-an -- --leg=17 --official-groups-only --dry-run
   npm run sync:scrutins-an -- --leg=17 --official-groups-only
   ```

   Le mode `--official-groups-only` rafraîchit les décomptes sans réécrire les votes individuels et
   force la relecture de l'archive officielle. Contrôler les erreurs, les scrutins traités et les
   décomptes avant de poursuivre.

5. Recharger les dossiers de la 17e législature pour que leurs chronologies contiennent les
   références `voteRefs` officielles :

   ```sh
   npm run sync:legislation -- --leg=17
   ```

   Ce doit être une synchronisation complète des dossiers. Le mode `--origin-only` ne met à jour
   que les champs d'origine et laisse la chronologie inchangée. La synchronisation peut être
   relancée; elle télécharge et traite l'archive de la législature pour mettre à jour les dossiers.

6. Vérifier qu'il existe des scrutins de la 17e législature avec une référence officielle, que les
   erreurs des deux synchronisations sont nulles, et que les liens avec les dossiers reposent sur
   `officialDossierRef` ou un `voteRef` exact. Les rapprochements par titre restent exclus de cet
   indicateur.

7. Purger les données en cache après les imports :

   ```sh
   npm run cache:revalidate -- votes groupes
   ```

   La commande utilise `CRON_SECRET` et `NEXT_PUBLIC_BASE_URL` (ou `VERCEL_URL`) pour appeler le
   point de revalidation du site déployé.

## Retour arrière

Si le nouvel affichage doit être désactivé, redéployer le code précédent et purger les tags `votes`
et `groupes`. Garder la colonne et son index en place : ils sont additifs et ne gênent pas l'ancien
code. Ne pas supprimer les décomptes importés pour revenir en arrière.
