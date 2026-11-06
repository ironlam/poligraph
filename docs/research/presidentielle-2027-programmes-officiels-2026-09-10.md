# Inventaire des programmes officiels, présidentielle 2027

Date de la veille : 10 septembre 2026. Mode : lecture seule. La base de production n'a pas été
modifiée.

## Périmètre et méthode

La passe couvre les 29 candidatures au statut `DECLARE` dans la base de production. Les compteurs
ci-dessous correspondent aux mesures publiées au moment de la requête. La recherche privilégie les
sites de campagne, les sites des partis, leurs sitemaps, leurs pages et leurs PDF. Un document ancien
n'est pas considéré comme un programme 2027 sans réaffirmation explicite.

Qualification utilisée :

- **programme complet** : document ou site présenté comme le programme 2027 dans son ensemble ;
- **corpus thématique** : livrets, priorités, discours ou projet de parti actuels, mais non exhaustifs ;
- **déclaration** : cap politique ou annonce sans dispositifs suffisamment précis ;
- **historique** : programme d'une élection antérieure, non réaffirmé pour 2027.

## Conclusion opérationnelle

La veille ne révèle pas de nouveau programme complet pour Ségolène Royal, Nathalie Arthaud ou
Delphine Batho.

La brochure Arthaud repérée sur la page officielle du 25 août est exactement le PDF déjà audité,
extrait et complété le 31 août. L'audit d'exhaustivité avait inspecté 102 passages, retenu les mesures
distinctes et rejeté doublons, éléments subsumés et simples diagnostics. Les 14 mesures publiées en
production sont donc cohérentes avec cet audit. Il ne faut pas relancer un import du même PDF.

Les corpus réellement nouveaux ou nouvellement exploitables sont :

1. **Fabien Verdier** : son site de primaire contient maintenant trois axes et plusieurs engagements
   précis. C'est le meilleur petit lot nouveau à préparer.
2. **Fabien Roussel** : aucun programme complet sur le tout nouveau site de campagne, mais son discours
   officiel de l'université d'été du PCF contient un lot de mesures explicites et attribuées. Le site de
   campagne n'affiche pour l'instant qu'un cap général et un formulaire de consultation sur le travail.
3. **Olivier Faure** : le Projet socialiste adopté en juillet est un corpus complet de parti disponible,
   mais le site personnel de primaire n'en publie pas encore de reprise formelle. Il faut donc créer, si
   la doctrine le permet, une édition propriétaire `PARTY`, sans la présenter comme son programme
   personnel.
4. **Emmanuel Maurel** : cinq livrets thématiques GRS d'août 2026 sont riches et actuels. Leur attribution
   à la candidature reste à valider. Le domaine GRS présente en plus une injection visible de liens de
   casinos dans le HTML : aucun import automatisé ne devrait être lancé avant nettoyage ou récupération
   de PDF intègres.
5. **Delphine Batho** : une intervention officielle du 1er juillet contient trois réponses concrètes aux
   vagues de chaleur. C'est un petit complément possible, pas un programme.

## Priorités demandées

### Ségolène Royal

État actuel : 7 mesures publiées, toutes issues de [La France tranquille, cinq engagements](https://segolene-ordrejuste.fr/).
Le sitemap et la page d'accueil ne révèlent que ces cinq priorités. La [lettre de septembre](https://segolene-ordrejuste.fr/la-lettre-de-segolene)
porte sur la mobilisation pour la primaire et le fonctionnement de l'État, sans nouvelle mesure
suffisamment définie.

Qualification : **corpus thématique court**, pas programme complet. La lacune est réelle. Le Pacte
présidentiel de 2007 encore trouvable sur d'anciens domaines est **historique** et doit rester exclu.
Le [Projet socialiste adopté](https://parti-socialiste.fr/actualites/le-projet-socialiste-adopte/)
n'est pas personnellement repris sur son site de campagne et ne doit pas lui être attribué par défaut.

### Nathalie Arthaud

État actuel : 14 mesures publiées et quatre éditions de programme. La [brochure présidentielle
2027](https://www.lutte-ouvriere.org/medias/document/fichiers/2026/06/brochure-ete-2026.pdf) répond en
HTTP 200 et constitue un **corpus programmatique complet et actuel** au sens de Lutte ouvrière, même si
le texte précise qu'il s'agit d'un programme de lutte et non d'un programme de gouvernement électoral.
La [page du 25 août](https://www.lutte-ouvriere.org/portail/breves/brochure-campagne-196541.html) ne
publie pas une nouvelle version : elle renvoie au même fichier de juin.

Conclusion : **aucun manque documentaire nouveau**. Le faible nombre apparent vient du filtrage
éditorial strict et de la déduplication, pas d'une absence de recherche. Les programmes 2022 et
antérieurs restent **historiques**.

### Delphine Batho

État actuel : 10 mesures publiées. La [résolution d'investiture](https://www.generationecologie.fr/publication/investiture-de-delphine-batho-a-lelection-presidentielle/)
du 6 juin appelle encore à construire le programme de gouvernement. Le programme complet 2027 n'est
donc pas publié.

Corpus déjà audité : discours d'investiture, intervention sur l'énergie et cahier d'acteur sur l'État
résilience. Corpus complémentaire exploitable : l'[intervention du 1er juillet sur les vagues de
chaleur](https://www.generationecologie.fr/2026/07/01/face-aux-vagues-de-chaleur-avoir-le-sens-des-priorites/),
qui demande des lieux de rafraîchissement, une mobilisation pour les personnes vulnérables et des
mesures de sécurité de l'eau. Le texte d'orientation [Vivre autrement](https://www.generationecologie.fr/vivre-autrement/)
est un **corpus thématique de parti en construction**, pas un programme final personnel.

Qualification : **programme en construction**, avec un petit complément de déclarations primaires.

## Nouveaux lots possibles

### Lot A, Fabien Verdier

La [page officielle de campagne](https://fabienverdier.fr/) répond en HTTP 200 et relie explicitement
les propositions à sa candidature à la primaire. Mesures distinctes immédiatement repérables :

- inscrire la DGF comme ressource stable des collectivités dans une loi organique ;
- créer une loi de finances des collectivités territoriales ;
- empêcher la baisse annuelle de la DGF, hors effort national partagé ;
- affecter une part variable de la DGF aux investissements locaux ;
- réserver 20 % des membres du Gouvernement à des maires de sous-préfectures ou d'arrondissements ;
- supprimer les agences régionales de santé et confier le pilotage territorial de la santé aux élus.

Qualification : **corpus thématique personnel actuel**, pas programme complet. Potentiel prudent :
environ 6 mesures autonomes à soumettre à modération. Les contenus municipaux de Châteaudun doivent être
exclus, sauf reprise explicite à l'échelle nationale.

### Lot B, Fabien Roussel

Le [site officiel de campagne](https://www.fabienroussel2027.fr/) est en ligne depuis le 7 septembre,
mais ne contient encore qu'un manifeste général. Son sitemap ne comporte aucune page de programme. La
page `/travail`, ajoutée le 10 septembre, est uniquement un formulaire de contribution.

Le [discours officiel du PCF du 29 août](https://www.pcf.fr/ue_26_discours_fr) contient toutefois des
engagements précis : SMIC à 1 700 euros net, hausse immédiate de 5 % des salaires, revalorisation de 30 %
du point d'indice, échelle mobile des salaires, aucune retraite sous le SMIC, nationalisation ou
expropriation de Total, équipements de sécurité civile, deux millions de pompes à chaleur par an et un
million de véhicules électriques à moins de 10 000 euros produits en France.

Qualification : **discours programmatique de précampagne**, pas programme complet. Potentiel : 8 à 12
mesures après déduplication avec les positions PCF déjà présentes ailleurs. Le plan climat Empreinte
2050 est un corpus de parti adopté mais ancien, pas une édition présidentielle 2027 autonome.

### Lot C, Olivier Faure et Projet socialiste

Le [site personnel de primaire](https://avecfaure2027.fr/) confirme la candidature, mais n'affiche
aucune plateforme programmatique. Le [Projet socialiste](https://projet-socialiste.fr/) répond en HTTP
200 et le PS confirme son adoption à 83 % le 2 juillet 2026. L'ancien PDF indexé sur le sous-domaine
`ressources-militantes` répond désormais en HTTP 404.

Qualification : **programme complet actuel du parti**, attribution personnelle non encore établie sur
le site de Faure. Import possible comme édition de parti seulement, avec une décision éditoriale sur le
rattachement aux candidatures de la primaire.

### Lot D, Emmanuel Maurel et GRS

La [page de candidature](https://g-r-s.fr/emmanuel-maurel-candidat-a-la-primaire-de-la-gauche-socialiste/)
annonce un projet de « gauche en 3D », sans programme personnel détaillé. Les [cinq livrets thématiques
du congrès d'Aubervilliers](https://g-r-s.fr/5-livrets-thematiques-issus-du-congres-daubervilliers/)
traitent d'écologie, de stratégie économique, d'Europe, d'agriculture et d'eau. Ils contiennent de
nombreuses mesures concrètes.

Qualification : **corpus thématique actuel du parti**. Attribution à Maurel à confirmer avant import.
Blocage technique et éditorial : le HTML du domaine comporte des liens de casino injectés et masqués.
Conserver les URL comme piste, mais ne pas faire confiance à une ingestion automatique du site en l'état.

## Passe des 29 candidatures déclarées

| Candidate ou candidat | Mesures publiées | Meilleure qualification actuelle           | Résultat de la veille                                                                                                     |
| --------------------- | ---------------: | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Anasse Kazib          |               25 | Corpus thématique de campagne              | Pas de programme complet nouveau                                                                                          |
| Antoine Mikolajczak   |                2 | Trois priorités, programme annoncé         | Le [site Équinoxe](https://parti-equinoxe.fr/presidentielle-2027/) dit que le programme complet sera publié prochainement |
| Bernard Cazeneuve     |               26 | Lettre-manifeste                           | Aucun nouveau document complet repéré                                                                                     |
| Bruno Retailleau      |              223 | Corpus de livrets thématiques LR           | Corpus déjà largement importé                                                                                             |
| Clara Egger           |                2 | Programme complet à objet unique           | Corpus déjà audité, deux réformes juridiques détaillées                                                                   |
| David Lisnard         |              134 | Corpus thématique officiel                 | Corpus déjà largement importé                                                                                             |
| Delphine Batho        |               10 | Programme en construction                  | Petit complément du 1er juillet, pas de programme final                                                                   |
| Dominique de Villepin |               70 | Corpus de chroniques officielles           | Corpus déjà largement importé                                                                                             |
| Édouard Philippe      |               76 | Quatre priorités officielles               | Aucun nouveau document complet repéré                                                                                     |
| Emmanuel Maurel       |                0 | Corpus thématique GRS                      | Nouveau corpus possible, attribution et sécurité à valider                                                                |
| Fabien Roussel        |                0 | Discours programmatique et corpus PCF      | Nouveau lot prioritaire, programme complet absent                                                                         |
| Fabien Verdier        |                0 | Premiers axes personnels                   | Nouveau lot prioritaire d'environ 6 mesures                                                                               |
| Florian Philippot     |               98 | Projet de parti 2025                       | Corpus déjà largement importé                                                                                             |
| François Asselineau   |               10 | Fondamentaux actuels                       | L'[UPR](https://upr.fr/notre-programme) annonce que le programme 2027 sera publié prochainement                           |
| François Ruffin       |              115 | Trois cahiers de campagne                  | Corpus déjà audité, 85 brouillons restent en production                                                                   |
| Gabriel Attal         |              251 | Corpus de conventions Renaissance          | Corpus déjà largement importé                                                                                             |
| Jean-Luc Mélenchon    |              792 | Programme complet AEC 2025                 | Corpus complet déjà importé                                                                                               |
| Jérôme Guedj          |               26 | Priorités thématiques personnelles         | Corpus déjà importé                                                                                                       |
| Juan Branco           |             1174 | Programme complet La Voie                  | Corpus complet déjà importé                                                                                               |
| Karim Bouamrane       |               13 | Manifeste personnel                        | Corpus court déjà importé                                                                                                 |
| Marine Le Pen         |              192 | Corpus thématique RN, non exhaustif 2027   | Aucun programme complet 2027 repéré                                                                                       |
| Marine Tondelier      |              192 | Programme et livrets de parti              | Corpus déjà largement importé                                                                                             |
| Nathalie Arthaud      |               14 | Corpus complet de campagne                 | Audit d'exhaustivité déjà fait, aucun nouvel import requis                                                                |
| Nicolas Dupont-Aignan |              335 | Livrets thématiques de parti               | Corpus déjà largement importé                                                                                             |
| Olivier Faure         |                0 | Programme complet du PS, pas personnel     | Décision de rattachement au programme de parti nécessaire                                                                 |
| Raphaël Glucksmann    |              310 | Corpus Place publique                      | Corpus déjà largement importé                                                                                             |
| Ségolène Royal        |                7 | Cinq engagements                           | Lacune réelle, attendre de nouvelles publications                                                                         |
| Selma Labib           |                4 | Déclarations et interview de campagne      | Aucun programme complet repéré                                                                                            |
| Xavier Bertrand       |               23 | Déclarations reproduites sur site officiel | Aucun programme complet repéré                                                                                            |

## Ordre recommandé pour la suite

1. Préparer un dry-run de 6 mesures environ pour Fabien Verdier.
2. Préparer un dry-run du discours de Fabien Roussel, limité aux engagements explicites et sans reprendre
   automatiquement tout Empreinte 2050.
3. Ajouter éventuellement les trois propositions canicule de Delphine Batho après contrôle de doublons.
4. Décider du traitement des programmes propriétaires `PARTY` pour le PS et la GRS avant tout rattachement
   à Faure ou Maurel.
5. Ne rien réimporter pour Nathalie Arthaud et ne rien compléter artificiellement pour Ségolène Royal.
