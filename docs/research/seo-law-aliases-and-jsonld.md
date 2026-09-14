# Noms d’usage des lois et JSON-LD

## Décisions

Le titre enregistré par les sources parlementaires et le titre publié au Journal officiel restent
les références juridiques. Un nom d’usage est un alias éditorial, jamais un remplacement du titre
officiel. Il est publié seulement après validation humaine et avec une source conservée dans la
base. La page de l’alias est une porte d’entrée vers la page canonique du dossier, pas une seconde
page indexable.

Le modèle distingue quatre cas utiles à la revue : appellation médiatique, appellation courante,
forme courte officielle et appellation historique. Le statut `DRAFT` permet de préparer une
proposition sans l’exposer. Un seul alias publié peut être principal.

## Règles de validation éditoriale

Une appellation est acceptable si elle est attestée par une source institutionnelle ou plusieurs
sources journalistiques indépendantes, si elle identifie sans ambiguïté le dossier, et si elle ne
présente pas comme juridique une formule seulement médiatique. Le nom d’un auteur ou d’un rapporteur
ne suffit pas à établir un nom de loi.

L’intitulé officiel doit être conservé et affiché. Les sources doivent être des URL HTTPS
consultables, en privilégiant le Journal officiel via Légifrance, les dossiers de l’Assemblée
nationale ou du Sénat, puis les médias de référence autorisés par la politique éditoriale du projet.

Ces règles sont une politique éditoriale Poligraph, pas une prétention à l’existence d’un registre
juridique des « noms d’usage ». Les sources institutionnelles montrent qu’une même loi peut être
désignée par une formule dite ou couramment utilisée, mais l’intitulé juridique demeure celui du
texte publié.

## JSON-LD

Les composants utilisent le vocabulaire Schema.org avec `@context: https://schema.org`. Les fiches
politiques utilisent `Person`, les communes `GovernmentOrganization`, les jeux de données publiés
`Dataset`, et les dossiers `Legislation`. Les alias sont portés par `alternateName`, tandis que
`name` reste le titre officiel du dossier. Les URLs sont absolues et les chaînes sont sérialisées
par le composant JSON-LD central qui neutralise les balises de fermeture de script.

## Sources

- [Guide de légistique, fiche 3.1.3, Légifrance](https://www.legifrance.gouv.fr/contenu/Media/files/autour-de-la-loi/guide-de-legistique/2024_12_05_fiche_3.1.3_intitule_texte_0.pdf), sur l’intitulé des textes et la nécessité d’un intitulé clair, précis et concis.
- [Publications officielles, Légifrance](https://www.legifrance.gouv.fr/contenu/menu/publications-officielles), sur le Journal officiel comme source de publication des lois et actes.
- [Dossier du Sénat citant « dite loi Duplomb »](https://www.senat.fr/dossier-legislatif/ppl24-889.html), exemple institutionnel d’une appellation courante distincte de l’intitulé complet.
- [Schema.org Person](https://schema.org/Person), [GovernmentOrganization](https://schema.org/GovernmentOrganization), [Dataset](https://schema.org/Dataset), [Legislation](https://schema.org/Legislation) et [alternateName](https://schema.org/alternateName), pour les types et propriétés employés.
- [Google, données structurées](https://developers.google.com/search/docs/appearance/structured-data/intro), pour la distinction entre vocabulaire Schema.org et fonctionnalités de résultats enrichis. Schema.org valide le vocabulaire, mais ne garantit pas un rich result Google.
