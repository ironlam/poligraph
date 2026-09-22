# Affaires : représenter une décision annulée

Une juridiction supérieure peut annuler ou casser une décision déjà saisie sur une fiche. Aucun statut
d'`AffairStatus` ne dit « annulé », et aucun ne doit être détourné pour le dire. Ce document fixe la
règle, pour que deux relecteurs traitent deux annulations de la même façon.

## Le principe

**Une annulation n'est pas une déclaration de non-culpabilité.** Casser un arrêt pour erreur de droit ne
dit rien des faits. Passer la fiche en `RELAXE`, `NON_LIEU` ou `ACQUITTEMENT` remplacerait un « condamné »
faux par un « relaxé » tout aussi faux : chacun de ces statuts nomme une décision précise qui n'a pas été
rendue.

L'inverse est aussi faux : garder le statut de condamnation après l'annulation affiche une sanction qui
n'existe plus.

## Annulation avec renvoi

C'est le cas courant : cassation avec renvoi devant une autre cour d'appel, annulation par le Conseil
d'État avec renvoi devant la juridiction disciplinaire.

L'affaire redevient pendante, et la fiche le dit.

- **Statut** : celui de l'instance de renvoi, en général `PROCES_EN_COURS`. Il relève de la maturité
  « procédure validée », pas « condamnation ».
- **Décision** : la décision d'annulation est rattachée comme `CourtDecision`, avec sa solution telle que
  publiée (« Annulation avec renvoi », « Cassation et renvoi »).
- **Description** : elle dit ce qui a été annulé, par qui, à quelle date, et devant qui l'affaire est
  renvoyée.
- **Peines** : les champs de peine de la décision annulée sont vidés. L'historique reste dans la
  description, pas dans les colonnes.
- **`verdictDate`** : vidée tant que la juridiction de renvoi n'a pas statué.

Quand la juridiction de renvoi statue, la fiche suit sa décision comme n'importe quelle autre : `RELAXE`
si elle relaxe, statut de condamnation si elle condamne.

Cas publiés : AF-000121 (annulation par le Conseil d'État, renvoi devant la chambre disciplinaire
nationale, affaire pendante) et AF-000593 (cassation avec renvoi, puis relaxe par la cour de renvoi).

## Annulation sans renvoi

Plus rare : la juridiction annule et rien ne reste à juger. Aucun statut actuel ne convient, et la règle
du principe s'applique : on n'en choisit pas un approchant.

En attendant l'axe « caractère » de la décision prévu par #516, la fiche est **dépubliée à titre
conservatoire** (retour en `DRAFT`, piste d'audit avec le motif), avec la décision rattachée. Elle ne
revient en ligne qu'une fois une représentation exacte disponible.

## Ce que la règle ne couvre pas

Les relaxes partielles, par exemple une condamnation pour une période et une relaxe pour une autre, ne
sont pas des annulations. Elles relèvent du résultat par chef et par participant, suivi dans #517.
