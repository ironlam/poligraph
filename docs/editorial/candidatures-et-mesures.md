# Candidatures et mesures : doctrine d'entrée éditoriale

Une mesure est rattachée à une candidature, qui fixe la personne et l'élection. Avant qu'une mesure
entre, deux questions se posent donc, dans cet ordre : cette personne est-elle une candidate que nous
pouvons représenter, et cette déclaration est-elle une mesure que nous pouvons enregistrer. Ce document
donne les réponses opposables aux deux. Il s'appuie sur l'enum `CandidacyStatus` livré au lot 0A et sur
les garanties propres au modèle de mesure (sources, précision, révisions).

Il ne fixe aucun seuil chiffré de publication : ceux de la section 4 de la spec sont un chantier distinct,
à arbitrer avant le lot 3.

---

## 1. Quand une candidature peut être créée

### Le statut dit la force du signal, pas l'étape administrative

`CandidacyStatus` a quatre valeurs, qui gradent **la force du signal politique** :

- `DECLARE` : la personne a annoncé officiellement sa candidature elle-même.
- `PRESSENTI` : des sources crédibles rapportent son intention, sans annonce de l'intéressée.
- `ENVISAGE` : hypothèse de presse, aucun signal direct de l'intéressée.
- `RETIRE` : candidature annoncée puis retirée ou écartée.

Ces quatre valeurs ne disent rien de la **validation administrative** (parrainages déposés, liste
arrêtée par le Conseil constitutionnel). Une candidature politiquement déclarée et une candidature
administrativement validée portent aujourd'hui le même `DECLARE`. La distinction existe dans la réalité,
pas encore dans le modèle : voir les arbitrages en fin de document.

### Ce qui vaut déclaration

Une candidature passe à `DECLARE` lorsqu'un acte public explicite de la personne est établi par une
source. La date de déclaration est enregistrée dans `declaredAt` lorsqu'elle peut être déterminée de
manière fiable ; son absence n'invalide pas la déclaration et ne doit jamais être compensée par une date
supposée.

Cet acte est un geste de l'intéressée, pas d'un tiers : un discours, un communiqué, une interview où elle
se dit candidate. La source qui l'établit renseigne `sourceUrl` et `sourceLabel` ; une candidature
`DECLARE` sans source est un état interdit (voir « Date et source »).

La source de référence est **primaire** : les mots de la personne. Un article de presse qui rapporte
l'annonce est une source secondaire acceptable en second, jamais à la place de la source primaire quand
celle-ci existe.

### Ce qui ne suffit pas

- **Une rumeur ou une hypothèse de presse.** Elle vaut `ENVISAGE`, pas davantage.
- **Un sondage.** Il mesure une opinion, pas une intention. Il n'est jamais un signal de statut, à aucun
  niveau.
- **Le soutien d'un tiers.** Un parti ou une personnalité qui appelle quelqu'un à se présenter ne remplace
  pas la déclaration de l'intéressée. Cela vaut `PRESSENTI` au mieux.
- **Une formulation ambiguë.** « Je réfléchis », « si on me le demande », « je ne m'interdis rien » ne sont
  pas des déclarations. Elles restent en `PRESSENTI` ou `ENVISAGE` selon la source.

**Cas limite.** Une déclaration conditionnelle, « je serai candidate si tel parti ne l'est pas », ne vaut
pas `DECLARE` tant que la condition n'est pas un fait public et que la personne ne l'a pas confirmée. La
frontière est l'engagement effectif, pas la présence du mot « candidat ».

### Une candidature déclarée se représente, même sans validation administrative

L'absence de dépôt administratif officiel n'interdit pas de représenter une candidature politiquement
déclarée. Le hub documente des programmes annoncés, pas la liste officielle du scrutin. Une candidature
`DECLARE` et sourcée a donc sa place, que les parrainages soient déposés ou non. La validation
administrative, quand nous choisirons de la suivre, sera une information distincte, ajoutée à côté du
statut, jamais confondue avec lui.

### Date et source

La source vit dans `Candidacy.sourceUrl` et `Candidacy.sourceLabel`, la date de déclaration dans
`CandidacyPresidential.declaredAt`. Les deux ne pèsent pas pareil. La source est la condition du statut :
une candidature `DECLARE` sans source est un état interdit par cette doctrine, la source n'est pas un
ornement. `declaredAt` est facultatif : on le renseigne quand la date de l'annonce est établie de manière
fiable, on le laisse vide sinon. On ne le remplit jamais d'office avec la date du jour, la date de
création de la fiche ou la date de publication de la source.

### Corriger ou retirer

Une personne qui se retire ou qui est écartée passe en `RETIRE`, avec `withdrewAt` et, si elle est
connue, `withdrewReason`. Un retrait de candidature n'efface pas la candidature : elle reste, dans son
état `RETIRE`, avec les mesures déjà enregistrées et leur historique. Si nous nous sommes trompés de
source ou de statut, nous corrigeons la source ou le statut sur pièce, nous n'inventons pas la pièce
manquante.

---

## 2. Quand une mesure peut entrer

### Ce qu'est une mesure exploitable

Une mesure est une **proposition d'action concrète, attribuable, sourcée et assez précise pour être
enregistrée puis vérifiée plus tard**. Tout ce qu'une candidate dit n'est pas une mesure.

### Cinq registres, un seul entre comme mesure concrète

Un même discours mêle plusieurs registres. Il faut les séparer avant d'enregistrer :

- une **valeur** (« l'égalité des chances ») n'est pas une mesure ;
- un **diagnostic** (« le pouvoir d'achat recule ») n'est pas une mesure ;
- une **déclaration générale** (« je veux une France plus juste ») n'est pas une mesure ;
- un **objectif** (« ramener le chômage sous les 5 % ») entre comme mesure au titre
  `OBJECTIF_SANS_CHIFFRE` s'il engage une cible, même sans dispositif ;
- une **mesure concrète** (« porter le SMIC à 1 600 euros nets au 1er juillet 2027 ») entre pleinement.

Le doute se tranche par une question : cette phrase engage-t-elle une action ou une cible vérifiable, ou
énonce-t-elle une intention. Une intention reste dehors.

### Source primaire, ou justification écrite d'une source secondaire

La source de référence d'une mesure est **primaire** : programme officiel, discours de campagne, débat,
interview de la candidate. Une source **secondaire**, un article qui rapporte la proposition, n'est
recevable qu'avec une justification écrite, et elle est enregistrée en `tier: SECONDARY`. Ce niveau compte
dans la part de sources primaires, la statistique qui pilotera l'ouverture des surfaces publiques. Les
huit natures de source sont fermées, sans catégorie fourre-tout : une source qui n'entre dans aucune n'est
pas une source recevable.

### Précision minimale

Le texte enregistré doit être **attribuable et sans ambiguïté sur son objet**. Une phrase dont on ne peut
pas dire à quoi elle s'applique n'est pas encore une mesure ; elle attend une formulation plus nette, pas
une interprétation de notre part.

### Rattachement

Une mesure se rattache à une candidature, et, quand elle existe, à une édition de programme. **Règle
arbitrée le 2026-08-06** : dans la chaîne du hub 2027, une mesure ne peut être créée que pour une
candidature **de l'élection présidentielle 2027**, au statut **`DECLARE`**, dont **`sourceUrl` et
`sourceLabel`** sont renseignés. Rattacher une mesure à une candidature seulement `PRESSENTI` ou
`ENVISAGE` reviendrait à prêter un programme à quelqu'un qui n'a pas déclaré, ce qui transforme une rumeur
en position. Cette règle vit dans la chaîne du hub, pas comme contrainte universelle du modèle `Measure` :
une mesure d'un autre contexte garde ses propres règles. Elle fixe le filtre du sélecteur de création et
résout l'anomalie #660.

### Contradictions et évolutions

Une candidate qui reformule produit une **nouvelle révision**, jamais une modification en place : la
version publique ne bouge qu'à la publication de la correction relue. Une candidate qui abandonne une
proposition déclenche un **retrait de mesure**, qui change l'état sans effacer le texte. Deux candidates
qui portent une proposition équivalente donnent une **évaluation de similarité** datée, jamais une fusion.

### Extracteur et relecteur, même quand c'est la même personne

L'extraction et la relecture sont deux actes distincts, même exercés temporairement par une seule
personne. `extractionMethod` enregistre comment la mesure a été extraite (`MANUAL`, `AI_ASSISTED`,
`IMPORTED`) ; la relecture est un second passage, tracé par `reviewedBy`, qui décide de la publication.
Pour une équipe d'une personne, deux garde-fous tiennent lieu de séparation des rôles :

1. **une séparation dans le temps** : ne pas relire une mesure le jour où on l'a extraite ;
2. **une liste de contrôle** à la relecture, distincte du travail d'extraction : la source primaire
   existe et dit bien cela, le texte est attribuable, la précision est correcte, aucun qualificatif n'est
   posé à la légère.

La relecture n'est pas la validation de sa propre extraction. C'est un regard neuf sur pièce.

### Cadence initiale

Mieux vaut un petit corpus vérifié qu'un grand corpus non relu. La cadence honnête pour démarrer :
quelques candidates déclarées, une poignée de mesures chacune sur un ou deux thèmes, entièrement relues.
C'est ce qui valide la tranche verticale du lot 3 avant de multiplier les sujets. Un compteur public de
couverture, adossé à cette réalité, vaut mieux qu'une façade de complétude.

---

## Décisions arbitrées le 2026-08-06

1. **Pas d'état pour la validation administrative maintenant.** `DECLARE` décrit une déclaration politique
   publique et sourcée, pas une validation administrative (parrainages, Conseil constitutionnel). Aucun
   statut de parrainage ni de validation n'est ajouté à ce stade. Cette dimension sera modélisée
   séparément quand elle deviendra nécessaire, par un champ distinct sur `CandidacyPresidential`, jamais
   une cinquième valeur d'enum qui mélangerait deux axes.

2. **Rattachement des mesures : arbitré.** Dans la chaîne du hub 2027, une mesure ne peut être créée que
   pour une candidature de l'élection 2027, au statut `DECLARE`, avec `sourceUrl` et `sourceLabel` (voir la
   section Rattachement). Règle de la chaîne du hub, pas contrainte universelle du modèle `Measure`. Résout
   l'anomalie #660.

3. **Capture de la source à l'écriture : en place (#660).** La chaîne de création de candidature du hub
   exige et enregistre `sourceUrl` et `sourceLabel` dès que le statut est `DECLARE`. Le schéma du picker
   les rend obligatoires par un `refine`, la route les écrit sur la `Candidacy`, et une garde serveur
   revérifie le périmètre 2027 + `DECLARE` + sourcée avant toute création de mesure : la règle « une
   candidature `DECLARE` est sourcée » est tenue à l'écriture, pas seulement à l'affichage. Le seul point
   d'entrée d'une candidature en `DECLARE` est aujourd'hui la création ; aucun chemin de transition depuis
   un autre statut n'existe. S'il en est ajouté un, il devra porter la même exigence de source. `declaredAt`
   reste facultatif dans cette chaîne (voir « Date et source »).
