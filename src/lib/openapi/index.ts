import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Poligraph API",
      version: "1.1.0",
      description: `
API publique pour accéder aux données des représentants politiques français.

## Endpoints disponibles

| Endpoint | Description |
|----------|-------------|
| \`/api/politiques\` | Liste des représentants politiques |
| \`/api/politiques/{slug}\` | Détails d'un représentant |
| \`/api/politiques/{slug}/affaires\` | Affaires judiciaires d'un représentant |
| \`/api/politiques/{slug}/votes\` | Votes parlementaires d'un représentant |
| \`/api/politiques/{slug}/relations\` | Relations d'un représentant |
| \`/api/affaires\` | Toutes les affaires judiciaires documentées |
| \`/api/votes\` | Liste des scrutins parlementaires |
| \`/api/partis\` | Liste des partis politiques |
| \`/api/partis/{slug}\` | Détails d'un parti politique |
| \`/api/mandats\` | Liste des mandats politiques |
| \`/api/elections\` | Liste des élections |
| \`/api/elections/{slug}\` | Détails d'une élection |

## Pagination

Les endpoints de liste supportent la pagination :
- \`page\` : Numéro de page (défaut: 1)
- \`limit\` : Éléments par page (défaut: 20, max: 100)

## Utilisation responsable

Merci de faire un usage raisonnable de l'API.
      `.trim(),
      contact: {
        name: "Poligraph",
        url: "https://poligraph.fr",
      },
      license: {
        name: "AGPL-3.0",
        url: "https://www.gnu.org/licenses/agpl-3.0.html",
      },
    },
    tags: [
      {
        name: "Politiques",
        description: "Représentants politiques français",
      },
      {
        name: "Partis",
        description: "Partis politiques français",
      },
      {
        name: "Mandats",
        description: "Mandats politiques (députés, sénateurs, ministres, etc.)",
      },
      {
        name: "Élections",
        description: "Élections et candidatures",
      },
      {
        name: "Élus locaux",
        description: "Élus locaux (maires, conseillers municipaux, etc.)",
      },
      {
        name: "Affaires",
        description: "Affaires judiciaires documentées avec sources",
      },
      {
        name: "Fact-checks",
        description: "Fact-checks des déclarations publiques",
      },
      {
        name: "Votes",
        description: "Votes parlementaires (scrutins publics)",
      },
      {
        name: "Relations",
        description: "Relations entre représentants politiques",
      },
      {
        name: "Exports",
        description: "Exports CSV en masse pour l'analyse statistique",
      },
    ],
  },
  apis: [
    "./src/lib/openapi/schemas.ts",
    "./src/app/api/politiques/route.ts",
    "./src/app/api/politiques/[[]slug[]]/route.ts",
    "./src/app/api/politiques/[[]slug[]]/affaires/route.ts",
    "./src/app/api/politiques/[[]slug[]]/votes/route.ts",
    "./src/app/api/politiques/[[]slug[]]/relations/route.ts",
    "./src/app/api/politiques/[[]slug[]]/factchecks/route.ts",
    "./src/app/api/affaires/route.ts",
    "./src/app/api/factchecks/route.ts",
    "./src/app/api/votes/route.ts",
    "./src/app/api/partis/route.ts",
    "./src/app/api/partis/[[]slug[]]/route.ts",
    "./src/app/api/mandats/route.ts",
    "./src/app/api/elections/route.ts",
    "./src/app/api/elections/[[]slug[]]/route.ts",
    "./src/app/api/export/affaires/route.ts",
    "./src/app/api/export/politiques/route.ts",
    "./src/app/api/export/factchecks/route.ts",
    "./src/app/api/export/votes/route.ts",
    "./src/app/api/v1/elus/route.ts",
    "./src/app/api/v1/elus/[[]id[]]/route.ts",
    "./src/app/api/v1/elus/search/route.ts",
    "./src/app/api/v1/communes/[[]codeInsee[]]/route.ts",
  ],
};

export const openapiSpec = swaggerJsdoc(options);
