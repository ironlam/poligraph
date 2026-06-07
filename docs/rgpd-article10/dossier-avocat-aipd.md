# Dossier avocat / AIPD : traitement de données pénales (article 10 RGPD)

Date : 2026-06-07
Objet : réunir les éléments factuels pour une revue juridique et, le cas
échéant, une analyse d'impact relative à la protection des données (AIPD).

> Ce document décrit des mesures techniques et éditoriales de réduction du
> risque. Il ne constitue pas un avis juridique et n'affirme aucune conformité.
> Les questions ouvertes à trancher figurent en section 7.

---

## 1. Présentation du traitement

Poligraph est un observatoire citoyen de la vie politique française. Il agrège
des données publiques sur les responsables politiques, dont des affaires
judiciaires rattachées nominativement. Le présent dossier concerne ce dernier
traitement, susceptible de relever de l'article 10 du RGPD (données pénales).

- Finalité : information citoyenne et débat d'intérêt général sur la probité des
  responsables publics.
- Personnes concernées : responsables politiques français (élus, ministres,
  dirigeants de partis), vivants ou décédés depuis moins de dix ans.
- Sources : articles de presse vérifiables, décisions de justice publiées,
  Wikidata, Wikipédia. Pas de blogs, forums, réseaux sociaux.
- Le site ne reconstitue pas un casier judiciaire (cf. `docs/LEGAL.md` §7.2).

## 2. Pièces du dossier

| Pièce                               | Emplacement                                                           |
| ----------------------------------- | --------------------------------------------------------------------- |
| Cadre juridique et mesures art. 10  | `docs/LEGAL.md`, section 7 entière                                    |
| Questions à valider par avocat      | `docs/LEGAL.md`, section 9.4                                          |
| Méthodologie publique (en ligne)    | `/methodologie` sur poligraph.fr                                      |
| Schéma des flux de publication      | présent document, section 3                                           |
| Exemples d'affichage par statut     | présent document, section 4                                           |
| Script d'audit de conformité        | `scripts/audit-affairs-compliance.ts`                                 |
| Résultats d'audit                   | présent document, section 5                                           |
| Spécification technique du chantier | `docs/superpowers/specs/2026-06-07-affaires-rgpd-article10-design.md` |
| État final et liste des PRs         | `docs/rgpd-article10/etat-final.md`                                   |

## 3. Schéma des flux : pipeline → DRAFT → revue → PUBLISHED

```
SOURCES AUTOMATISÉES                         ACTION HUMAINE                         PUBLIC
(presse, Wikidata, Wikipédia, Judilibre)

  [1] Détection + classification IA
        │
        ▼
  [2] Resolver personne/affaire
        │  produit une AffairPoliticianDecision
        │  (candidat + score + indices), JAMAIS un rattachement publié
        ▼
  [3] Création de l'affaire ───────────────►  publicationStatus = DRAFT
        │  verifiedAt = null, verifiedBy = null            (jamais public)
        │  decision.affairId renseigné
        │
        │                                   [4] Revue éditoriale humaine
        │                                       - confirme l'identité (onglet SAME)
        │                                       - vérifie statut, implication, sources
        │                                       - corrige / requalifie / rejette
        │                                            │
        │                                            ▼
        │                                   [5] assertPublishable() — point de
        │                                       passage UNIQUE vers PUBLISHED :
        │                                       • exige ≥ 1 source vérifiable
        │                                       • exige décisions resolver validées
        │                                         par un humain (reviewedBy +
        │                                         reviewAction confirmant + bon
        │                                         politicien)
        │                                       • écrit verifiedAt + verifiedBy
        │                                         atomiquement
        │                                            │
        │                                            ▼
        │                                                          publicationStatus = PUBLISHED
        │                                                          ───────────────────────────►
        │                                                          Visible : web, API, exports, MCP
        │                                                          (filtres centralisés identiques)
        ▼
  Une affaire jamais validée reste DRAFT indéfiniment : invisible partout.
```

Garanties machine :

- Aucun pipeline n'écrit PUBLISHED (type DRAFT-only au niveau du compilateur).
- Toute autre écriture directe de PUBLISHED est rejetée par un garde-fou
  d'intégration continue (CI).
- Les surfaces publiques (web, API, exports CSV/JSON, serveur MCP) appliquent
  les mêmes filtres : aucune affaire DRAFT, ARCHIVED, EXCLUDED ou REJECTED n'est
  accessible par aucune voie.

## 4. Exemples d'affichage par statut (URLs publiques, 2026-06-07)

Chaque affaire publique porte un encart de prudence juridique adapté à son
statut procédural (composant `AffairStatusNotice`).

| Statut                      | Encart affiché                                                                                                                                      | Exemple en ligne                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Condamnation définitive     | « Condamnation définitive : les voies de recours ordinaires sont épuisées... »                                                                      | https://poligraph.fr/affaires/jean-marie-le-pen-condamnation-de-jean-marie-le-pen-pour-coups-et-blessures-volontaires-1960 |
| Condamnation non définitive | « Décision non définitive : cette condamnation peut encore faire l'objet d'un recours... »                                                          | https://poligraph.fr/affaires/emploi-fictif-assistant-parlementaire-yann-bompard                                           |
| Procédure en cours          | « Présomption d'innocence : cette procédure est en cours. La personne... est présumée innocente... »                                                | https://poligraph.fr/affaires/jean-christophe-lagarde-escroquerie-2024                                                     |
| Relaxe (issue favorable)    | « Procédure close sans condamnation : cette issue est favorable... ne doit pas être lue comme une condamnation. »                                   | https://poligraph.fr/affaires/eric-woerth-woerth-bettencourt-relaxe-d-eric-woerth                                          |
| Prescription                | « Action publique éteinte par prescription : la procédure est close sans condamnation. La prescription ne constitue pas une décision sur le fond. » | https://poligraph.fr/affaires/francois-fillon-detournements-de-fonds-publics-du-senat-urs                                  |

Pour les issues favorables (relaxe, acquittement, non-lieu, classement sans
suite), l'encart est affiché AVANT toute description, de manière dominante.

## 5. Résultats d'audit (prod, 2026-06-07)

Commande : `npx dotenv -e .env -- npx tsx scripts/audit-affairs-compliance.ts`
(lecture seule).

| Indicateur                                                                          | Valeur |
| ----------------------------------------------------------------------------------- | ------ |
| Affaires publiées sans validation humaine tracée (`verifiedBy` null)                | 0      |
| Auto-publications Wikidata résiduelles                                              | 0      |
| Affaires publiées sans source                                                       | 0      |
| Issues favorables comptées dans un agrégat à charge                                 | 0      |
| Enquêtes préliminaires publiées (visibles sur fiche, exclues des agrégats à charge) | 64     |
| Décisions resolver orphelines pointant vers une affaire publiée (suivi éditorial)   | 50     |

Agrégats publics distingués (cf. `/methodologie`) :

- condamnations ; procédures validées par un juge ; enquêtes préliminaires (non
  comptées comme validées) ; procédures closes sans condamnation.
- Compteurs par rôle sur chaque fiche : total (tous rôles confondus, legacy),
  à charge, issues favorables, simple mention, victime/plaignant. Ils ne se
  cumulent pas (une enquête préliminaire directe n'entre dans aucun).

## 6. Droits des personnes

- Droit de réponse (loi du 29 juillet 1881) : `docs/LEGAL.md` §5.
- Accès, rectification, opposition (RGPD art. 15, 16, 21) : `docs/LEGAL.md` §6.3.
- En cas de doute sérieux sur un rattachement, l'affaire est repassée en DRAFT
  le temps de la vérification (`docs/LEGAL.md` §7.4).

## 7. Questions ouvertes à trancher par l'avocat (reprises de LEGAL.md §9.4)

1. Qualification du traitement au regard de l'article 10 RGPD (données pénales)
   et base de licéité retenue.
2. Applicabilité du régime journalistique et de la liberté d'expression
   (articles 80 RGPD et 67 de la loi Informatique et Libertés).
3. Durées de conservation des affaires, notamment après une issue favorable ou
   pour les procédures anciennes.
4. Statuts judiciaires admissibles dans les agrégats publics.
5. Traitement de la prescription (affichage et conservation).
6. Conditions de publication d'un rattachement personne / affaire.

Ces réponses conditionnent toute montée en échelle (volume d'affaires, nouvelles
sources automatisées).
