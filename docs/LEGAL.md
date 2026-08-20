# Considérations juridiques

> **Dernière mise à jour** : 2026-08-20

Ce document détaille le cadre juridique applicable au projet Poligraph et les mesures prises pour assurer sa conformité.

---

## 1. Cadre légal applicable

### 1.1 Textes de référence

| Texte                                 | Application                                         |
| ------------------------------------- | --------------------------------------------------- |
| **Loi du 29 juillet 1881**            | Liberté de la presse, diffamation, droit de réponse |
| **Article 9-1 du Code civil**         | Présomption d'innocence                             |
| **RGPD**                              | Protection des données personnelles                 |
| **Loi du 6 janvier 1978 (CNIL)**      | Informatique et libertés                            |
| **Loi du 11 octobre 2013**            | Transparence de la vie publique (HATVP)             |
| **Code pénal art. 226-1 et suivants** | Respect de la vie privée                            |

### 1.2 Statut du site

Service de communication publique en ligne édité à titre non professionnel (article 6, III, 1° de la loi 2004-575 du 21 juin 2004).

---

## 2. Ce qui est autorisé

### 2.1 Données réutilisables

| Type de donnée             | Source             | Licence                  |
| -------------------------- | ------------------ | ------------------------ |
| Identité des élus          | AN, Sénat, JO      | Licence Ouverte (Etalab) |
| Mandats et fonctions       | data.gouv.fr       | Licence Ouverte          |
| Déclarations de patrimoine | HATVP              | Licence Ouverte          |
| Condamnations définitives  | Presse, Légifrance | Données publiques        |
| Photos officielles         | AN, Sénat          | Réutilisation autorisée  |

### 2.2 Informations publiables

- **Condamnations définitives** : Après épuisement des voies de recours
- **Mises en examen publiques** : Avec mention de la présomption d'innocence
- **Déclarations HATVP** : Données publiques par la loi
- **Mandats et rémunérations** : Informations officielles

---

## 3. Ce qui est INTERDIT

### 3.1 Données confidentielles

- Accéder ou diffuser le casier judiciaire (B1, B2, B3)
- Informations issues d'une instruction en cours (secret)
- Données médicales ou vie privée
- Adresses personnelles des élus

### 3.2 Pratiques interdites

- Présenter une mise en examen comme une condamnation
- Diffuser des informations non sourcées
- Utiliser des photos sans droit de réutilisation
- Porter atteinte à la présomption d'innocence

---

## 4. Présomption d'innocence

### 4.1 Principe (Article 9-1 du Code civil)

> "Chacun a droit au respect de la présomption d'innocence. Lorsqu'une personne est, avant toute condamnation, présentée publiquement comme étant coupable de faits faisant l'objet d'une enquête ou d'une instruction judiciaire, le juge peut [...] prescrire toutes mesures [...] aux fins de faire cesser l'atteinte à la présomption d'innocence."

### 4.2 Application sur le site

| Statut judiciaire          | Affichage                              |
| -------------------------- | -------------------------------------- |
| Enquête préliminaire       | Mention explicite + rappel présomption |
| Mise en examen             | Mention explicite + rappel présomption |
| Procès en cours            | Mention explicite + rappel présomption |
| Condamnation 1ère instance | Mention "appel possible"               |
| Condamnation définitive    | Pas de mention spéciale                |
| Relaxe / Non-lieu          | Affichage de l'issue favorable         |

### 4.3 Formulation type

> "Présomption d'innocence : Cette procédure est en cours. [Nom] bénéficie de la présomption d'innocence jusqu'à sa condamnation définitive."

---

## 5. Droit de réponse

### 5.1 Cadre légal (Loi du 29 juillet 1881)

Toute personne nommée ou désignée dans un service de communication au public en ligne dispose d'un droit de réponse.

### 5.2 Procédure mise en place

1. **Contact** : Email dédié pour les demandes
2. **Délai de traitement** : 72 heures ouvrées
3. **Publication** : Réponse publiée à la suite de l'information contestée
4. **Rectification** : Correction immédiate si erreur factuelle avérée

### 5.3 Cas de retrait

- Information non sourcée
- Erreur factuelle prouvée
- Décision de justice ordonnant le retrait
- Demande légitime de l'intéressé (cas par cas)

---

## 6. Protection des données (RGPD)

### 6.1 Données des représentants politiques

| Donnée               | Base légale      | Justification                    |
| -------------------- | ---------------- | -------------------------------- |
| Identité             | Intérêt légitime | Personnalité publique            |
| Mandats              | Intérêt légitime | Information citoyenne            |
| Patrimoine           | Loi (HATVP)      | Obligation légale de publication |
| Affaires judiciaires | Intérêt légitime | Débat d'intérêt général          |

### 6.2 Données des visiteurs

Les traitements liés aux visiteurs et utilisateurs sont détaillés dans la page
publique [/confidentialite](/confidentialite). Ils varient selon le service :

- **Site principal** : mesure d'audience avec Umami, sans cookie.
- **Newsletter** : inscription fondée sur le consentement et traitée avec
  Mailjet.
- **Serveur MCP** : logs techniques limités aux métadonnées opérationnelles.
  Les arguments des tools ne sont pas copiés dans les logs applicatifs.
- **Support** : traitement des informations transmises volontairement pour
  répondre à la demande.

Cette description ne préjuge pas des données techniques que les hébergeurs
peuvent traiter pour acheminer et sécuriser les requêtes.

### 6.3 Droits des personnes

Les représentants politiques mentionnés disposent de :

- Droit d'accès (article 15 RGPD)
- Droit de rectification (article 16 RGPD)
- Droit d'opposition (article 21 RGPD), appréciation au cas par cas

---

## 7. Traitement de données pénales (article 10 RGPD)

> Cette section décrit des **mesures de réduction du risque**. Elle ne constitue
> pas un avis juridique et n'affirme pas que le traitement est conforme. La
> qualification finale relève d'un avocat spécialisé et, le cas échéant, d'une
> analyse d'impact (AIPD). Voir la section 8.

### 7.1 Pourquoi ces données sont sensibles

Une affaire judiciaire rattachée nommément à une personne est une donnée
relative à une infraction ou à une procédure pénale. Le regroupement
automatisé et structuré de telles données par personne, surtout à grande
échelle, peut relever de l'article 10 du RGPD, qui encadre strictement le
traitement des données pénales. Le risque ne vient pas de la mention isolée
d'une affaire sourcée, mais de la constitution d'un fichier durable
d'antécédents ou de mises en cause.

### 7.2 Poligraph n'est pas un casier judiciaire

Poligraph documente des affaires déjà publiques, issues de sources vérifiables,
dans un objectif d'information citoyenne sur la vie politique. Le site ne
reconstitue pas, ne vend pas et ne prétend pas refléter le casier judiciaire
d'une personne. Une affaire absente du site ne signifie rien sur la situation
judiciaire réelle d'une personne, et une affaire présente n'établit pas une
culpabilité (voir la présomption d'innocence, section 4).

### 7.3 Mesures techniques mises en place

Ces garde-fous sont implémentés dans le code et vérifiés par des tests
automatisés :

- **Aucune publication automatique.** Tout pipeline automatisé (presse,
  Wikidata, Wikipédia) crée une affaire en brouillon (`DRAFT`),
  jamais publiée directement. Même une condamnation issue d'une source
  structurée reste en attente de revue. Judilibre ne crée aucune affaire : il
  alimente une décision de justice rattachée, à partir d'une référence connue.
- **Validation humaine obligatoire avant publication.** La mise en ligne d'une
  affaire passe par un point de contrôle unique côté serveur qui exige au moins
  une source vérifiable, refuse la publication si un rattachement automatique
  n'a pas été validé par un humain, et enregistre qui a validé et quand.
- **Pas de rattachement publié sur un score algorithmique seul.** Le moteur de
  rapprochement personne / affaire ne fait que proposer un candidat avec un
  score et des indices. Aucun rattachement pénal n'est rendu public sur la
  seule base de ce score : un modérateur confirme l'identité, le statut
  judiciaire, l'implication et les sources.
- **Issues favorables affichées de manière dominante.** Une relaxe, un
  acquittement, un non-lieu ou un classement sans suite est signalé clairement,
  avant toute description, et n'est jamais présenté comme une mise en cause
  active.
- **Prescription distinguée.** L'extinction de l'action publique par
  prescription est affichée séparément (« action publique éteinte par
  prescription ») et n'est pas assimilée à une relaxe : elle clôt la procédure
  sans décision sur le fond.
- **Agrégats prudents.** Les compteurs publics distinguent les condamnations,
  les procédures validées par un juge, les enquêtes préliminaires et les
  procédures closes sans condamnation. Les enquêtes préliminaires ne sont pas
  comptées comme des procédures validées par un juge (voir la page
  Méthodologie).
- **Mêmes règles sur toutes les surfaces.** Les pages web, les routes API
  publiques, les exports et le serveur MCP appliquent les mêmes filtres : ils
  n'exposent que des affaires publiées après validation humaine. Une affaire en
  brouillon, archivée, exclue ou rejetée n'est accessible par aucune de ces
  voies.

### 7.4 Droits des personnes concernées

Au-delà des droits rappelés en section 5 (droit de réponse) et 6.3 (accès,
rectification, opposition), toute personne concernée peut demander la
correction d'une information inexacte ou le réexamen d'un rattachement. En cas
de doute sérieux, l'affaire est repassée en brouillon le temps de la
vérification. Le contact est indiqué dans les mentions légales.

### 7.5 Limites assumées

Ces mesures réduisent le risque, elles ne le suppriment pas. Une montée en
échelle du nombre d'affaires traitées, ou l'ajout de nouvelles sources
automatisées, doit être précédée d'un réexamen juridique. Les points listés en
section 8.4 restent à valider par un avocat spécialisé avant tout changement
d'échelle.

---

## 8. Propriété intellectuelle

### 7.1 Contenus du site

| Contenu            | Licence        |
| ------------------ | -------------- |
| Code source        | AGPL-3.0       |
| Données factuelles | Domaine public |
| Textes éditoriaux  | CC BY-SA 4.0   |

### 7.2 Crédits obligatoires

- Photos : Sources officielles (AN, Sénat, HATVP)
- Données : Mentionner data.gouv.fr, HATVP, Wikidata
- Inspirations : Regards Citoyens (NosDéputés, NosSénateurs)

---

## 9. Recommandations

### 9.1 Avant mise en production

- [ ] Consulter un avocat spécialisé (presse/données)
- [ ] Vérifier l'assurance RC Pro (si association/société)
- [ ] Définir une procédure de retrait d'urgence
- [ ] Compléter les mentions légales (éditeur, contact)

### 9.2 En continu

- [ ] Vérifier les sources avant publication
- [ ] Mettre à jour les statuts des affaires
- [ ] Répondre aux demandes de rectification
- [ ] Archiver les preuves (sources, dates)

### 9.3 Bonnes pratiques (inspirées de Regards Citoyens)

- Transparence sur la collecte et le traitement
- Licences ouvertes pour la réutilisation
- Pas de cession de données à des tiers
- Anonymisation si analytics

### 9.4 Points à valider par un avocat spécialisé

Les mesures de la section 7 réduisent le risque sans garantir la conformité.
Les questions suivantes doivent être tranchées par un avocat spécialisé avant
toute montée en échelle :

- [ ] Qualification du traitement au regard de l'article 10 RGPD (données
      pénales) et base de licéité retenue.
- [ ] Applicabilité du régime journalistique et de la liberté d'expression
      (articles 80 RGPD et 67 de la loi Informatique et Libertés).
- [ ] Durées de conservation des affaires, notamment après une issue favorable
      ou pour les procédures anciennes.
- [ ] Statuts judiciaires admissibles dans les agrégats publics.
- [ ] Traitement de la prescription (affichage et conservation).
- [ ] Conditions de publication d'un rattachement personne / affaire.

---

## 10. Ressources

- [HATVP - Open Data](https://www.hatvp.fr/open-data/)
- [CNIL - Données publiques](https://www.cnil.fr)
- [Regards Citoyens - Mentions légales](https://www.regardscitoyens.org/mentions-legales/)
- [Licence Ouverte Etalab](https://www.etalab.gouv.fr/licence-ouverte-open-licence)
- [Creative Commons BY-SA](https://creativecommons.org/licenses/by-sa/4.0/)
