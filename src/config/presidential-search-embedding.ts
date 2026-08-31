export const PRESIDENTIAL_SEARCH_EMBEDDING_MODEL = "mistral-embed";
export const PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS = 1024;
export const PRESIDENTIAL_SEARCH_EMBEDDING_MAX_CHARACTERS = 500;
export const PRESIDENTIAL_SEARCH_EMBEDDING_TAIL_CHARACTERS = 300;
export const PRESIDENTIAL_SEARCH_EMBEDDING_BATCH_SIZE = 16;
export const PRESIDENTIAL_SEARCH_EMBEDDING_VERSION = "presidential-search-v2";
// Calibrated through `search:evaluate -- --strategy=hybrid`. Keeping a floor is essential:
// pgvector always returns a nearest neighbour, even for a query unrelated to the corpus.
export const PRESIDENTIAL_SEARCH_SEMANTIC_MIN_SIMILARITY = 0.71;
export const PRESIDENTIAL_SEARCH_QUERY_TIMEOUT_MS = 2_500;
