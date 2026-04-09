/**
 * Public identifier (poligraphId) module.
 *
 * Exposes helpers for allocating, parsing, formatting, and resolving the
 * stable public identifiers that Poligraph assigns to every citable entity.
 *
 * See /docs/api (section "poligraphId") for the user-facing specification.
 */

export {
  PUBLIC_ID_ENTITIES,
  PREFIX_TO_ENTITY,
  type PublicIdEntityType,
  type PublicIdPrefix,
  type PublicIdMapping,
} from "./types";

export {
  parsePublicId,
  formatPublicId,
  formatPublicIdForEntity,
  isValidPublicId,
  type ParsedPublicId,
} from "./format";

export { nextPublicId } from "./generator";

export { resolvePublicId, type ResolvedPublicId } from "./resolver";
