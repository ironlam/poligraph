import { createCommunesRoute } from "../../communes-route";

export const GET = createCommunesRoute({
  slug: "municipales-2014",
  // 2014 stored one Candidacy row per list, so the row count *is* the list count.
  listCounting: "rows",
});
