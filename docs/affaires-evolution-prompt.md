# Prompt de reprise — évolution des affaires (#763)

Ce document est un prompt à copier-coller dans une nouvelle session pour reprendre le
chantier « évolution des affaires ». Il contient l'état des lieux, les décisions déjà
prises et les questions encore ouvertes, pour ne pas avoir à re-explorer le code.

---

## Prompt

> Je travaille sur Poligraph (Next.js + Prisma + Postgres), un observatoire des
> responsables politiques français. Je reprends le chantier « évolution des affaires
> judiciaires » décrit dans l'issue #763.
>
> ### Le problème
>
> Quand une enquête en cours évolue (nouvel article de presse, nouvelle étape de
> procédure), le pipeline crée une **nouvelle fiche `Affair`** au lieu d'enrichir
> l'existante. Trois brouillons Bagayoko ont été créés à deux minutes d'intervalle
> pour une seule enquête ; 14 fiches Édouard Philippe existent pour la Cité numérique
> du Havre ; 3 fiches Asselineau pour un même renvoi en correctionnelle.
>
> La cause : avant toute décision de justice, une affaire n'a ni ECLI, ni numéro de
> pourvoi, ni `verdictDate`. Quatre des cinq signaux de `findMatchingAffairs` sont
> donc structurellement muets, et le seul restant — la containment de titre — échoue
> dès qu'un article de suivi reformule le titre au lieu de l'allonger.
>
> ### Ce qui est déjà fait (PR #764, mergée ou en revue)
>
> Une **priorité 6** dans `src/services/affairs/matching.ts` : recouvrement de
> vocabulaire (Jaccard) sur les mots significatifs du titre, active uniquement quand
> les deux côtés sont pré-décision et dans une même famille de catégories.
>
> - Seuils : `EVOLUTION_MIN_OVERLAP_RATIO = 0.4`, `EVOLUTION_MIN_SHARED_WORDS = 2`,
>   relevés en scorant toutes les paires d'un même élu sur les 189 affaires
>   pré-décision en production.
> - Le signal sort en `POSSIBLE`, **sous** le seuil de `pickConfidentMatch` : à ce
>   stade **aucun importeur ne change de comportement**, la paire est seulement
>   remontée à la revue.
> - `findEvolutionCandidates()` expose le signal aux appelants pour la suite.
> - 24 tests dans `matching.test.ts`, fixtures tirées de vraies paires de production.
>
> ### Ce qui reste
>
> **Étape 2 — router la découverte vers une proposition.** Dans
> `src/services/sync/press-analysis.ts` (~ligne 407) et `scripts/discover-affairs.ts`
> (~ligne 386), quand `findEvolutionCandidates()` renvoie un candidat, déposer un
> `AffairUpdateProposal` qui **ajoute un `AffairEvent`** à la fiche existante, au lieu
> de créer un second brouillon.
>
> Point à trancher en premier : `PROPOSABLE_FIELDS` dans
> `src/services/affairs/proposals.ts` n'autorise aujourd'hui que des patchs de champs
> scalaires. Vérifier s'il peut porter un ajout d'événement, et sinon décider
> comment étendre la forme du payload — c'est le seul vrai changement de modèle du
> chantier. Regarder aussi `proposal-review.ts` (`acceptProposal`, garde
> compare-and-set, détection de drift) pour rester dans ses invariants.
>
> **Étape 3 — rendre l'évolution lisible en admin.**
>
> - `ArticleAffairWorkbench.tsx` possède déjà un rôle `UPDATE` (« cet article
>   documente un développement de cette affaire ») qui ne déclenche rien côté fiche :
>   le câbler pour qu'il produise un `AffairEvent` via le pipeline de propositions.
> - `AffairMergePanel.tsx` ne propose que la fusion totale ; ajouter une seconde
>   action « rattacher comme événement », distincte de « Absorber ».
> - La revue des propositions (`src/app/admin/affaires/propositions/page.tsx`) doit
>   distinguer visuellement « nouvel événement » d'une modification de champ.
>
> **Étape 4 — affichage public.** Normalement rien à faire : `AffairTimeline` rend
> déjà `AffairEvent[]` sur la fiche d'affaire (`affaires/[slug]/page.tsx`) **et** dans
> `AffairCard` sur la fiche d'un élu. Si l'étape 2 fait son travail, les deux surfaces
> se remplissent seules. À vérifier plutôt qu'à construire.
>
> **Étape 5 — dettes connexes, à ne pas mélanger aux précédentes.**
>
> - Deux implémentations indépendantes de détection de doublons coexistent :
>   `reconciliation.ts` d'un côté, le scorer autonome derrière `DuplicateDetector.tsx`
>   de l'autre. Les unifier avant d'ajouter un troisième signal ailleurs.
> - `AffairPairDecision.LINKED` (« distinctes mais liées ») est modélisée et statuée,
>   mais aucune surface ne l'affiche. `LinkedAffairBanner` ne couvre que le cas
>   inter-personnes.
> - Les grappes déjà en base (Philippe, Barrot, Asselineau, Bagayoko…) ne seront pas
>   nettoyées par le nouveau signal, qui n'agit qu'à la création. Prévoir un passage
>   de rattrapage qui les remonte à la file de revue.
>
> ### Contraintes du projet à respecter
>
> - **Un faux rapprochement coûte plus cher qu'un doublon à trier.** Un brouillon
>   n'est pas public et l'outillage de fusion sait le replier ; une fiche publiée
>   enrichie depuis la mauvaise source corrompt un enregistrement en silence. En cas
>   de doute, ne pas rapprocher.
> - **L'ambiguïté ne se résout jamais toute seule** : plusieurs candidats à égalité
>   valent « aucun candidat », jamais « le premier de la liste ».
> - **Un importeur ne crée que des brouillons.** Toute écriture sur une fiche publiée
>   passe par un `AffairUpdateProposal` relu par un humain.
> - **Tout seuil se justifie par une mesure** sur les données de production, comme
>   le font déjà #520, #521 et la priorité 6. Ne pas inventer de constante.
> - Présomption d'innocence : les libellés publics ne doivent jamais laisser entendre
>   une culpabilité avant décision définitive.
>
> ### Pour commencer
>
> Lis `src/services/affairs/matching.ts` (priorité 6 et
> `findEvolutionCandidates`), `src/services/affairs/proposals.ts` et
> `src/services/affairs/proposal-review.ts`, puis dis-moi si `AffairUpdateProposal`
> peut porter un ajout d'événement en l'état ou ce qu'il faut changer. Propose-moi le
> plan de l'étape 2 avant d'écrire du code.

---

## Aide-mémoire — fichiers du chantier

| Fichier                                           | Rôle                                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `src/services/affairs/matching.ts`                | Moteur de rapprochement, priorité 6, `findEvolutionCandidates` |
| `src/services/affairs/proposals.ts`               | Dépôt d'une proposition, `PROPOSABLE_FIELDS`                   |
| `src/services/affairs/proposal-review.ts`         | `acceptProposal` / `rejectProposal`, drift, audit              |
| `src/services/affairs/reconciliation.ts`          | Fusion transactionnelle, `mergeAffairs`                        |
| `src/services/affairs/status-tracking.ts`         | Seule source actuelle d'`AffairEvent`                          |
| `src/services/sync/press-analysis.ts`             | Import presse, décide enrichir / créer (~l. 407)               |
| `scripts/discover-affairs.ts`                     | Import Wikidata + Wikipedia (~l. 386)                          |
| `src/components/admin/ArticleAffairWorkbench.tsx` | Lien article ↔ affaire, rôle `UPDATE`                          |
| `src/components/admin/AffairMergePanel.tsx`       | Fusion depuis la fiche                                         |
| `src/components/affairs/AffairTimeline.tsx`       | Rendu de la chronologie                                        |
| `src/components/politicians/AffairCard.tsx`       | Carte d'affaire sur la fiche d'un élu                          |

## Commandes utiles

```bash
npm ci && npx prisma generate      # le client Prisma n'est pas versionné
npx vitest run src/services/affairs/
npm run lint
```
