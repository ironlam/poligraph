"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./CodeBlock";

const PYTHON_CODE = `import requests
import pandas as pd

# Option 1: télécharger l'export CSV complet (recommandé pour l'analyse)
df = pd.read_csv("https://poligraph.fr/api/export/affaires?limit=10000")
print(df.shape, df["severityCode"].value_counts())

# Option 2: pagination de l'API JSON (10 000 max par page)
rows, page = [], 1
while True:
    r = requests.get(
        "https://poligraph.fr/api/affaires",
        params={"limit": 100, "page": page, "involvement": "DIRECT,MENTIONED_ONLY"},
        timeout=30,
    ).json()
    rows.extend(r["data"])
    if page >= r["pagination"]["totalPages"]:
        break
    page += 1

print(f"Total: {len(rows)} affaires")
`;

const R_CODE = `library(readr)
library(dplyr)

# Option 1: télécharger l'export CSV complet (recommandé)
affaires <- read_csv("https://poligraph.fr/api/export/affaires?limit=10000")

# Affaires par parti et gravité
affaires |>
  count(partyCurrentLong, severity, sort = TRUE)

# Option 2: API JSON avec httr2 (pagination manuelle)
library(httr2)
library(purrr)

fetch_page <- function(page) {
  request("https://poligraph.fr/api/affaires") |>
    req_url_query(limit = 100, page = page, involvement = "DIRECT") |>
    req_perform() |>
    resp_body_json()
}

pages <- map(1:fetch_page(1)$pagination$totalPages, fetch_page)
affaires_json <- map_dfr(pages, "data")
`;

const CURL_CODE = `# Export CSV (recommandé pour récupérer tout en une fois)
curl -o affaires.csv "https://poligraph.fr/api/export/affaires?limit=50000"
curl -o politiques.csv "https://poligraph.fr/api/export/politiques?activeOnly=true"
curl -o factchecks.csv "https://poligraph.fr/api/export/factchecks?limit=10000"

# API JSON paginée
curl -s "https://poligraph.fr/api/affaires?limit=100&page=1" | jq '.pagination'
# → { "page": 1, "limit": 100, "total": 260, "totalPages": 3 }

# Résoudre un poligraphId vers la page canonique (suit le redirect 308)
curl -sL "https://poligraph.fr/id/AF-000042" -o /dev/null -w "%{url_effective}\\n"
`;

export function QuickstartTabs() {
  return (
    <Tabs defaultValue="python" className="w-full">
      <TabsList>
        <TabsTrigger value="python">Python</TabsTrigger>
        <TabsTrigger value="r">R</TabsTrigger>
        <TabsTrigger value="curl">curl</TabsTrigger>
      </TabsList>
      <TabsContent value="python" className="mt-4">
        <CodeBlock code={PYTHON_CODE} language="python" />
      </TabsContent>
      <TabsContent value="r" className="mt-4">
        <CodeBlock code={R_CODE} language="r" />
      </TabsContent>
      <TabsContent value="curl" className="mt-4">
        <CodeBlock code={CURL_CODE} language="bash" />
      </TabsContent>
    </Tabs>
  );
}
