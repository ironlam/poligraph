# Qualificatifs des mesures : définitions opposables

Ce document est la condition pour que l'enum `QualificationKind` garantisse quelque chose. Un enum fermé
sans définitions ne garantit rien : deux relecteurs appliqueraient le même qualificatif sur des critères
différents, et personne ne pourrait contester l'un sans contester l'autre.

Chaque qualificatif est une **conclusion éditoriale datée** sur **une formulation**, jamais une propriété
de la mesure. Il est rattaché à la révision examinée, porte la date de l'examen et le nom de son auteur.
Une reformulation n'hérite d'aucune conclusion.

Le **corpus examiné** est la partie la plus importante de chaque définition. « Financement non précisé »
donne trois réponses différentes selon qu'on a lu la seule révision, ses sources primaires, ou le
programme entier du candidat. Sans corpus explicite, le qualificatif ne dit pas ce qu'il constate.

Le **cas limite** de chaque section n'est pas décoratif : c'est lui qui empêche deux lectures divergentes.
Une définition sans cas limite se réduit à son intitulé.

Les exemples ci-dessous sont **construits**, le corpus réel n'existant pas encore. À remplacer par des cas
tirés du corpus dès qu'il y en a, en gardant la structure.

---

## FINANCEMENT_NON_PRECISE

**Ce que le qualificatif affirme.** La formulation examinée ne dit pas d'où vient l'argent, ni combien
elle coûte.

**Corpus examiné.** La révision concernée **et** ses sources primaires, rien de plus. Pas le programme
entier du candidat : un chiffrage qui figure dans un autre document ne rend pas cette formulation
précise, et aller le chercher reviendrait à réécrire la mesure à la place de son auteur.

**Deux exemples positifs.**

1. « Doubler l'allocation de rentrée scolaire. » Aucun montant, aucune ressource, aucune source primaire
   qui en parle.
2. « Créer 10 000 places de crèche. » Un volume chiffré mais aucun coût ni financement, et la source
   primaire est un discours qui n'aborde pas le budget.

**Deux exemples négatifs, dont un cas limite.**

1. « Créer 10 000 places de crèche, financées par le redéploiement du crédit d'impôt famille. » Le
   financement est nommé. Qu'il soit suffisant est une autre question, qui n'est pas celle-ci.
2. **Cas limite.** « Doubler l'allocation de rentrée scolaire, coût estimé à 1,2 milliard d'euros. » Le
   coût est chiffré, la ressource ne l'est pas. Le qualificatif ne s'applique **pas** : il porte sur
   l'absence d'information et non sur son insuffisance. Pour ce cas, `PERIMETRE_INCERTAIN` ne convient pas
   non plus. Aucun qualificatif n'est posé.

**Ce que le qualificatif n'affirme pas.** Ni que la mesure est infinançable, ni qu'elle est coûteuse, ni
que le candidat a été évasif. Il constate une absence dans un texte, à une date.

---

## DEJA_TENTEE

**Ce que le qualificatif affirme.** Un dispositif de même objet et de même mécanisme a déjà été mis en
œuvre en France, et cette mise en œuvre est documentée.

**Corpus examiné.** La révision concernée, plus **au moins une source secondaire vérifiable** attestant la
tentative antérieure : texte au Journal officiel, rapport d'évaluation publique, ou travail parlementaire.
Une ressemblance repérée de mémoire ne suffit pas, et ce qualificatif est le seul des quatre qui exige une
source rattachée.

**Deux exemples positifs.**

1. « Instaurer une taxe sur les transactions financières. » Un dispositif de ce nom existe depuis 2012,
   son périmètre et son rendement sont documentés.
2. « Rétablir l'encadrement des loyers dans les zones tendues. » Encadré de 2014 à 2017 puis rétabli à
   Paris en 2019, avec des évaluations publiques disponibles.

**Deux exemples négatifs, dont un cas limite.**

1. « Créer un revenu universel versé à tous les résidents. » Des expérimentations locales ont eu lieu
   ailleurs, aucun dispositif national de même mécanisme en France.
2. **Cas limite.** « Supprimer la taxe d'habitation sur les résidences secondaires. » La taxe
   d'habitation sur les résidences **principales** a bien été supprimée, mais l'objet diffère : même nom,
   autre assiette, autres bénéficiaires. Le qualificatif ne s'applique pas. Une ressemblance de vocabulaire
   n'est pas une identité de dispositif.

**Ce que le qualificatif n'affirme pas.** Ni que la mesure a échoué, ni qu'elle échouera, ni qu'elle est
inutile. Un dispositif déjà tenté peut avoir été abandonné pour des raisons politiques et non pour son
inefficacité. Le qualificatif situe une proposition dans une histoire, il ne la juge pas.

---

## CALENDRIER_PRECISE

**Ce que le qualificatif affirme.** La formulation examinée engage une échéance vérifiable : une date, une
durée, ou un rattachement explicite à un exercice budgétaire.

**Corpus examiné.** La révision concernée seule. Le calendrier fait partie de ce qui est dit ou n'en fait
pas partie, et un calendrier annoncé ailleurs n'engage pas cette formulation.

C'est le seul des quatre qualificatifs qui constate une **présence** et non une absence. Il ne signale
donc pas un défaut, et l'interface ne doit pas le rendre comme un reproche.

**Deux exemples positifs.**

1. « Porter le SMIC à 1 600 euros nets dès le 1er juillet 2027. » Une date, une valeur cible.
2. « Recruter 10 000 enseignants sur les trois premiers budgets de la mandature. » Une durée rattachée à
   des exercices identifiables.

**Deux exemples négatifs, dont un cas limite.**

1. « Augmenter significativement le SMIC. » Ni date, ni durée, ni exercice.
2. **Cas limite.** « Engager la réforme dès le début du mandat. » Une intention de rapidité, pas une
   échéance : « le début du mandat » ne se vérifie pas. Le qualificatif ne s'applique pas. La frontière est
   la vérifiabilité, pas la présence d'un mot de temps.

**Ce que le qualificatif n'affirme pas.** Ni que l'échéance est réaliste, ni qu'elle sera tenue, ni que la
mesure est prioritaire. Le suivi de l'exécution est un autre chantier, avec ses propres sources.

---

## PERIMETRE_INCERTAIN

**Ce que le qualificatif affirme.** La formulation examinée ne permet pas de dire **à qui** ou **à quoi**
elle s'applique, à un degré qui empêcherait de la mettre en œuvre telle quelle.

**Corpus examiné.** La révision concernée **et** ses sources primaires. Une précision apportée en
interview compte, elle fait partie de ce que le candidat a dit.

**Deux exemples positifs.**

1. « Exonérer les classes moyennes d'impôt sur le revenu. » « Classes moyennes » n'a pas de définition
   opposable, et aucune source primaire n'en donne de bornes.
2. « Réguler les plateformes numériques. » Ni les plateformes visées, ni la nature de la régulation ne
   sont identifiables.

**Deux exemples négatifs, dont un cas limite.**

1. « Exonérer d'impôt sur le revenu les foyers dont le revenu fiscal de référence est inférieur à 30 000
   euros. » Le périmètre est une règle applicable.
2. **Cas limite.** « Réguler les plateformes numériques de plus de 45 millions d'utilisateurs mensuels
   dans l'Union. » Le seuil renvoie à une catégorie juridique existante, celle des très grandes plateformes
   au sens du règlement européen sur les services numériques. Le périmètre est donc déterminable même s'il
   n'est pas énuméré. Le qualificatif ne s'applique pas : un renvoi à une norme existante est une
   définition, pas un flou.

**Ce que le qualificatif n'affirme pas.** Ni que la mesure est vague par calcul, ni qu'elle est
irréalisable. Beaucoup de propositions de campagne sont formulées avant leur rédaction juridique, ce qui
est une étape normale et non une faute. Le qualificatif dit qu'à cette date, sur ce texte, le périmètre
n'est pas déterminable.

---

## Ce que ce document ne couvre pas

L'**unicité** d'une mesure n'est pas un qualificatif. Elle est portée par
`MeasureSimilarityAssessment`, avec la version du corpus comparé et la date, parce qu'une mesure paraît
unique jusqu'à la publication du programme suivant. Un qualificatif « mesure unique » serait faux quelques
semaines après avoir été posé.

Les **drapeaux de relecture** internes, qui signalent au relecteur ce qu'il faut regarder, ne sont pas des
qualificatifs publics et n'appartiennent pas à cet enum.
