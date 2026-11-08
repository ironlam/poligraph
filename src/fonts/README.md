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

## Polices des images Open Graph (`og/`)

Satori, qui dessine les images `opengraph-image`, ne lit ni le WOFF2 ni une police variable. Le
dossier `og/` contient donc des instances TTF statiques dérivées des fichiers ci-dessus, chargées
par `src/lib/og/fonts.ts`. Une route qui les lit doit les déclarer dans `outputFileTracingIncludes`
(`next.config.ts`), sinon elles manquent à la fonction déployée.

Les tables `GPOS` et `GDEF` sont retirées. Satori applique le crénage au dessin d'un mot mais pas à
sa mesure : chaque paire crénée (« Vo », « L'A ») laissait une espace élargie après le mot.

Régénération (fonttools 4.68) :

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

def save(font, path):
    for table in ("GPOS", "GDEF"):
        if table in font:
            del font[table]
    font.flavor = None
    font.save(path)

for weight in (700, 800):
    variable = TTFont("src/fonts/Outfit-latin-variable.woff2")
    save(instantiateVariableFont(variable, {"wght": weight}), f"src/fonts/og/Outfit-latin-{weight}.ttf")
for weight in (400, 700):
    save(
        TTFont(f"src/fonts/AtkinsonHyperlegible-latin-{weight}.woff2"),
        f"src/fonts/og/AtkinsonHyperlegible-latin-{weight}.ttf",
    )
```
