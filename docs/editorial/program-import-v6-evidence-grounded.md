# Import des programmes V6 : méthode fondée sur la preuve

## Statut

Program Import V6 prépare des mesures en `DRAFT` pour une revue humaine. Il ne publie rien
automatiquement. `READY_FOR_REVIEW` signifie seulement que les contrôles techniques permettent
une lecture éditoriale.

Le canary réalisé sur un second candidat n'a pas validé une généralisation automatique du moteur.
La précision observée était de 53,76 % et le rappel de 75,90 %. Le moteur reste donc un assistant de
préparation, avec validation humaine obligatoire et critères identiques pour tous les candidats.

## Invariants éditoriaux

1. Une mesure doit être attribuable au candidat ou au document de campagne.
2. La preuve exacte reste consultable avec son document, sa page et ses unités de texte.
3. Un diagnostic, un témoignage, une action historique ou une politique existante ne devient pas
   une promesse.
4. La formulation normalisée ne doit pas ajouter d'information à la source.
5. Les mêmes règles s'appliquent sans branchement sur le parti ou la personne.
6. Toute création issue du pipeline reste en `DRAFT` jusqu'à une décision humaine.

## Flux de données

```text
document source
  -> parser et contrôle de provenance
  -> unités de discours
  -> extraction structurée
  -> assemblage des preuves
  -> gardes déterministes
  -> préparation éditoriale
  -> DRAFT ou blocage technique
```

Le parser transforme le document en blocs ordonnés et signale les pages dont la couche texte est
inutilisable. Le discourse layer attribue un locuteur et un rôle à chaque unité. L'extracteur propose
ensuite une classification, une formulation et les identifiants des unités qui les justifient.

Les gardes déterministes reconstruisent la preuve depuis les unités connues. Le texte fourni par le
modèle n'est jamais utilisé comme source. Les identifiants absents, dupliqués, désordonnés ou issus
d'une page bloquée rendent le bundle invalide.

## Attribution

Chaque proposition déclare une base d'attribution parmi les valeurs suivantes :

- `CANDIDATE_COMMITMENT`
- `CANDIDATE_OBJECTIVE`
- `EXPLICIT_ENDORSEMENT`
- `THIRD_PARTY`
- `HISTORICAL`
- `EXISTING_POLICY`
- `DIAGNOSIS`
- `UNCLEAR`

Une mesure publiable doit reposer sur au moins une unité d'engagement. Les unités de contexte peuvent
résoudre un référent ou préciser une action, mais elles ne remplacent pas cet engagement. Les bases
`THIRD_PARTY`, `HISTORICAL`, `EXISTING_POLICY`, `DIAGNOSIS` et `UNCLEAR` bloquent l'attribution d'une
action au candidat.

## Préparation pour revue

Le résultat technique est l'un des trois états suivants :

- `READY_FOR_REVIEW` : le candidat peut être examiné par un modérateur.
- `REVIEW_WITH_WARNING` : la preuve est exploitable, avec un risque explicite à relire.
- `TECHNICALLY_BLOCKED` : le candidat ne peut pas créer de DRAFT.

Ces états ne remplacent jamais les décisions éditoriales `PUBLISHED`, `REJECTED` ou `EXCLUDED`.
L'import est idempotent : une même proposition et une même preuve ne doivent pas produire plusieurs
DRAFTs.

## Persistance et audit

Une mesure créée conserve un `EvidenceSnapshotV3` validé, les versions du parser, du discourse layer
et de l'extracteur, ainsi que l'empreinte du document source. Le snapshot est immuable après création.
Son contrat de stockage est détaillé dans
[`program-import-v6-persistence.md`](./program-import-v6-persistence.md).

L'interface admin affiche la preuve, les avertissements, les révisions et les actions disponibles.
Les mutations restent protégées par l'authentification admin, la validation Zod et l'audit log.

## Corpus de régression

Le dépôt applicatif conserve deux niveaux de tests :

- des tests unitaires ciblés pour les règles de preuve, d'attribution et de formulation ;
- un gold set et un precision set Ruffin pour surveiller la précision et les faux positifs.

Les holdouts révélés, sorties brutes de modèles et rapports de runs ne sont pas des dépendances du
produit. Ils doivent être publiés séparément si leur conservation scientifique est nécessaire. Le
dépôt ne garde que les cas de ces corpus qui protègent encore une règle active.

## Critères avant extension

Une extension à un nouveau candidat demande :

1. un corpus indépendant annoté sans exposition aux sorties du pipeline ;
2. une mesure séparée de la précision et du rappel ;
3. l'absence de faux positifs critiques sur les tiers, l'historique et la provenance ;
4. une revue des erreurs avant toute création de DRAFTs ;
5. une validation humaine distincte avant publication.

Un résultat insuffisant reste documenté comme tel. Il ne justifie ni une règle propre à un candidat,
ni un relâchement des gardes communes.
