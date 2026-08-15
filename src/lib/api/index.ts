/**
 * API module exports
 */

export { HTTPClient, HTTPError, httpClient, describeError } from "./http-client";
export type { HTTPClientOptions, HTTPResponse, RequestOptions } from "./http-client";

export {
  WikidataService,
  wikidataService,
  WIKIDATA_PROPS,
  WIKIDATA_ENTITIES,
  POLITICAL_POSITIONS,
} from "./wikidata";
export type {
  WikidataServiceOptions,
  WikidataSearchResult,
  WikidataEntity,
  WikidataClaims,
  WikidataClaim,
  WikidataPosition,
  WikidataPartyAffiliation,
} from "./wikidata";

export { RSSClient, rssClient, RSS_FEEDS } from "./rss";
export type { RSSFeedConfig, RSSItem, RSSFeed, RSSClientOptions } from "./rss";

export { searchClaims, mapTextualRating, fetchPageTitle } from "./factcheck";
export type {
  FactCheckClaim,
  FactCheckClaimReview,
  FactCheckSearchResponse,
  SearchClaimsOptions,
} from "./factcheck";
