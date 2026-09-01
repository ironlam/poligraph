# QA fiches judiciaires — affaire des assistants parlementaires du FN (Le Pen, Aliot)

QA périodique déclenchée par un événement politique majeur (routine de suivi).
Fiches concernées : `marine-le-pen` et `louis-aliot`, affaire des assistants
parlementaires européens du FN, statut le plus sensible actuellement suivi
pour ces deux fiches (arrêt de la cour d'appel de Paris du 7 juillet 2026,
pourvois en cassation en cours). Vérification faite en base de production
(Supabase) le 2026-09-01, complétée par une recherche presse indépendante.

**Conclusion : aucune correction requise.** Les deux fiches sont à jour et
correctement cadrées. Deux points mineurs sont notés en fin de document pour
suivi éventuel, sans urgence.

## 1. Champ statut

Les deux `Affair` (`marine-le-pen-condamnation-...-fn`,
`louis-aliot-assistants-parlementaires-fn-2025`) portent
`status = POURVOI_EN_CASSATION`, `publicationStatus = PUBLISHED`,
`verifiedAt = 2026-08-23`. C'est le statut correct : condamnées en appel le
7 juillet 2026, les deux personnes se sont pourvues en cassation (confirmé par
la presse — franceinfo, Actu Roubaix), le parquet général a renoncé à se
pourvoir, la décision n'est donc pas définitive. Le statut a été vérifié il y
a 9 jours, pas de dérive depuis.

## 2. Présomption d'innocence

`AFFAIR_STATUS_NEEDS_PRESUMPTION.POURVOI_EN_CASSATION = true` et la
description associée (`src/config/labels.ts`) est précise : « La cour d'appel
a condamné, et un pourvoi en cassation a été formé. La condamnation n'est pas
définitive : la Cour de cassation peut encore l'annuler. » `POURVOI_EN_CASSATION`
est bien inclus dans `NON_DEFINITIVE` (`src/lib/politicians/judicial-counts.ts`),
donc compté dans `condamnationsNonDefinitives` et non dans les procédures en
cours — la note générée par `buildPresumptionNote` sera donc correcte sur les
deux fiches. Les deux descriptions d'affaire se terminent explicitement par
« la décision n'est pas définitive ». Framing correct des deux côtés (fiche et
composant).

## 3. Audit des sources

- Le Pen : 26 sources (`Source`), Aliot : 7 sources. Couverture chronologique
  complète : mise en examen/procès (2023-2024), jugement de première instance
  (31 mars 2025), procès en appel (janv.-févr. 2026), arrêt du 7 juillet 2026,
  annonce du pourvoi (8 juillet 2026).
- Publishers vérifiés par recherche indépendante : Le Monde, Mediapart, BFM
  TV, France Info, Le Figaro, Public Sénat, France 3 Occitanie, Made in
  Perpignan, Actu Roubaix, AP, France 24, RTS — cohérents avec les titres et
  dates enregistrés. Deux sources primaires officielles (communiqué et
  tableau récapitulatif de la cour d'appel de Paris, PDF, 7 juillet 2026) sont
  citées pour les deux fiches.
- Les citations et dates dans `Affair.description` (peines, sursis, montants)
  correspondent à ce que rapportent les sources retrouvées de manière
  indépendante (ex. 45 mois d'inéligibilité dont 30 avec sursis pour Le Pen ;
  1 an de prison avec sursis, 5 000 € d'amende, 2 ans d'inéligibilité avec
  sursis pour Aliot).
- Limite de cette QA : l'accès sortant de cette session bloque les requêtes
  HTTP directes vers les domaines de presse (proxy réseau), donc les liens
  n'ont pas pu être vérifiés un par un pour un code 200 littéral. Le
  recoupement s'est fait par recherche web indépendante (titres, éditeurs,
  dates identiques retrouvés). Aucune source suspecte ou non retrouvée.

## 4. Ton et cohérence éditoriale

Les deux descriptions restent factuelles et neutres : elles citent les
réquisitions, la décision, les réactions (candidature de Marine Le Pen le
soir de l'arrêt, maintien du mandat de maire de Louis Aliot), sans charge ni
minimisation. Aucun terme non sourcé.

## 5. Points mineurs (hors périmètre de correction immédiate)

1. **`Source.archivedUrl`** : nul sur les 33 sources des deux fiches. Le champ
   existe pour la protection contre le link rot mais n'est pas utilisé ici. À
   considérer pour les sources les plus anciennes (2023-2024) si une politique
   d'archivage systématique existe déjà ailleurs dans le pipeline d'import.
2. **Mandat de maire de Louis Aliot** : le `Mandate` `MAIRE` en base garde
   `startDate`/`firstElectedDate` au 27/06/2020 alors qu'il a été réélu au
   1er tour le 15 mars 2026 (50,61 %) et officiellement réinstallé le 20 mars
   2026 (confirmé par la presse). Le enregistrement a été touché le
   2026-04-04 (`updatedAt`) sans création d'un nouveau mandat ni mise à jour
   de la date de premier exercice. Si le modèle de données traite les
   réélections comme continuation du même mandat, c'est cohérent ; sinon,
   c'est un mandat manquant pour la législature 2026-2032. Sans impact sur le
   contenu des fiches d'affaires elles-mêmes (qui se contentent de dire qu'il
   « conserve son mandat », ce qui reste vrai).

Aucune de ces deux observations ne constitue une inexactitude publiée : elles
sont documentées ici pour suivi, pas comme correction requise.
