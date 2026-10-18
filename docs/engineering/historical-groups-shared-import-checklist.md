# Import des archives historiques sur la base partagée : checklist d'exploitation

À suivre dans l'ordre, case par case, par la personne qui lance l'import. **Rien ici ne s'exécute sans
un accord explicite pour cette opération.** Ne copier dans ce fichier, une PR, une issue ou une sortie
de CI ni chaîne de connexion, ni nom d'hôte, ni identifiant de projet, ni clé, ni mot de passe.

Le schéma du lot (16 tables, RLS, gardes, trois rôles) est déjà posé et les tables sont vides. Les
rôles `hg_importer`, `hg_runner` et `hg_reader` sont sans connexion (`NOLOGIN`) et sans mot de passe.

## 0. Avant de commencer

- [ ] L'accord pour l'opération est écrit, avec la liste des flux (AMO30, scrutins 15e, 16e, 17e).
- [ ] Le dépôt local est à jour (`git rev-list --count HEAD..origin/main` vaut 0) et propre.
- [ ] Les archives sont hors dépôt, avec leur `manifest.json`, et leurs SHA-256 sont ceux du baseline
      (`npm run validate:historical-groups` en lecture seule).
- [ ] Aucun sync, backfill ou migration n'est en cours sur la base.

## 1. Capacité disque et marge WAL

À constater dans le dashboard et par requête, jamais à déduire d'une page tarifaire.

- [ ] Disque provisionné et espace utilisé relevés dans le dashboard (le 2026-10-18 : 4,51 Go utilisés
      sur 12 Go).
- [ ] Besoin mesuré en local avec les réglages de la base partagée (`wal_level=logical`,
      `wal_compression=zstd`) : 1,47 Go de données au total, 2,8 Go de WAL au total (11,9 Mo, 587 Mo, 746 Mo
      et 1 682 Mo pour AMO30, 15e, 16e et 17e). Le WAL fait donc environ deux fois le volume de données, et
      la 17e est le flux le plus lourd (880 Mo de données, 1,7 Go de WAL, environ 22 minutes).
- [ ] **`max_wal_size` n'est pas une limite physique stricte.** C'est une cible qui déclenche des
      checkpoints, que le répertoire WAL peut dépasser : archivage en retard, slot de réplication qui
      retient du WAL, pic d'écriture plus rapide que les checkpoints. Le WAL est recyclé tant que
      l'archivage suit. S'il prend du retard, le répertoire grossit jusqu'au total produit, soit jusqu'à
      2,8 Go de plus que le volume actuel. Le pire cas à vérifier est donc : espace utilisé + 1,47 Go +
      2,8 Go sous le disque provisionné, avec une marge. `max_wal_size` ne protège pas le disque.
- [ ] Réglages relevés par `SHOW` : `max_wal_size`, `min_wal_size`, `wal_level`, `archive_mode`,
      `max_slot_wal_keep_size`, `wal_compression`. Le 2026-10-18 : 4 096 Mo, 1 024 Mo, `logical`,
      `on`, 2 048 Mo, `zstd`.
- [ ] Aucun slot de réplication inactif (`pg_replication_slots`) : un slot qui retient du WAL remplit
      le disque pendant un import.
- [ ] Taille actuelle du répertoire WAL relevée (`pg_ls_waldir()`), et l'archivage fonctionne
      (`pg_stat_archiver` : aucun échec récent).
- [ ] Marge exigée avant de lancer : espace libre supérieur aux données du flux plus son WAL mesuré plus 2 Go. Sinon, augmenter le disque d'abord (geste du dashboard, à confirmer dans le dashboard :
      délai et comportement de l'augmentation ne sont pas connus ici).
- [ ] Un flux à la fois. **Entre deux imports, avant de lancer le suivant** : espace libre relevé dans le
      dashboard, taille du répertoire WAL (`pg_ls_waldir()`), état de l'archivage (`pg_stat_archiver` :
      `failed_count` n'augmente pas, `last_archived_time` récent) et aucun slot de réplication qui retient du
      WAL. Un archivage en échec ou un répertoire WAL qui ne redescend pas après le checkpoint arrête la
      série.
- [ ] Arrêt immédiat si l'espace libre passe sous 2 Go : la transaction du flux en cours est annulée, rien
      n'est écrit.

## 2. Sauvegarde restaurable

- [ ] Une sauvegarde récente existe (date relevée dans le dashboard) et son mode est connu : sauvegarde
      quotidienne seule, ou restauration à un instant donné.
- [ ] Une restauration a été **essayée** sur un projet jetable, pas seulement affichée comme disponible.
      (À confirmer : je n'ai pas vérifié que la restauration est activée sur ce projet.)
- [ ] La durée de cette restauration est notée, pour savoir ce que coûterait un retour arrière complet.
- [ ] Sans sauvegarde restaurable, l'import ne démarre pas.

## 3. Connectivité directe et TLS

Limitations constatées chez le fournisseur le 2026-10-18 (relevées par poignée de main TLS et requêtes
en lecture seule, sans connexion des rôles du lot) :

- L'hôte de connexion directe n'a **qu'un enregistrement IPv6** (pas d'IPv4 sans option payante, à
  confirmer dans le dashboard). Il est joignable seulement depuis une machine qui a une connectivité IPv6
  de bout en bout. Constaté sur le poste de développement : le côté Windows joint l'hôte (TCP établi), mais
  WSL2 en mode réseau NAT n'a **aucune adresse IPv6 globale ni route par défaut IPv6** (seulement du
  lien-local) et la connexion échoue (`errno 101`, réseau inaccessible). L'import direct se lance donc
  depuis une machine qui a de l'IPv6 dans la session qui exécute l'outil : un hôte avec IPv6 natif, WSL en
  mode réseau « mirrored » (réglage `.wslconfig` suivi d'un redémarrage de WSL, à décider), ou l'option IPv4
  du projet.
- L'URL `DIRECT_URL` du projet passe en réalité par le **pooleur en mode session** (certificat
  `*.pooler`, utilisateur de la forme `role.projet`). Ce mode garde la session, mais il ne répond pas à
  « connexion directe ». La garde le refuse (hôte de pooleur, utilisateur à point). L'accepter serait un
  changement de contrat à décider explicitement : il n'est pas fait.
- Le certificat du serveur est signé par une autorité propre au fournisseur (« Supabase Root 2021 CA »),
  absente des magasins publics : sans fichier d'autorité, `verify-full` échoue (`self-signed certificate in
certificate chain`). Avec ce fichier, la chaîne et le nom d'hôte se vérifient (contrôlé avec `openssl`
  sur le pooleur : accepté avec l'autorité du fournisseur, refusé avec un autre nom d'hôte). Le certificat
  de l'autorité est téléchargeable dans les réglages de la base du dashboard (à confirmer). Comparer son
  empreinte SHA-256 à celle présentée par le serveur :
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
  Ne jamais faire confiance à une autorité simplement parce qu'elle est présentée par le serveur.
- Le certificat de l'hôte de connexion directe a été contrôlé le 2026-10-18 par un tunnel TCP temporaire
  (octets non modifiés, TLS de bout en bout) : trois certificats présentés, feuille dont le nom alternatif
  est exactement l'hôte direct (valide jusqu'en janvier 2031), même autorité racine que celle du pooleur
  (même empreinte que ci-dessus). Avec ce fichier d'autorité, `verify-full` est accepté en TLS 1.3 ; avec un
  autre nom d'hôte, il est refusé. Une connexion en lecture seule par cet hôte atteint le même cluster que
  la connexion actuelle (même identifiant système), sur un primaire, avec `EXECUTE` sur `pg_control_system()`
  pour les trois rôles. Latence mesurée à travers le tunnel : environ 23 ms.

À contrôler avant l'import :

- [ ] L'URL du rôle est une connexion directe (jamais un pooleur : port 6543, hôte de pooleur, utilisateur
      de la forme `role.projet`), avec `sslmode=verify-full`. `require` et `verify-ca` sont refusés : selon
      la bibliothèque ils ne vérifient ni la chaîne ni le nom.
- [ ] `HG_TARGET_CA_FILE` désigne le fichier PEM de l'autorité du fournisseur, dont l'empreinte a été
      comparée à celle du dashboard. L'outil passe ce fichier au client TLS avec `rejectUnauthorized` et le
      nom d'hôte attendu : un certificat d'une autre autorité ou d'un autre nom est refusé.
- [ ] `npm run historical-groups -- fingerprint --role importer` imprime l'empreinte de l'hôte. Elle est
      comparée à celle attendue, et `HG_EXPECTED_TARGET_FINGERPRINT` est posée.
- [ ] `HG_EXPECTED_SYSTEM_IDENTIFIER` est posé avec l'identifiant du cluster relevé par un administrateur
      (`SELECT system_identifier FROM pg_control_system()`). L'outil le relit à chaque connexion : un
      projet inattendu est refusé même si l'hôte est le bon, et un identifiant illisible est refusé (aucun
      repli silencieux). `EXECUTE` sur `pg_control_system()` est accordé à `PUBLIC` (vérifié le 2026-10-18
      par `has_function_privilege` pour les trois rôles du lot) : aucun privilège supplémentaire n'est
      donné. À revérifier avant l'import : si ce droit était un jour retiré à `PUBLIC`, l'outil refuse de
      s'exécuter plutôt que de s'en passer.
- [ ] `HG_TARGET=shared` est posé explicitement. Sans lui, les outils n'acceptent que la base locale.
- [ ] Un plan (`import --stream S`, lecture seule) réussit avant tout `--apply`. Il vérifie aussi que
      la session est réelle (le backend ne change pas entre deux requêtes), en TLS, sur un primaire.
- [ ] Pour une écriture : `HG_ALLOW_SHARED_WRITE` vaut le début de l'empreinte imprimée par `fingerprint`.
      C'est la reconnaissance écrite de cette cible précise.

## 4. Stockage privé des archives

- [ ] Le stockage Vercel Blob **privé** est dédié (variable `HG_BLOB_READ_WRITE_TOKEN`, distincte du jeton
      des photos). À confirmer dans le dashboard : que la boutique accepte l'accès privé, son quota, et que
      le jeton n'a que cette boutique.
- [ ] Le dossier de copie hors ligne indépendante (`HG_OFFLINE_COPY_DIR`) est un autre dossier que
      `HG_ARCHIVE_DIR`, idéalement un autre support, et contient chaque archive sous `<sha256>.zip`.
- [ ] L'import dépose l'archive avant d'écrire une ligne : adressage par SHA-256, aucun écrasement,
      relecture et nouveau hachage après l'envoi. Un refus ou une panne arrête tout, rien n'est écrit en
      base.
- [ ] Après l'import, relire chaque archive du stockage et vérifier qu'elle porte toujours son SHA-256.

## 5. Contrôle des rôles

Les rôles sont `NOLOGIN` tant que cette étape n'est pas décidée.

- [ ] Les mots de passe sont générés hors dépôt, rangés dans le gestionnaire de secrets, jamais dans un
      fichier d'environnement partagé avec l'application.
- [ ] `LOGIN` et le mot de passe sont posés **juste avant** l'import, par le propriétaire.
- [ ] Chaque rôle est contrôlé : ni superutilisateur, ni BYPASSRLS, ni CREATEROLE, ni CREATEDB, propriétaire
      d'aucune table. Les privilèges de la matrice du rapport de la PR A sont les seuls présents. L'outil
      refuse de se connecter si l'une de ces conditions n'est pas vraie.
- [ ] RLS activée sur les 16 tables (`relrowsecurity`). La migration le vérifie, on le relit.
- [ ] `anon`, `authenticated` et `PUBLIC` n'ont aucun droit sur les tables du lot.

## 6. Import, un flux à la fois

Pour AMO30, puis scrutins 15e, 16e, 17e :

- [ ] Plan en lecture seule, comptes relus (AMO30 : 14 970 lignes ; 15e : 517 463 ; 16e : 652 171 ;
      17e : 1 439 379), empreinte du plan notée.
- [ ] `--apply --confirm <empreinte> --store blob`. Une confirmation absente ou périmée est refusée.
- [ ] Un second plan sur le même flux annonce `ALREADY_IMPORTED`.

## 7. Vérification de chaque snapshot

- [ ] `verify --stream S --seq N --with-archive` : aucun problème, empreinte d'état identique en base et
      dans l'archive, aucun orphelin, comptes égaux à `recordCounts`.
- [ ] La vérification a été relancée depuis l'archive relue **du stockage privé**, pas seulement du disque.

## 8. Libération (geste humain)

- [ ] Relecture du rapport de vérification par une personne.
- [ ] `release` par le propriétaire (`HG_SHARED_OWNER_ROLE`), avec l'empreinte de la vérification. Jamais par
      un rôle du lot.

## 9. Runs

- [ ] `run --legislature N` à blanc d'abord : recoupement avec le baseline sans écart (77, 4 380 et 371
      conflits, 1 916 `PO0`).
- [ ] `run --apply`, puis `verify-run` : même empreinte de sortie.
- [ ] Aucune position publiable dans un scrutin dont les décomptes officiels sont discordants.

## 10. Retour à NOLOGIN

- [ ] `ALTER ROLE ... NOLOGIN` pour les trois rôles, mots de passe supprimés du gestionnaire ou archivés.
- [ ] Contrôle : aucun rôle du lot ne peut ouvrir de session.
- [ ] État consigné dans la mémoire du projet et dans le rapport de l'opération.

## Retour arrière

- Un snapshot ne se supprime pas : un import faux se **révoque** (décision `REVOKED` par un humain), et les
  runs qui l'épinglent deviennent à revoir.
- Les scripts de retour arrière du lot ne s'exécutent que sur des tables vides.
- Une restauration complète de la base est le dernier recours : sa durée est celle notée à l'étape 2.
