# Refonte de l'administration : brief de lancement

Ce brief ouvre le chantier dans une conversation dédiée. Il doit aussi pouvoir être lu par une personne qui rejoint le projet.

## Maquettes

Design de référence : https://claude.ai/artifact/7mmbjnY4DeuZquSHfoc5Za (« Refonte de l'administration Poligraph »).

Ce sont des maquettes, pas une spécification figée. Les chiffres qu'elles affichent sont des exemples. Le lien est privé : le propriétaire le partage depuis le menu Partager avant de le transmettre à quelqu'un d'autre.

Écrans couverts :

- **Socle** : tableau de bord, plan de navigation, équipe et rôles.
- **Affaires** : affaires à valider, liste et filtres, fiche et chronologie, classification (statut, étape, catégorie, implication), liaisons presse, gabarits d'alertes.
- **Élections** : analyse du code existant, liste des scrutins, présidentielle 2027, candidatures, fiche d'une candidature, file de relecture des mesures, relecture d'une mesure, mise en ligne.
- **Journal des évolutions** : liste et édition.
- **Composants** : menu et en-tête.

## Décision d'architecture déjà prise

- Le code de l'admin **reste open source**, dans ce dépôt. Les règles de publication (RGPD art. 10, présomption d'innocence, validation humaine des liaisons) sont la preuve publique de notre méthode : les fermer affaiblirait Poligraph face à une contestation.
- L'admin devient une **application séparée** du site public : déploiement distinct, domaine dédié (par exemple `admin.poligraph.fr`), authentification et réseau propres.
- Cible : un monorepo.

| Bloc              | Contenu                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `apps/web`        | Site public                                                               |
| `apps/admin`      | Administration                                                            |
| `packages/domain` | Schéma Prisma, migrations, gardes de publication, règles métier, libellés |

- Une seule source de vérité pour le schéma et les règles. L'admin n'écrit jamais en base en contournant `packages/domain`.
- Ce qui est privé, ce sont des **données**, jamais du code : notes de modération, procédures internes, comptes de l'équipe, secrets. Elles vivent hors du dépôt (Notion, variables d'environnement, base).

Si l'analyse contredit une de ces décisions, le dire avec les arguments plutôt que de la contourner.

## État actuel, à vérifier dans le code

- `src/app/admin` : 52 pages. `src/app/api/admin` : 95 routes. `src/components/admin` : 46 composants.
- Authentification : un mot de passe unique (`ADMIN_PASSWORD`) et un cookie signé HMAC, sans utilisateur nommé (`src/lib/auth.ts`, `src/lib/auth-token.ts`).
- Les routes passent par `withAdminAuth` et les mutations par `withValidation`. `db.auditLog` n'enregistre aujourd'hui ni utilisateur réel ni rôle.
- Navigation : `src/config/admin-navigation.ts`.
- Dernier ajout : le journal des évolutions (`src/app/admin/changelog`, `src/app/api/admin/changelog`), sur la branche `claude/clever-euler-p517i1`.

## Rôles visés

Un seul super administrateur au départ : le **Propriétaire**. Le modèle doit pouvoir évoluer sans migration douloureuse, par exemple pour plusieurs propriétaires ou des rôles par domaine (affaires, élections).

| Rôle                  | Peut                                                                    | Ne peut pas                                |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| Propriétaire (unique) | Tout, dont gérer l'équipe, les rôles et les paramètres                  | Être attribué depuis l'interface au départ |
| Administrateur        | Contenu, imports, santé des données, consulter l'équipe                 | Gérer les rôles                            |
| Modérateur            | Traiter les files : affaires à valider, liaisons, mesures, signalements | Paramètres, imports, équipe                |
| Lecture seule         | Consulter                                                               | Toute écriture                             |

Règles transverses :

- Une personne ne valide pas sa propre rédaction d'une affaire (principe des quatre yeux, à confirmer).
- Chaque action est tracée avec la personne, son rôle, l'heure et le changement.
- Double authentification obligatoire pour Propriétaire et Administrateur.
- Un rôle ne voit pas ce qu'il ne peut pas faire, sauf si l'écran explique pourquoi.

## Invariants à ne jamais casser

Lire `AGENTS.md` en entier (sections 2, 5, 6, 7 et 8 surtout). En particulier :

1. Une affaire ne passe en `PUBLISHED` que par `assertPublishable()` (`src/lib/affairs/publish-guard.ts`).
2. Toute source automatique crée des brouillons (`DRAFT`). Publier est une action humaine distincte.
3. L'implication par défaut est `MENTIONED_ONLY`. Aucune escalade automatique.
4. Le résolveur affaire et personnalité ne relie automatiquement que sur `SAME`. `UNDECIDED` va en revue humaine.
5. Aucune logique propre à un parti.
6. Accessibilité WCAG 2.1 AA, cibles de 44 px, français avec accents réels, pas de tiret long.

## Collaboration

Des bénévoles vont contribuer. Le chantier doit être découpable et sûr pour eux :

- **Pas d'accès à la base de production** pour les contributeurs. Prévoir une base de développement avec un jeu de données anonymisé ou fictif (seed), sans données judiciaires réelles sur des personnes.
- **Tickets autonomes** : chaque ticket a un écran ou une brique, un critère de fin et ses tests.
- **Petites PR**, moins de 400 lignes si possible. Revue obligatoire par le Propriétaire pour tout ce qui touche à la publication, aux rôles ou à l'audit.
- Documenter l'installation locale de l'admin dans `CONTRIBUTING.md`.

## Ce qu'on attend de la première session (pas de code)

1. **Lecture** : `AGENTS.md`, le code admin actuel, les maquettes.
2. **Document de conception** (`docs/engineering/admin-system-design.md`) :
   - découpage monorepo et outillage (workspaces npm ou autre, à justifier avec les versions LTS actuelles) ;
   - authentification et rôles : solution choisie, comparée à au moins deux alternatives (par exemple Supabase Auth ou Auth.js), stockage des rôles, double authentification ;
   - audit enrichi (personne, rôle) et migration de l'existant ;
   - déploiement : projet Vercel séparé, domaine, en-têtes de sécurité, restriction réseau éventuelle ;
   - stratégie de migration écran par écran, l'ancien `/admin` restant en service jusqu'à la bascule ;
   - risques et points ouverts.
3. **Décisions** : une ADR par choix structurant (`docs/engineering/adr/`).
4. **Plan** : phases et liste de tickets prêts à ouvrir sur GitHub, avec dépendances.

Ordre de phases proposé, à challenger :

1. Authentification nommée et rôles, dans l'admin actuel (gain de sécurité immédiat).
2. Extraction de `packages/domain`, sans changement de comportement.
3. Squelette `apps/admin` : en-tête, menu, tableau de bord.
4. Migration des écrans, risque juridique d'abord : affaires à valider, puis le reste des affaires, puis les élections.
5. Retrait de l'ancien `/admin`.

## Questions ouvertes pour le Propriétaire

- Hébergement de l'authentification : Supabase (déjà utilisé) ou une solution indépendante ?
- Quatre yeux obligatoires sur les affaires dès le départ, ou seulement quand il y aura au moins deux modérateurs ?
- Faut-il des rôles par domaine (affaires, élections) dès la première version ?
- Restreindre l'accès admin par réseau ou par pays en plus de la double authentification ?
