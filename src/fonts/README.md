# Polices

Ces fichiers sont dans le dépôt pour que `npm run build` n'ait pas besoin du réseau. Voir l'issue
#641 : une indisponibilité de Google Fonts faisait échouer une construction de production, donc un
déploiement.

Ce que ce choix ne change pas : `next/font/google` téléchargeait déjà ces mêmes fichiers pendant le
build puis les auto-hébergeait avec les ressources statiques. Les navigateurs des visiteurs
n'appelaient donc jamais Google Fonts, et ils ne le font pas davantage aujourd'hui.

## Provenance

Sous-ensemble `latin` uniquement, ce que déclarait `subsets: ["latin"]`.

| Fichier                                | Source                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| `Outfit-latin-variable.woff2`          | `fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtq.woff2` |
| `AtkinsonHyperlegible-latin-400.woff2` | `fonts.gstatic.com/s/atkinsonhyperlegible/v11/...`          |
| `AtkinsonHyperlegible-latin-700.woff2` | idem, graisse 700                                           |

Outfit est une police variable : Google sert un seul fichier pour tout l'axe de graisse et le
déclare deux fois, à 700 et à 800. D'où une seule ressource avec une plage de graisses dans
`layout.tsx`, là où Atkinson Hyperlegible demande un fichier par graisse.

## Licences

Les deux familles sont sous SIL Open Font License 1.1, texte intégral dans `Outfit-OFL.txt` et
`AtkinsonHyperlegible-OFL.txt`.

## Rafraîchir

Récupérer la feuille de style avec un agent utilisateur qui obtient du woff2, garder le bloc
`/* latin */`, télécharger l'URL qu'il porte :

```
curl -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Outfit:wght@700;800&display=swap"
```

Un agent utilisateur ancien renvoie du TTF, bien plus lourd, sans que rien ne le signale.
