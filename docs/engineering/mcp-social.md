# MCP social : publier sur X et Bluesky depuis Claude

Serveur MCP privé, servi par l'app Next.js, qui permet de rédiger, valider et publier les posts
X et Bluesky de Poligraph depuis Claude (chat, téléphone, tâches planifiées). Il remplace Metricool
pour ces deux réseaux et reprend le code de publication de l'ancien « social auto-pilot » Inngest
(retiré en #1352).

## Pourquoi un MCP plutôt qu'Inngest ou un environnement cloud

- L'ancien pipeline mourait à l'étape de validation : des brouillons générés par gabarits, validés
  dans `/admin/social`, que personne n'ouvrait. Ici, la rédaction et la validation se font dans
  la conversation, la publication part d'un clic de confirmation.
- Les clés X et Bluesky restent dans les variables Vercel. Ni Claude ni un environnement cloud
  ne les voient.
- Les garde-fous vivent dans le code du serveur, pas dans un prompt : une injection de prompt ne
  peut pas les contourner.

## Ce que le serveur fait et ne fait pas

Le serveur **stocke et publie** des textes. Il ne **génère** aucun texte (AGENTS.md §2.6). La
rédaction se fait dans la conversation, et chaque publication est confirmée par l'humain dans
Claude (outil marqué `destructiveHint`, à régler sur « Demander » dans les réglages du connecteur).

Pour la catégorie `affaires`, la confirmation dans Claude ne suffit pas : le post doit avoir été
approuvé dans `/admin/social` (statut `APPROVED`). C'est le seul garde-fou humain que Claude ne
peut pas déclencher lui-même, réservé au sujet le plus exposé (RGPD art. 10, présomption
d'innocence).

## Outils

| Outil                     | Annotations              | Rôle                                                                    |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `social_verifier_comptes` | lecture seule            | Teste les identifiants X et Bluesky et renvoie un diagnostic par réseau |
| `social_creer_brouillon`  | écriture                 | Enregistre un brouillon (`PENDING_REVIEW`) avec un texte par réseau     |
| `social_lister`           | lecture seule            | Liste les brouillons et les posts récents                               |
| `social_publier`          | destructif, monde ouvert | Publie un brouillon sur X, Bluesky ou les deux                          |
| `social_rejeter`          | écriture                 | Passe un brouillon en `REJECTED`                                        |

Garde-fous de `social_publier` :

- coupe-circuit `SOCIAL_AUTO_POST=false` ;
- plafond quotidien par réseau `SOCIAL_DAILY_CAP` (6 par défaut) ;
- `affaires` exige le statut `APPROVED` ;
- pas de republication sur un réseau où le post est déjà parti (réessai possible sur l'autre) ;
- X : refus des URL dans le texte, un post avec lien coûte 0,20 $ contre 0,015 $ ;
- longueurs : 300 graphèmes sur Bluesky, `SOCIAL_X_MAX_CHARS` sur X (280 par défaut, à relever
  si le compte X passe Premium).

## Diagnostic d'erreurs

Chaque échec renvoie `{ reseau, code, message, action, reessayable }`, enregistré aussi dans
`SocialPost.error` et visible dans `/admin/social`.

| Code                       | Cause typique                                     | Action indiquée                                               |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `MISSING_CONFIG`           | Variable d'environnement absente                  | Ajouter la variable sur Vercel                                |
| `INVALID_CREDENTIALS`      | X 401, Bluesky « Invalid identifier or password » | Régénérer les clés X ou le mot de passe d'application Bluesky |
| `INSUFFICIENT_PERMISSIONS` | App X en lecture seule, accès non autorisé        | Passer l'app en Read and Write puis régénérer l'access token  |
| `CREDITS_DEPLETED`         | X 402 `credits-depleted`                          | Recharger les crédits dans la console développeur X           |
| `RATE_LIMITED`             | 429                                               | Attendre l'heure indiquée                                     |
| `DUPLICATE_CONTENT`        | X refuse un texte identique                       | Reformuler                                                    |
| `CONTENT_REJECTED`         | Texte trop long, requête invalide                 | Corriger le texte                                             |
| `ACCOUNT_SUSPENDED`        | Compte suspendu ou désactivé                      | Vérifier le compte sur le réseau                              |
| `PROVIDER_UNAVAILABLE`     | 5xx                                               | Réessayer plus tard                                           |
| `NETWORK_ERROR`            | Délai dépassé, DNS                                | Réessayer plus tard                                           |
| `UNKNOWN`                  | Autre                                             | Voir le détail brut joint                                     |

## Authentification

OAuth 2.1 à compte unique, servi par l'app :

- découverte : `/.well-known/oauth-protected-resource/api/mcp/social` (RFC 9728) et
  `/.well-known/oauth-authorization-server` (RFC 8414) ;
- identification du client par Client ID Metadata Document (CIMD), sans enregistrement
  dynamique. Seuls les `client_id` hébergés sur `MCP_OAUTH_CLIENT_HOSTS` (par défaut
  `claude.ai,claude.com`) sont acceptés, ce qui borne aussi la requête sortante (SSRF) ;
- consentement sur `/admin/oauth/autoriser`, derrière la session admin existante ;
- PKCE S256 obligatoire, codes à usage unique (5 min) et jetons de rafraîchissement tournants
  (30 jours) dans Upstash Redis, réutilisation détectée par famille ;
- jetons d'accès signés HMAC (1 h), audience liée à l'URL du serveur.

Révoquer tout accès : changer `MCP_OAUTH_SECRET` (invalide les jetons d'accès) et
`MCP_OAUTH_EPOCH` (invalide aussi les jetons de rafraîchissement).

## Variables d'environnement

| Variable                                                                                       | Rôle                                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `MCP_OAUTH_SECRET`                                                                             | Clé HMAC des jetons d'accès, 32 octets minimum        |
| `MCP_OAUTH_EPOCH`                                                                              | Entier, à incrémenter pour révoquer tous les jetons   |
| `MCP_OAUTH_CLIENT_HOSTS`                                                                       | Hôtes autorisés pour les `client_id` CIMD (optionnel) |
| `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` | Clés OAuth 1.0a de l'app X (Read and Write)           |
| `TWITTER_HANDLE`                                                                               | Compte X (défaut `poligraph_fr`)                      |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`                                                       | Compte Bluesky et mot de passe d'application          |
| `SOCIAL_AUTO_POST`                                                                             | `false` coupe toute publication                       |
| `SOCIAL_DAILY_CAP`                                                                             | Plafond quotidien par réseau (défaut 6)               |
| `SOCIAL_X_MAX_CHARS`                                                                           | Longueur maximale sur X (défaut 280)                  |

Redis : les identifiants Upstash déjà utilisés par le rate limiting.

## Mise en route

1. Ajouter les variables ci-dessus sur Vercel (Production), puis déployer.
2. Dans Claude : **Personnaliser > Connecteurs > Ajouter > Personnalisé > Web**, URL
   `https://poligraph.fr/api/mcp/social`, authentification « Se connecter maintenant ».
3. Se connecter à l'admin si demandé, puis autoriser sur l'écran de consentement.
4. Dans les réglages du connecteur, mettre `social_publier` sur « Demander ».
5. Demander à Claude : « vérifie les comptes sociaux ». Les deux réseaux doivent répondre `ok`.
