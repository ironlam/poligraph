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

**Recommandation : créer une entité de décision juridictionnelle et une table de
liaison, sans enum de relation, sans rien retirer d'`Affair` dans un premier temps.
Nom retenu pour la future PR de schéma : `CourtDecision`**, et non
`JudicialDecision` — voir §4 bis.

Trois éléments justifient d'agir maintenant plutôt que plus tard :

1. le cas est **démontré**, pas supposé ;
2. `Affair.ecli @unique` rend ce cas **inexprimable** en base ;
3. la couverture des identifiants est de **0,6 %**, donc le remplissage est devant
   nous, notamment par #337. Remplir sur le modèle actuel reproduirait l'hypothèse
   fausse à grande échelle, et la migration se ferait alors sur des données déjà
   incohérentes.

L'audit a par ailleurs invalidé deux hypothèses que l'issue portait implicitement :
`Affair.court` et `Affair.verdictDate` **ne sont pas** des attributs de décision
aujourd'hui, et ne doivent donc pas migrer. `Affair.court` désigne en réalité
l'organe qui traite le dossier, ce qui inclut **58 organes non juridictionnels sur
245**, essentiellement des parquets.

Le périmètre du modèle est tranché ici : il représente **toute décision rendue par
une juridiction**, quel que soit son ordre, et **aucun acte d'une autorité non
juridictionnelle**. Une affaire n'a aucune obligation d'être liée à une décision.

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

### Le champ `court` désigne l'organe qui traite, pas la juridiction qui juge

Sur les 245 affaires où `court` est renseigné, en repliant accents et apostrophes.
Aucune valeur n'est restée non classée.

| Nature de l'organe                             | Affaires |       Part |
| ---------------------------------------------- | -------: | ---------: |
| **Juridictions, tous ordres**                  |  **187** |     76,3 % |
| dont juridictions judiciaires                  |      167 |            |
| dont juridictions administratives              |        9 |            |
| dont conseils de prud'hommes                   |        9 |            |
| dont juridiction financière (Cour des comptes) |        1 |            |
| dont juridiction européenne (CEDH)             |        1 |            |
| **N'est pas une juridiction**                  |   **58** | **23,7 %** |
| dont ministère public (parquets, procureurs)   |       56 |            |
| dont organes parlementaires                    |        2 |            |

Un parquet poursuit, il ne juge pas. Ni un parquet, ni une commission d'enquête
parlementaire, ni le Bureau du Sénat statuant en discipline ne rendent de décision
juridictionnelle.

En revanche un **conseil de prud'hommes est une juridiction de l'ordre judiciaire**
et rend des jugements, tout comme un tribunal administratif rend des décisions.
Les uns et les autres entrent donc dans le périmètre du modèle. Une version
antérieure de ce document les classait à tort parmi les organes non
juridictionnels, ce qui surestimait le chiffre à 65 sur 245.

Par ailleurs **9 affaires** décrivent plusieurs étapes de procédure dans une seule
chaîne, par exemple « Tribunal correctionnel de Nîmes (première instance 1995), Cour
d'appel de Nîmes (appel 2019 et 2021) ».

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
| `caseNumbers`   | matching (`hasSome`), propositions, jamais affiché   | `IDENTITÉ_DE_DÉCISION`                                  | **différé**, voir §6 bis    | aucune, champ vide                             |
| `caseNumber`    | page publique, carte, formulaire admin, fusion       | `CONTENU_ÉDITORIAL_D_AFFAIRE` en l'état                 | **différé**, voir §6 bis    | bloc « N° dossier » sur la fiche               |
| `chamber`       | page publique, `AffairCard`, admin                   | `IDENTITÉ_DE_DÉCISION`                                  | **oui**, coût nul (0 ligne) | bloc « Chambre » sur la fiche                  |
| `court`         | page publique, export CSV, admin, fusion             | **`À_CLARIFIER`** : 23,7 % ne sont pas des juridictions | **non en l'état**           | bloc « Tribunal », colonne CSV « Juridiction » |
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

## 4 bis. Périmètre du modèle, et nom retenu

### La définition

> Une **décision juridictionnelle** rendue par une juridiction identifiée, quel que
> soit son ordre ou sa matière.

Le critère n'est **pas** « pénal contre non pénal ». C'est :

```
décision rendue par une juridiction
        contre
acte ou sanction d'une autorité non juridictionnelle
```

### Ce que le modèle représente

Une décision rendue par une juridiction pénale, civile, un conseil de prud'hommes,
une juridiction administrative, une juridiction financière, une juridiction
européenne, ou une juridiction spécialisée dont la nature juridictionnelle est
établie.

### Ce qu'il ne représente pas

- une initiative, une réquisition ou une décision du **ministère public** ;
- une délibération, un avis ou une décision de la **HATVP**, autorité
  administrative indépendante ;
- une **sanction disciplinaire du Bureau du Sénat** ;
- les travaux d'une **commission d'enquête parlementaire** ;
- une simple **étape d'enquête ou d'instruction** ;
- tout acte institutionnel sans nature juridictionnelle.

### Une affaire sans décision liée est un état normal

**Une `Affair` n'a aucune obligation d'être liée à une décision.** Ce n'est ni un
défaut de données, ni un rattachement manquant.

Une affaire reste légitimement sans décision liée quand elle porte sur une enquête
en cours, une mise en examen, une action du parquet, une sanction parlementaire ou
une décision administrative non juridictionnelle. C'est précisément le cas des 58
affaires dont `court` désigne un organe non juridictionnel : elles n'attendent
aucune décision, elles décrivent un stade ou un acte qui n'en produit pas.

La liaison est donc **optionnelle par construction**, et la couverture ne constitue
pas une métrique de qualité.

### Nomenclature retenue dans ce document

| Terme                                                                                                                   | Rend une décision juridictionnelle ? |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| juridiction judiciaire (tribunal judiciaire, correctionnel, cour d'appel, cour de cassation, assises, prud'hommes, CJR) | **oui**                              |
| juridiction administrative (tribunal administratif, cour administrative d'appel, Conseil d'État)                        | **oui**                              |
| juridiction financière (Cour des comptes, chambre régionale des comptes)                                                | **oui**                              |
| juridiction européenne (CEDH, CJUE)                                                                                     | **oui**                              |
| autorité administrative indépendante (HATVP, Défenseur des droits)                                                      | non                                  |
| ministère public (parquet, procureur de la République)                                                                  | non                                  |
| organe parlementaire disciplinaire ou d'enquête (Bureau du Sénat, commission d'enquête)                                 | non                                  |

### `JudicialDecision` ou `CourtDecision` ?

**Recommandation : `CourtDecision`.**

| Nom                | Pour                                                                                                                                                                                   | Contre                                                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JudicialDecision` | reprend le vocabulaire de l'issue ; « judicial decision » est courant en anglais                                                                                                       | en droit français, « judiciaire » désigne **un des deux ordres**, par opposition à l'ordre administratif. Or le modèle doit couvrir les tribunaux administratifs et la Cour des comptes. Le nom encoderait la lecture étroite que cette correction vient précisément d'écarter |
| `CourtDecision`    | « court » se lit comme « juridiction », tous ordres confondus ; plus difficile à confondre avec l'ordre judiciaire français ; cohérent avec le champ `court` déjà présent sur `Affair` | « court » traduit plutôt « cour » que « conseil de prud'hommes », mais l'usage anglais de _court_ englobe toute juridiction                                                                                                                                                    |

L'argument décisif est l'ordre administratif. Le sens du modèle est qu'une décision
de tribunal administratif ou de conseil de prud'hommes est aussi une décision : le
nom ne doit pas suggérer le contraire.

L'intégration Judilibre ne tranche pas, `judilibreId` se lit aussi bien dans les
deux. La convention du dépôt non plus : le code est en anglais, les deux formes
l'étant également.

Les extraits de schéma de ce document portent désormais les noms actés :
**`CourtDecision`** et **`AffairCourtDecision`**.

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

`CourtDecision.decisionDate` porte la date **de la décision**.
`Affair.verdictDate` reste la date éditoriale du **dernier résultat connu**. Les
deux coexistent et ne disent pas la même chose : il faut le documenter, pas le
fusionner.

### `court` ne migre pas en l'état

23,7 % des valeurs ne sont pas des juridictions, et 9 empilent plusieurs étapes.
Migrer ce champ tel quel remplirait le champ `court` de la décision avec des
parquets, c'est-à-dire avec des données fausses dans un champ neuf.

Le champ `court` de la décision sera renseigné **uniquement** à partir d'une source
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
model CourtDecision {
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

model AffairCourtDecision {
  affairId        String
  courtDecisionId String

  /// Texte libre en attendant d'avoir assez de cas pour un enum honnête.
  notes String?

  affair        Affair        @relation(fields: [affairId], references: [id], onDelete: Cascade)
  courtDecision CourtDecision @relation(fields: [courtDecisionId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@id([affairId, courtDecisionId])
  @@index([courtDecisionId])
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

## 6 bis. `caseNumber` et `caseNumbers` : différés, et pourquoi

Le modèle ci-dessus n'en contient **aucun des deux**. Une version antérieure de ce
document les classait tous deux `IDENTITÉ_DE_DÉCISION` et « doit migrer », ce qui
était incohérent avec le schéma proposé. Position tranchée après audit.

### Ils ne veulent pas dire la même chose

| Champ         | Type       | Où il sert                                                                                                       | Nature réelle                                          |
| ------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `caseNumber`  | `String?`  | fiche publique (« N° dossier »), `AffairCard`, formulaire admin (« N° d'affaire »), `lib/validations/affairs.ts` | chaîne **saisie à la main et affichée**                |
| `caseNumbers` | `String[]` | rapprochement machine (`hasSome`), détection de doublons, whitelist auto-applicable des propositions             | identifiant **jamais affiché**, écrit par un importeur |

Ce ne sont donc pas un singulier et son pluriel : l'un est éditorial et visible,
l'autre est machine et invisible.

### Décision : différer les deux

Trois raisons :

1. **Ils sont à 0 ligne.** Rien à migrer, aucune pression de données.
2. **Les recopier importerait la confusion** ci-dessus dans un modèle neuf, où elle
   n'a pas lieu d'être.
3. **L'identité de la décision n'en a pas besoin** pour les phases 1 à 3 :
   `judilibreId`, `ecli` et `pourvoiNumber` suffisent.

Les champs historiques **restent sur `Affair`** pendant toute la transition, et
`caseNumber` continue d'être affiché tel quel.

### Quand les ajouter

Au moment où une source officielle les remplit, c'est-à-dire à la **phase 4**, quand
Judilibre montrera ce qu'une décision porte réellement et avec quelle cardinalité.
Un seul champ canonique sera alors ajouté, `caseNumbers String[]` sur la décision, et
non les deux. Ajouter aujourd'hui un champ qu'on ne peut ni peupler ni justifier
serait spéculatif.

---

## 7. Modèles rejetés

| Modèle                                                                 | Rejeté parce que                                                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Relation un-à-plusieurs `Affair → JudicialDecision`                    | ne résout rien : une décision resterait attachée à une seule affaire, exactement le défaut actuel                                 |
| Garder les identifiants sur `Affair` et lever seulement `ecli @unique` | permettrait d'enregistrer le cas Carignon, mais dupliquerait les attributs de la décision sur chaque fiche, sans source de vérité |
| Modéliser d'emblée décision + procédure + participant                  | c'est #516 et #517 réunis. Un chantier de cette taille sur une base à 0,6 % de couverture ne se valide sur rien                   |
| Enum `JudicialDecisionRelation` dès la première PR                     | cinq valeurs pour un cas observé, dont trois appartiennent à d'autres issues                                                      |
| Migrer `court` et `verdictDate` vers la décision                       | mesuré faux : 23,7 % de non-juridictions, et une date de verdict sur des procédures en cours                                      |

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

| Risque                                                  | Gravité                                              | Atténuation                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Remplir le `court` de la décision depuis `Affair.court` | **élevée** : 23,7 % de valeurs non juridictionnelles | ne backfiller `court` que depuis une source officielle                          |
| Déduire un doublon d'un identifiant partagé             | **élevée** : c'est l'erreur que #525 a corrigée      | interdit explicitement en phase 2, aucun code de fusion dans ce chantier        |
| Lever `Affair.ecli @unique` trop tôt                    | moyenne                                              | phase 5 seulement, après peuplement et lecture de la décision                   |
| Figer un enum sur un seul cas                           | moyenne                                              | pas d'enum avant cinq cas réels                                                 |
| `metadata Json` devenant un débarras                    | moyenne                                              | borné à la charge brute, vérifié en revue                                       |
| Casser le tri par `verdictDate`                         | moyenne                                              | le champ ne migre pas                                                           |
| Modéliser dans le vide, 0,6 % de couverture             | faible                                               | c'est l'argument inverse : le volume nul rend la migration triviale aujourd'hui |

---

## 13. Découpage recommandé en PR

| PR  | Contenu                                                      | Taille  | Bloquée par |
| --- | ------------------------------------------------------------ | ------- | ----------- |
| 1   | schéma additif : `CourtDecision` + liaison, sans enum        | petite  | —           |
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
- [ ] Une décision de conseil de prud'hommes ou de tribunal administratif peut être
      enregistrée : le modèle n'est pas restreint au pénal ni à l'ordre judiciaire
- [ ] Aucun acte du ministère public, de la HATVP ou d'un organe parlementaire n'est
      enregistré comme décision
- [ ] Une affaire sans décision liée n'est jamais signalée comme incomplète

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
   **La question du périmètre est tranchée** au §4 bis : le critère est la nature
   juridictionnelle de l'organe, pas la matière pénale. Un conseil de prud'hommes et un
   tribunal administratif entrent dans le modèle ; un parquet, la HATVP et un organe
   parlementaire n'y entrent pas. Une affaire sans décision liée est un état normal.

Aucune des cinq questions restantes ne bloque la phase 1. Elles doivent être
tranchées avant la phase 4, quand Judilibre commencera à alimenter les décisions.
