# Dissocier la décision judiciaire de l'affaire éditoriale

Document de conception pour l'issue #536. **Audit et conception uniquement** : aucune
migration, aucune modification de schéma, aucune implémentation.

Mesures faites en lecture seule le 2026-07-25 sur 463 affaires.

---

## 1. Résumé exécutif

Le modèle actuel pose les identifiants d'une décision de justice directement sur
`Affair`, et rend `Affair.ecli` unique. Il suppose donc :

```
une décision judiciaire = une affaire éditoriale
```

Le premier tri réel des doublons a produit un contre-exemple certain. Deux
condamnations d'Alain Carignon partagent le même numéro de pourvoi, la même date de
faits, la même date de verdict et le même arrêt de cassation, et représentent
pourtant deux chefs distincts : abus de biens sociaux, et subornation de témoin.
Elles ont été classées « affaires liées », pas « doublon ».

**Recommandation : créer `JudicialDecision` et une table de liaison, sans enum de
relation, sans rien retirer d'`Affair` dans un premier temps.**

Trois éléments justifient d'agir maintenant plutôt que plus tard :

1. le cas est **démontré**, pas supposé ;
2. `Affair.ecli @unique` rend ce cas **inexprimable** en base ;
3. la couverture des identifiants est de **0,6 %**, donc le remplissage est devant
   nous, notamment par #337. Remplir sur le modèle actuel reproduirait l'hypothèse
   fausse à grande échelle, et la migration se ferait alors sur des données déjà
   incohérentes.

L'audit a par ailleurs invalidé deux hypothèses que l'issue portait implicitement :
`Affair.court` et `Affair.verdictDate` **ne sont pas** des attributs de décision
aujourd'hui, et ne doivent donc pas migrer.

---

## 2. Données mesurées

### Remplissage des champs, sur 463 affaires

| Champ                             | Renseigné |   Part |
| --------------------------------- | --------: | -----: |
| `ecli`                            |     **0** |  0,0 % |
| `pourvoiNumber`                   |     **3** |  0,6 % |
| `caseNumber`                      |     **0** |  0,0 % |
| `caseNumbers`                     |     **0** |  0,0 % |
| `chamber`                         |     **0** |  0,0 % |
| `court`                           |       245 | 52,9 % |
| `court` valant la chaîne `"null"` |    **30** |  6,5 % |
| `verdictDate`                     |       163 | 35,2 % |

### Références partagées

| Signal                               | Groupes | Affaires |
| ------------------------------------ | ------: | -------: |
| `pourvoiNumber`, après normalisation |   **1** |        2 |
| `caseNumber`                         |       0 |        0 |
| `caseNumbers`                        |       0 |        0 |
| URL judiciaire partagée              |       0 |        0 |

La normalisation (`96-83.698` → `9683698`) ne révèle aucun partage supplémentaire :
aucun groupe ne se cachait derrière une variante d'écriture.

### Identifiants présents ailleurs que dans leur champ

| Recherche                              | Trouvés |
| -------------------------------------- | ------: |
| ECLI dans titre, description, sources  |   **0** |
| Numéro au format pourvoi hors du champ |   **0** |

Il n'y a donc **rien à récupérer par extraction de texte**. Le vide est réel, pas un
défaut de saisie structurée.

### Sources officielles

| Cible                               | Sources |
| ----------------------------------- | ------: |
| Judilibre                           |   **0** |
| Cour de cassation                   |       1 |
| Légifrance                          |       7 |
| URL contenant un ECLI ou un pourvoi |       0 |

Répartition des `sourceType` : `PRESSE` 1464, `WIKIPEDIA` 213, `MANUAL` 55,
`WIKIDATA` 48. **Aucune source `JUDILIBRE`.**

### Le champ `court` ne décrit pas une juridiction

Sur les 245 affaires où `court` est renseigné :

| Nature de l'organe            | Affaires |       Part |
| ----------------------------- | -------: | ---------: |
| **N'est pas une juridiction** |   **65** | **26,5 %** |
| dont parquets                 |       55 |            |
| dont conseils de prud'hommes  |        9 |            |
| dont commissions              |        1 |            |

Un parquet poursuit, il ne rend pas de décision. Par ailleurs **9 affaires**
décrivent plusieurs étapes de procédure dans une seule chaîne, par exemple
« Tribunal correctionnel de Nîmes (première instance 1995), Cour d'appel de Nîmes
(appel 2019 et 2021) ».

Le champ compte **90 valeurs distinctes après normalisation**, dont 4 orthographes
de « Cour de cassation ». C'est du texte libre décrivant _où en est le dossier_,
pas _quelle juridiction a rendu quelle décision_.

### Le champ `verdictDate` n'est pas toujours une date de décision

Sur les 163 affaires qui le portent :

- **21** n'ont aucune juridiction associée ;
- **4** sont à un stade où **aucune décision n'a été rendue** : enquête
  préliminaire, mise en examen, renvoi devant le tribunal. L'une d'elles vise une
  sanction disciplinaire du Bureau du Sénat, qui n'est pas une décision de justice.

`verdictDate` est donc au moins partiellement une **date éditoriale de synthèse**,
signifiant « dernier résultat connu ».

---

## 3. Cas réels

### Cas 1 — certain : deux chefs d'un même arrêt

```
référence commune    pourvoi 96-83.698
affaires             2
personnalité         une seule
titres               « Abus de biens sociaux » / « Subornation de témoin »
catégories           ABUS_BIENS_SOCIAUX / AUTRE
statuts              CONDAMNATION_DEFINITIVE dans les deux cas
dates                faits 1989-01-01, verdict 1997-10-27, identiques
juridiction          Cour de cassation (rejet pourvoi), identique
jugement enregistré  LINKED
raison probable      chefs distincts
```

C'est le seul groupe de la base identifiable par une référence officielle, et ce
n'est **pas** un doublon.

### Cas 2 — candidat, non confirmé

```
référence commune    aucune ; seule la date de verdict coïncide
affaires             2
personnalité         une seule
catégories           INJURE / DIFFAMATION
statuts              condamnations, toutes deux publiées
dates                verdict identique, 2025-12-02
juridiction          absente ou divergente
jugement enregistré  aucun
raison probable      chefs distincts, à vérifier
```

Même motif que le cas 1, mais **sans identifiant pour le prouver**. Il illustre
exactement ce que le modèle actuel ne permet pas d'enregistrer.

### Ce que ces deux cas disent

La question « combien d'affaires partagent une décision » n'est pas répondable avec
les données actuelles. **19 affaires citent la Cour de cassation, dont 16 sans
aucun identifiant structuré.** Le chiffre de 1 groupe mesure le remplissage du
champ, pas la fréquence du phénomène.

---

## 4. Audit des usages

### Matrice par champ

| Champ           | Usage actuel                                         | Niveau conceptuel correct                               | Doit migrer ?               | Compatibilité nécessaire                       |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `ecli`          | export CSV, propositions, matching, fusion additive  | `IDENTITÉ_DE_DÉCISION`                                  | **oui**                     | colonne CSV « ECLI »                           |
| `pourvoiNumber` | matching, propositions, fusion additive              | `IDENTITÉ_DE_DÉCISION`                                  | **oui**                     | aucune surface publique                        |
| `caseNumbers`   | matching (`hasSome`), propositions                   | `IDENTITÉ_DE_DÉCISION`                                  | **oui**                     | aucune, champ vide                             |
| `caseNumber`    | page publique, fusion additive                       | `IDENTITÉ_DE_DÉCISION`                                  | **oui**                     | bloc « N° dossier » sur la fiche               |
| `chamber`       | page publique, `AffairCard`, admin                   | `IDENTITÉ_DE_DÉCISION`                                  | **oui**, coût nul (0 ligne) | bloc « Chambre » sur la fiche                  |
| `court`         | page publique, export CSV, admin, fusion             | **`À_CLARIFIER`** : 26,5 % ne sont pas des juridictions | **non en l'état**           | bloc « Tribunal », colonne CSV « Juridiction » |
| `verdictDate`   | **clé de tri**, API publique, MCP, export, affichage | `CONTENU_ÉDITORIAL_D_AFFAIRE`                           | **non**                     | tri, API, MCP, export                          |

### Détail par zone

| Zone                                             | Champs touchés                                        | Classement                                |
| ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------- |
| `prisma/schema.prisma`                           | les 7                                                 | —                                         |
| `services/affairs/matching.ts`                   | `ecli`, `pourvoiNumber`, `caseNumbers`, `verdictDate` | `IDENTITÉ_DE_DÉCISION` sauf `verdictDate` |
| `services/affairs/reconciliation.ts`             | tous, via `ADDITIVE_MERGE_FIELDS`                     | `IDENTITÉ_DE_DÉCISION` + `À_CLARIFIER`    |
| `services/affairs/proposals.ts`                  | whitelist de 13 champs                                | mixte                                     |
| `services/affairs/absorb-draft.ts`               | `court` proposé, identifiants transférés              | frontière déjà tracée                     |
| `services/sync/judilibre.ts`                     | `ecli`, `pourvoiNumber`                               | `IDENTITÉ_DE_DÉCISION`                    |
| `services/sync/discover-affairs*`                | `verdictDate`                                         | `CONTENU_ÉDITORIAL_D_AFFAIRE`             |
| `lib/data/affairs.ts`, `condamnations.ts`        | `verdictDate` en `orderBy`                            | `CONTENU_ÉDITORIAL_D_AFFAIRE`             |
| `api/affaires`, `api/politiques/[slug]/affaires` | `verdictDate`                                         | contrat public                            |
| `api/export/affaires`                            | `verdictDate`, `court`, `ecli`                        | contrat public                            |
| `app/affaires/[slug]`                            | `court`, `chamber`, `caseNumber`                      | contrat public                            |
| `components/politicians/AffairCard.tsx`          | `chamber`                                             | affichage                                 |
| MCP (`transparence-politique-mcp`)               | `verdictDate` seul                                    | contrat public                            |
| `lib/security/schemas/affair*.ts`                | validation admin + whitelist de propositions          | garde                                     |

**Aucun usage dans le SEO, les données structurées, la recherche interne ni les
embeddings.** La surface de compatibilité est donc étroite : trois colonnes CSV, un
bloc de la fiche publique, `verdictDate` dans deux API et le MCP, et le tri.

---

## 5. Frontières conceptuelles

### Ce qui décrit objectivement une décision

`judilibreId`, `ecli`, `pourvoiNumber`, `decisionDate`, `court` (la juridiction
émettrice), `chamber`, `solution`, `sourceUrl`.

### Ce qui reste éditorial sur `Affair`

Titre, description, catégorie, gravité, implication de la personnalité, période des
faits, statut de synthèse, publication, sources de presse.

### `verdictDate` reste sur `Affair`

Trois raisons, dont deux mesurées :

1. **Ce n'est pas toujours une date de décision** : 4 affaires la portent alors
   qu'aucune décision n'a été rendue, 21 sans juridiction.
2. **C'est une clé de tri** dans `lib/data/affairs.ts` et `condamnations.ts`, donc
   un déplacement casserait le classement de toutes les listes.
3. Elle est exposée par l'API publique, le MCP et l'export.

`JudicialDecision.decisionDate` portera la date **de la décision**.
`Affair.verdictDate` reste la date éditoriale du **dernier résultat connu**. Les
deux coexistent et ne disent pas la même chose : il faut le documenter, pas le
fusionner.

### `court` ne migre pas en l'état

26,5 % des valeurs ne sont pas des juridictions, et 9 empilent plusieurs étapes.
Migrer ce champ tel quel remplirait `JudicialDecision.court` avec des parquets,
c'est-à-dire avec des données fausses dans un champ neuf.

`JudicialDecision.court` sera renseigné **uniquement** à partir d'une source
officielle, typiquement Judilibre. `Affair.court` reste une dénormalisation
éditoriale, et son nettoyage est un chantier de qualité de données distinct.

### Dépendances vers #516 et #517

L'audit a rencontré trois besoins qui **n'appartiennent pas** à #536 :

| Besoin rencontré                                                      | Renvoi                                    |
| --------------------------------------------------------------------- | ----------------------------------------- |
| 9 affaires décrivant une chaîne d'étapes dans `court`                 | **#516** procédure et étapes              |
| 55 affaires dont l'organe est un parquet, donc un stade d'instruction | **#516**                                  |
| Le cas Carignon : un même arrêt, deux chefs, un seul condamné         | **#517** pour le résultat par participant |
| Une décision visant plusieurs personnes                               | **#517**                                  |

Ils sont consignés ici, pas modélisés.

---

## 6. Modèle recommandé

```prisma
model JudicialDecision {
  id String @id @default(cuid())

  /// Clé externe Judilibre, quand la décision en vient.
  judilibreId String? @unique
  /// Identifiant européen : identifie exactement une décision.
  ecli        String? @unique

  /// Tel que publié, pour l'affichage : « 96-83.698 ».
  pourvoiNumber           String?
  /// Sans séparateurs, pour le rapprochement : « 9683698 ». Indexé, NON unique.
  pourvoiNumberNormalized String?

  decisionDate DateTime?
  /// La juridiction émettrice, jamais un parquet.
  court        String?
  chamber      String?
  /// Sens de la décision : rejet, cassation, cassation partielle…
  solution     String?
  /// URL officielle canonique.
  sourceUrl    String?

  /// Charge brute de la source officielle. Non requêtable, non faisant foi,
  /// jamais un endroit où ranger un champ modélisable.
  metadata Json?

  affairs AffairJudicialDecision[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([pourvoiNumberNormalized])
  @@index([decisionDate])
}

model AffairJudicialDecision {
  affairId           String
  judicialDecisionId String

  /// Texte libre en attendant d'avoir assez de cas pour un enum honnête.
  notes String?

  affair           Affair           @relation(fields: [affairId], references: [id], onDelete: Cascade)
  judicialDecision JudicialDecision @relation(fields: [judicialDecisionId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@id([affairId, judicialDecisionId])
  @@index([judicialDecisionId])
}
```

### Contraintes uniques recommandées

| Contrainte                             | Recommandation               | Raison                                                                                                                                                                               |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `judilibreId @unique`                  | **oui**                      | clé primaire externe                                                                                                                                                                 |
| `ecli @unique`                         | **oui**, **sur la décision** | un ECLI identifie une décision ; c'est le bon domicile de l'unicité aujourd'hui mal placée sur `Affair`                                                                              |
| `pourvoiNumberNormalized`              | **index seul, PAS unique**   | un même pourvoi peut produire plusieurs décisions (rejet, cassation partielle, renvoi). Aucune preuve du contraire dans les données ; ne pas transformer une intuition en contrainte |
| `@@id([affairId, judicialDecisionId])` | **oui**                      | empêche une liaison en double                                                                                                                                                        |

### Réponses aux dix questions de l'issue

1. **`sourceUrl` unique ou relation ?** Champ unique pour l'instant. Mesuré : 8 URLs
   judiciaires, **0 partagée**, aucune décision citée par deux URLs. Une relation se
   justifiera quand un second lien officiel apparaîtra réellement.
2. **Colonne normalisée séparée ?** **Oui.** L'audit a dû normaliser pour regrouper
   `96-83.698`. Sans colonne dédiée, chaque requête referait la normalisation, et
   aucun index ne servirait.
3. **Plusieurs numéros par décision ?** **Pas maintenant.** Une décision de cassation
   peut joindre plusieurs pourvois, mais zéro cas en base. Un tableau ajouterait de
   la complexité sans preuve.
4. **`metadata Json` justifié ?** **Oui, mais strictement borné** à la charge brute
   d'une source officielle. Le risque réel est qu'il devienne un débarras : la
   contrainte doit être écrite dans le code et tenue en revue.
5. **`relationType` nécessaire ?** **Non, pas maintenant.** Voir ci-dessous.
6. **Les valeurs proposées sont-elles orthogonales ?** **Non.**
7. **`APPEAL_OR_CASSATION`** décrit une relation **entre deux décisions**, pas entre
   une décision et une affaire. Sa place est un futur lien décision ↔ décision, ou
   #516.
8. **`SAME_PROCEEDING`** décrit une **procédure**, donc #516.
9. **`ONE_OF_MULTIPLE_COUNTS`** est la seule valeur qui qualifie réellement le lien
   affaire ↔ décision. C'est aussi le seul cas observé, une fois.
10. **Commencer sans enum ?** **Oui.** Un seul cas réel ne peut pas justifier cinq
    valeurs dont trois relèvent d'autres issues. `notes String?` suffit à consigner
    ce qu'un relecteur constate ; l'enum viendra quand cinq cas réels au moins
    auront été observés et classés.

---

## 7. Modèles rejetés

| Modèle                                                                 | Rejeté parce que                                                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Relation un-à-plusieurs `Affair → JudicialDecision`                    | ne résout rien : une décision resterait attachée à une seule affaire, exactement le défaut actuel                                 |
| Garder les identifiants sur `Affair` et lever seulement `ecli @unique` | permettrait d'enregistrer le cas Carignon, mais dupliquerait les attributs de la décision sur chaque fiche, sans source de vérité |
| Modéliser d'emblée décision + procédure + participant                  | c'est #516 et #517 réunis. Un chantier de cette taille sur une base à 0,6 % de couverture ne se valide sur rien                   |
| Enum `JudicialDecisionRelation` dès la première PR                     | cinq valeurs pour un cas observé, dont trois appartiennent à d'autres issues                                                      |
| Migrer `court` et `verdictDate` vers la décision                       | mesuré faux : 26,5 % de non-juridictions, et une date de verdict sur des procédures en cours                                      |

---

## 8. Stratégie de migration progressive

### Phase 1 — fondations additives

**Périmètre** : création des deux modèles. Aucun retrait sur `Affair`, aucune
lecture modifiée, aucune contrainte levée.

- Fichiers : `prisma/schema.prisma`, une migration additive documentée.
- Risques : très faibles, purement additifs. Vérifier par `migrate diff` qu'aucun
  `ALTER` ne touche une table existante et qu'aucune clé étrangère n'est ajoutée
  sur `Affair` hors de la table de liaison.
- Tests : validation du schéma, préconditions d'absence des tables.
- Métriques : tables présentes et vides, `Affair` inchangée à 463 lignes.
- Rollback : `DROP TABLE` des deux modèles. Aucune perte, elles n'existaient pas.
- Dépendances : aucune.

### Phase 2 — backfill contrôlé

**Périmètre** : créer les décisions à partir des références existantes et lier les
affaires. Volume attendu : **2 décisions, 3 liaisons** (Carignon x2, Balkany x1).

- Risques : quasi nuls vu le volume. Le seul piège est de déduire un doublon d'un
  identifiant partagé, ce qui est explicitement interdit.
- Le cas Carignon crée **une** décision liée à **deux** affaires, sans les fusionner.
- Tests : idempotence prouvée par double exécution, comptes avant/après.
- Métriques : 2 décisions, 3 liaisons, 463 affaires inchangées.
- Rollback : suppression des lignes créées ; `Affair` n'a pas été touchée.
- Dépendances : aucune.

### Phase 3 — double lecture

**Périmètre** : les nouvelles lectures privilégient `JudicialDecision`, avec repli
sur les champs d'`Affair`.

- Fichiers probables : `lib/data/affairs.ts`, `app/affaires/[slug]/page.tsx`,
  `api/export/affaires/route.ts`.
- Risques : le principal est l'**affaire liée à plusieurs décisions**, traité en §9.
- Tests : une affaire sans décision liée rend exactement ce qu'elle rendait avant.
- Métriques : diff nul sur l'export CSV pour les 463 affaires actuelles.
- Rollback : retirer le chemin de lecture neuf ; les champs d'origine sont intacts.
- Dépendances : aucune.

### Phase 4 — alimentation ciblée

**Périmètre** : Judilibre crée ou met à jour une `JudicialDecision` à partir d'une
référence connue, et ne crée jamais d'`Affair`. Les corrections éditoriales passent
par des propositions.

- Dépendance **bloquante** : **#337**, qui est elle-même en attente de cette issue.
- Risques : réintroduire une découverte nominale. Le cron reste désactivé.
- Métriques : décisions créées, propositions ouvertes, **zéro affaire créée**.

### Phase 5 — dépréciation

**Périmètre** : inventaire des champs encore lus, puis retrait éventuel.

- **`Affair.ecli @unique` ne peut être levée qu'une fois `JudicialDecision.ecli`
  peuplée et lue**, sinon on perd la seule garantie d'unicité existante.
- `chamber` et `caseNumbers` sont à 0 ligne : leur retrait est sans risque de perte,
  mais reste une migration destructive, donc séparée et réversible.
- `court` et `verdictDate` **ne sont pas candidats au retrait** : ils restent
  éditoriaux.
- Rollback : chaque retrait dans sa propre migration, précédée du déploiement du
  code qui ne les lit plus.

---

## 9. Compatibilité des contrats

### Surface réelle à préserver

| Contrat                               | Champs exposés                   |
| ------------------------------------- | -------------------------------- |
| Export CSV `/api/export/affaires`     | `verdictDate`, `court`, `ecli`   |
| API publique `/api/affaires`          | `verdictDate`                    |
| API `/api/politiques/[slug]/affaires` | `verdictDate`                    |
| MCP                                   | `verdictDate`                    |
| Fiche publique `/affaires/[slug]`     | `court`, `chamber`, `caseNumber` |
| Tri des listes                        | `verdictDate`                    |

Aucun usage dans le SEO, les données structurées, la recherche interne ni les
embeddings.

### Décision : les contrats continuent d'exposer les champs plats

Ils restent servis depuis `Affair` tant que la phase 5 n'a pas eu lieu. Aucun
consommateur n'a à changer.

### Sélection quand une affaire est liée à plusieurs décisions

**Ne pas choisir « la plus récente » par défaut.** Sur le cas Carignon, les deux
affaires sont liées à une seule décision, donc la question ne se pose pas encore.
Mais dans le cas inverse, une affaire couvrant première instance puis appel puis
cassation, « la plus récente » afficherait la cassation, ce qui est souvent un
rejet de forme et non le résultat que le lecteur cherche.

Règle recommandée, par ordre de priorité :

1. **la valeur historique d'`Affair`**, tant qu'elle existe : elle a été écrite ou
   validée par la modération, elle fait foi ;
2. **s'il n'y en a pas et qu'une seule décision est liée**, la valeur de cette
   décision ;
3. **s'il n'y en a pas et que plusieurs décisions sont liées**, **aucune valeur
   synthétique**. Le champ plat reste vide et la fiche affiche la liste des
   décisions.

Autrement dit : jamais d'agrégat implicite. Une affaire à plusieurs décisions rend
un tableau, pas une valeur choisie par une règle que le lecteur ne voit pas.

---

## 10. Relation avec Judilibre

Le pipeline de découverte nominale reste **définitivement abandonné** : 0 affaire
produite sur 156 décisions, corpus pseudonymisé. Voir #337.

Cette issue est le **préalable** à sa réorientation. Sans entité de décision
partagée, un enrichissement Judilibre retomberait dans l'hypothèse « une décision =
une affaire ». Avec elle, le flux devient :

```
référence connue → récupération ciblée → JudicialDecision → liaison → propositions
```

Judilibre ne décide jamais qu'une affaire est un doublon, qu'une affaire doit être
créée, ou qu'un statut public doit changer.

État actuel : **0 source `JUDILIBRE`** en base. Tout est à construire.

---

## 11. Dépendances #516 et #517

| Issue         | Objet                                                               | Frontière                                                        |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **#536**, ici | identité d'une décision officielle et sa liaison à plusieurs fiches | ne modélise ni étapes, ni participants, ni résultats individuels |
| **#516**      | procédure et ses étapes                                             | reçoit les 9 chaînes `court` multi-étapes et les 55 parquets     |
| **#517**      | rôle et résultat par participant                                    | reçoit le cas d'une décision visant plusieurs personnes          |

Ces trois chantiers ne doivent pas être fusionnés. `JudicialDecision` est
délibérément plus petit que `AffairProceeding`.

---

## 12. Risques

| Risque                                                 | Gravité                                         | Atténuation                                                                     |
| ------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Remplir `JudicialDecision.court` depuis `Affair.court` | **élevée** : 26,5 % de valeurs fausses          | ne backfiller `court` que depuis une source officielle                          |
| Déduire un doublon d'un identifiant partagé            | **élevée** : c'est l'erreur que #525 a corrigée | interdit explicitement en phase 2, aucun code de fusion dans ce chantier        |
| Lever `Affair.ecli @unique` trop tôt                   | moyenne                                         | phase 5 seulement, après peuplement et lecture de la décision                   |
| Figer un enum sur un seul cas                          | moyenne                                         | pas d'enum avant cinq cas réels                                                 |
| `metadata Json` devenant un débarras                   | moyenne                                         | borné à la charge brute, vérifié en revue                                       |
| Casser le tri par `verdictDate`                        | moyenne                                         | le champ ne migre pas                                                           |
| Modéliser dans le vide, 0,6 % de couverture            | faible                                          | c'est l'argument inverse : le volume nul rend la migration triviale aujourd'hui |

---

## 13. Découpage recommandé en PR

| PR  | Contenu                                                      | Taille  | Bloquée par |
| --- | ------------------------------------------------------------ | ------- | ----------- |
| 1   | schéma additif : `JudicialDecision` + liaison, sans enum     | petite  | —           |
| 2   | service de création et de liaison, tests, **aucun backfill** | moyenne | 1           |
| 3   | backfill contrôlé des 2 décisions, idempotent, rapport       | petite  | 2           |
| 4   | double lecture avec repli, fiche publique et export          | moyenne | 3           |
| 5   | admin : voir et lier une décision à une affaire              | moyenne | 4           |
| 6   | Judilibre alimente les décisions depuis une référence        | grande  | 5, **#337** |
| 7   | dépréciation : inventaire puis retrait, migration réversible | petite  | 6           |

---

## 14. Critères d'acceptation de la future implémentation

- [ ] Une décision peut être liée à plusieurs affaires, et le cas Carignon est
      enregistré comme tel
- [ ] Aucun code ne déduit un doublon d'un identifiant partagé
- [ ] `JudicialDecision.court` n'est jamais renseigné depuis `Affair.court`
- [ ] `Affair.verdictDate` reste la date éditoriale et continue de trier les listes
- [ ] L'export CSV rend exactement les mêmes valeurs qu'avant pour les 463 affaires
      actuelles
- [ ] Une affaire liée à plusieurs décisions n'expose **aucune** valeur plate
      synthétique
- [ ] `Affair.ecli @unique` n'est levée qu'après peuplement et lecture effective
- [ ] Le backfill est idempotent, prouvé par double exécution
- [ ] Judilibre ne crée aucune `Affair`
- [ ] Aucune migration destructive dans la même PR qu'un changement de lecture

---

## 15. Questions encore ouvertes

Elles n'empêchent pas la phase 1, mais doivent être tranchées avant la phase 4.

1. **Qu'est-ce que `solution` ?** Judilibre expose un vocabulaire propre (rejet,
   cassation, cassation partielle, non-admission). Faut-il un enum, une chaîne
   libre, ou les deux le temps d'observer ? Aucune donnée pour trancher : 0 source
   Judilibre.
2. **Un pourvoi peut-il produire plusieurs décisions ?** Probablement oui en droit,
   mais non vérifié dans la documentation du domaine. C'est ce qui justifie de ne
   pas rendre `pourvoiNumberNormalized` unique, et il faut le confirmer.
3. **Quelle identité canonique sans ECLI ?** Aujourd'hui aucune affaire n'a d'ECLI.
   Le couple (juridiction, date, numéro de pourvoi) est-il suffisant pour
   dédupliquer deux décisions, ou faut-il exiger un `judilibreId` ?
4. **Que devient une liaison quand une affaire est fusionnée ?** La fusion transfère
   déjà sources, événements et liens d'articles. Les liaisons de décision devront
   suivre la même règle, avec déduplication.
5. **Faut-il nettoyer les 30 `court = "null"` avant ou après ?** Défaut de données
   indépendant, mais qui polluerait tout backfill s'appuyant sur `court`.
6. **Les décisions non judiciaires ont-elles leur place ici ?** Sanction du Bureau
   du Sénat, décision HATVP, conseil de prud'hommes : ce ne sont pas des décisions
   pénales. Les inclure élargirait le modèle ; les exclure laisserait 65 affaires
   sans rattachement.

La question 6 est celle qui pèse le plus sur le périmètre. Elle mérite d'être
tranchée avant d'écrire la première ligne.
