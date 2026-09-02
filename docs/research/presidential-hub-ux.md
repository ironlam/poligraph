# Hiérarchie UX du hub présidentielle 2027

Date de l'audit : 3 septembre 2026

## Périmètre

Cet audit porte sur :

- le hub `/elections/presidentielle-2027` ;
- la recherche générale ;
- la navigation vers les candidatures, les thèmes et les sous-thèmes ;
- la page `/elections/presidentielle-2027/recherche`, notamment lorsqu'elle sert de page de
  consultation d'un sous-thème.

Les constats sur l'interface viennent des captures fournies et de l'implémentation dans
`src/app/elections/presidentielle-2027/`. Les recommandations externes reposent principalement sur
des systèmes de conception publics et des normes d'accessibilité. Elles donnent de bonnes règles
par défaut, mais ne remplacent pas l'observation des usages réels de Poligraph.

## Verdict

L'intuition de placer la recherche avant la liste des candidatures est bonne. La recherche répond
au besoin le plus transversal : arriver avec une question, un sujet ou un nom, sans connaître la
taxonomie de Poligraph. L'US Web Design System recommande d'afficher une boîte de recherche entière
sur une page d'accueil, et pas seulement un lien ou une icône. Le W3C rappelle aussi que recherche,
navigation hiérarchique et liens directs doivent coexister, car les personnes ne retrouvent pas
toutes l'information de la même manière
([USWDS, Search](https://designsystem.digital.gov/components/search/),
[W3C, Multiple Ways](https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html)).

En revanche, mettre la recherche en premier ne signifie pas qu'elle doit former une grande section.
Le titre « Chercher dans le corpus 2027 » répète l'action déjà matérialisée par le champ et emploie
un mot interne, « corpus », moins parlant que « programmes » ou « mesures ». Il peut être supprimé,
mais pas au prix de supprimer toute indication visible. Une étiquette courte comme « Rechercher une
mesure, un thème ou un candidat » donne le périmètre attendu et reste présente lorsque le texte du
champ disparaît pendant la saisie. Les recommandations USWDS demandent un libellé, même si elles
autorisent qu'il soit visuellement masqué ; le W3C demande surtout que les libellés décrivent
clairement le but du contrôle
([USWDS, Search](https://designsystem.digital.gov/components/search/),
[W3C, Headings and Labels](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels)).

La liste horizontale de 25 candidatures est le principal point à remettre en cause. Elle économise
de la hauteur, mais dissimule la majorité des choix, privilégie visuellement les premiers noms et
impose un geste horizontal moins naturel sur ordinateur. Le W3C note explicitement que les contenus
de carrousel peuvent être difficiles à découvrir et exige une navigation au clavier compréhensible.
Les recherches de Baymard, bien que conduites sur le commerce électronique, confirment le risque :
les carrousels font souvent manquer du contenu et une présentation statique plus simple fonctionne
au moins aussi bien dans leurs tests
([W3C, Carousels Tutorial](https://www.w3.org/WAI/tutorials/carousels/),
[Baymard, Homepage Carousels](https://baymard.com/blog/homepage-carousel)).

## Recommandation priorisée

### P0 : réordonner le hub autour des intentions

Ordre recommandé :

1. titre, promesse éditoriale et date de l'élection ;
2. recherche présidentielle compacte ;
3. trois accès de même niveau : « Voir les candidats », « Explorer par thème », « Comparer deux
   candidats » ;
4. sujets précis et thèmes disponibles ;
5. repères et état du corpus ;
6. contact des équipes de campagne.

La recherche doit donc passer avant les candidatures, mais le grand rail de fiches ne doit pas être
la section suivante. Il faut plutôt proposer un accès clair vers l'annuaire. Cette solution évite de
donner une exposition arbitraire à quatre noms sur vingt-cinq, conserve une lecture non partisane et
met à égalité les trois parcours structurants. Le W3C recommande précisément plusieurs chemins vers
les contenus, tandis que Google recommande une structure logique et des liens internes aux intitulés
descriptifs
([W3C, Multiple Ways](https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html),
[Google, bonnes pratiques sur les liens](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)).

Il ne faut pas choisir quatre « candidats mis en avant » sans règle éditoriale forte. Même un ordre
alphabétique et documenté procure mécaniquement davantage de visibilité aux premiers éléments. Si
des fiches doivent absolument rester sur le hub, une grille complète et repliable sans JavaScript est
plus prévisible sur ordinateur. Sur mobile, une rangée horizontale peut subsister comme aperçu à
condition de montrer nettement qu'elle continue, de fournir des commandes précédent et suivant, de
conserver les liens au clavier et de proposer juste à côté « Voir toutes les candidatures ».

### P0 : alléger la recherche sans la rendre ambiguë

Composition recommandée :

- une étiquette visible et concise : « Rechercher une mesure, un thème ou un candidat » ;
- un champ large dont l'exemple suggère à la fois mots-clés et question naturelle ;
- un bouton « Rechercher » ou une loupe avec le même nom accessible ;
- une seule courte indication persistante : « Recherche dans les contenus publiés par Poligraph » ;
- un disclosure textuel « Comment fonctionne la recherche ? » pour la transmission éventuelle à
  Mistral, le classement et la méthode.

Il ne faut pas transformer la réserve de périmètre en tooltip à icône seule. Un tooltip est peu
découvrable sur écran tactile et ne convient qu'à une précision non essentielle. Ici, savoir que les
résultats décrivent seulement le corpus documenté modifie l'interprétation d'une absence. Cette
information mérite une phrase courte visible. L'explication longue, elle, peut être repliée : GOV.UK
recommande une seule phrase pour une aide de champ et déconseille d'associer une longue explication
au contrôle, car un lecteur d'écran la répète à chaque interaction. GOV.UK réserve le composant de
détails aux contenus courts et moins importants
([GOV.UK, Question pages](https://design-system.service.gov.uk/patterns/question-pages/),
[GOV.UK, Tabs and disclosure choice](https://design-system.service.gov.uk/components/tabs/)).

La phrase « Une absence de résultat ne prouve pas qu'une proposition n'existe pas » est surtout
utile après une recherche, particulièrement dans l'état sans résultat. La répéter en permanence sur
le hub surcharge le premier écran avant même que le risque d'interprétation existe. Le hub peut se
limiter au périmètre positif ; la page de résultats doit porter la réserve complète au moment où
elle devient utile.

### P0 : traiter une page de sous-thème comme une page de contenu

Une URL avec `sous-theme=sejour-eloignement` n'est pas vécue comme une recherche par l'utilisateur.
C'est une page de consultation. Son premier écran doit contenir, dans cet ordre :

1. le fil d'Ariane ;
2. le nom exact du sous-thème dans le `h1` ;
3. le nombre de mesures et le thème parent ;
4. la première mesure.

La recherche générale peut apparaître sous les résultats, ou comme un lien compact « Nouvelle
recherche ». Elle ne doit pas repousser les mesures. En cas de sous-thème vide, elle doit au contraire
remonter juste après l'état vide pour offrir une issue. Cette hiérarchie suit le principe de
frontloading : placer au début de chaque section l'information recherchée. L'Office for National
Statistics recommande cette pyramide inversée et des titres descriptifs pour les utilisateurs qui
parcourent la page par couches de titres
([ONS, How people read online](https://service-manual.ons.gov.uk/content/writing-for-users/how-people-read-online),
[ONS, Structuring content](https://service-manual.ons.gov.uk/content/writing-for-users/structuring-content)).

### P1 : simplifier la terminologie

Réserver « corpus » aux pages méthodologiques. Dans l'interface publique, préférer :

- « Rechercher dans les programmes 2027 » pour le périmètre global ;
- « Mesures sur “Séjour et éloignement” » pour un sous-thème ;
- « Explorer les thèmes » plutôt que « Thématiques » si le lien déclenche une action ;
- « Voir les candidats » plutôt que « Candidatures documentées » quand le lien mène à l'annuaire.

Les titres peuvent rester courts, mais doivent prédire le contenu. Le W3C recommande de mettre les
mots distinctifs au début des titres afin d'aider la lecture rapide et la navigation par lecteur
d'écran
([W3C, G130](https://www.w3.org/WAI/WCAG22/Techniques/general/G130)).

### P1 : préserver le maillage sans encombrer l'écran

Retirer le rail de candidats du haut du hub ne nuit pas au maillage si l'annuaire, les pages de thème
et la comparaison restent liés par de vrais éléments `<a href>`, avec des libellés explicites. Google
indique que chaque page importante doit recevoir au moins un lien depuis une page trouvable et que
l'intitulé du lien doit expliquer la destination. Il n'est pas nécessaire d'afficher 25 grandes
cartes pour satisfaire ce principe
([Google, bonnes pratiques sur les liens](https://developers.google.com/search/docs/crawling-indexing/links-crawlable),
[Google, sitelinks](https://developers.google.com/search/docs/appearance/sitelinks)).

Les pages de sous-thème à paramètres sont actuellement en `noindex,follow`. Leur titre améliore donc
d'abord l'orientation humaine, pas directement leur positionnement. Si certains sous-thèmes doivent
devenir des destinations SEO, cela demanderait une décision séparée : URL canonique dédiée, seuil de
contenu et liens éditoriaux stables, plutôt qu'un changement opportuniste de la page de recherche.

## Ce que je challenge dans la proposition initiale

- **Oui** à la recherche en premier sur le hub, sous réserve d'un suivi des usages.
- **Oui** à la suppression de « Chercher dans le corpus 2027 ».
- **Non** à la suppression de toute indication visible : garder un libellé concret et court.
- **Non** au tooltip comme seul support de la réserve éditoriale.
- **Non** au rail horizontal de toutes les candidatures sur desktop.
- **Oui** à un aperçu horizontal sur mobile seulement s'il est réellement nécessaire et si sa
  continuation est évidente.
- **Oui** à un accès très haut vers les candidats, mais sous forme de porte d'entrée au même niveau
  que thèmes et comparaison, pas sous forme de 25 fiches avant les autres parcours.

## Validation recommandée

La hiérarchie finale ne doit pas reposer uniquement sur une préférence experte. Pendant deux à
quatre semaines, mesurer séparément les activations de :

- la recherche ;
- l'annuaire des candidats ;
- les thèmes et sous-thèmes ;
- la comparaison ;
- le nombre de recherches sans résultat et de reformulations.

Faire ensuite cinq tests rapides, sur mobile en priorité, avec les tâches suivantes : trouver la
position d'un candidat sur un sujet, parcourir les propositions d'un candidat, comparer deux
candidats, retrouver un sous-thème précis, comprendre ce que signifie une absence de résultat. Le
bon ordre est celui qui réduit le temps jusqu'au premier contenu utile sans masquer les parcours
alternatifs.
