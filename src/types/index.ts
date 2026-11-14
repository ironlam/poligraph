import type {
  Politician,
  Party,
  Mandate,
  Affair,
  AffairEvent,
  Source,
  Declaration,
  ExternalId,
  Scrutin,
  Vote,
  FactCheck,
  FactCheckMention,
  Election,
  Candidacy,
  ElectionRound,
  AffairStatus,
  JurisdictionOrder,
  AffairCategory,
  AffairSeverity,
  Involvement,
  AffairEventType,
  EventOutcome,
  EventSourceKind,
  MandateType,
  DataSource,
  PoliticalPosition,
  VotePosition,
  VotingResult,
  Chamber,
  FactCheckRating,
  PartyRole,
  ThemeCategory,
  ScrutinType,
  ElectionType,
  ElectionScope,
  SuffrageType,
  ElectionStatus,
  SourceType,
  PublicationStatus,
  PlatformUpdateType,
  GroupPosition,
  AnalysisSourceType,
  ThematicAxis,
  QuizElectionScope,
  ProfessionDeFoiSource,
  PromiseSourceKind,
  PromiseExtractionStatus,
  CandidacyStatus,
} from "@/generated/prisma";

// Compare types
export * from "./compare";

// Activity feed types (watchlist)
export * from "./activity";

// Legislation types
export * from "./legislation";

// Re-export Prisma types
export type {
  Politician,
  Party,
  Mandate,
  Affair,
  AffairEvent,
  Source,
  Declaration,
  ExternalId,
  Scrutin,
  Vote,
  FactCheck,
  FactCheckMention,
  Election,
  Candidacy,
  ElectionRound,
  AffairStatus,
  JurisdictionOrder,
  AffairCategory,
  AffairSeverity,
  Involvement,
  AffairEventType,
  EventOutcome,
  EventSourceKind,
  MandateType,
  DataSource,
  PoliticalPosition,
  VotePosition,
  VotingResult,
  Chamber,
  FactCheckRating,
  PartyRole,
  ThemeCategory,
  ScrutinType,
  ElectionType,
  ElectionScope,
  SuffrageType,
  ElectionStatus,
  SourceType,
  PublicationStatus,
  PlatformUpdateType,
  GroupPosition,
  AnalysisSourceType,
  ThematicAxis,
  QuizElectionScope,
  ProfessionDeFoiSource,
  PromiseSourceKind,
  PromiseExtractionStatus,
  CandidacyStatus,
};

// Serialized types (for client components)
export type SerializedMandate = Mandate;

export type SerializedAffair = Omit<Affair, "fineAmount"> & {
  fineAmount: number | null;
};

export type SerializedAffairWithSources = SerializedAffair & {
  sources: Source[];
  events?: AffairEvent[];
};

// Extended types with relations
export type PoliticianWithParty = Politician & {
  currentParty: Party | null;
};

export type PoliticianWithPartyAndCounts = Politician & {
  currentParty: Party | null;
  _count: {
    affairs: number;
  };
  hasConviction?: boolean; // legacy — use hasCritiqueAffair
  hasCritiqueAffair?: boolean;
  hasPoliticalFinancingConviction?: boolean;
  isDeceased?: boolean;
  /** True if active parliamentarian with no published DI */
  missingDeclaration?: boolean;
  // Current mandate info (for display on cards)
  currentMandate?: {
    type: MandateType;
    title: string;
    constituency: string | null;
  } | null;
  // Significant party role (for display when no current mandate)
  significantPartyRole?: {
    role: PartyRole;
    partyName: string;
    partyShortName: string;
  } | null;
};
export type PoliticianFull = Politician & {
  currentParty: Party | null;
  mandates: Mandate[];
  affairs: AffairWithSources[];
  declarations: Declaration[];
};

export type AffairWithSources = Affair & {
  sources: Source[];
  events?: AffairEvent[];
};
// Search and filter types
export type PoliticianFilters = {
  search?: string;
  partyId?: string;
  mandateType?: MandateType;
  hasAffairs?: boolean;
  publicationStatus?: PublicationStatus;
  page?: number;
  limit?: number;
  sortBy?: "name" | "prominence";
};
// API response types
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
