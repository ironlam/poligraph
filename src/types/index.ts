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
  AffairCategory,
  AffairSeverity,
  Involvement,
  AffairEventType,
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
  AffairCategory,
  AffairSeverity,
  Involvement,
  AffairEventType,
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

export type PoliticianWithMandates = Politician & {
  currentParty: Party | null;
  mandates: Mandate[];
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

export type AffairWithPolitician = Affair & {
  politician: PoliticianWithParty;
  sources: Source[];
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

export type AffairFilters = {
  search?: string;
  politicianId?: string;
  status?: AffairStatus;
  category?: AffairCategory;
  page?: number;
  limit?: number;
};

// API response types
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// Form input types (for validation)
export type CreateAffairInput = {
  politicianId: string;
  title: string;
  description: string;
  status: AffairStatus;
  category: AffairCategory;
  isRelatedToMandate?: boolean;
  factsDate?: Date;
  startDate?: Date;
  verdictDate?: Date;
  sentence?: string;
  // Judicial identifiers (multi-source matching)
  sources: {
    url: string;
    title: string;
    publisher: string;
    publishedAt: Date;
    sourceType?: SourceType;
  }[];
};

// Vote/Scrutin types
export type ScrutinWithVotes = Scrutin & {
  votes: (Vote & {
    politician: PoliticianWithParty;
  })[];
};

export type VoteWithScrutin = Vote & {
  scrutin: Scrutin;
};

export type PoliticianVoteStats = {
  total: number;
  pour: number;
  contre: number;
  abstention: number;
  nonVotant: number;
  absent: number;
  participationRate: number;
};

export type ScrutinFilters = {
  search?: string;
  result?: VotingResult;
  legislature?: number;
  chamber?: Chamber;
  theme?: ThemeCategory;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
};

export type ElectionFilters = {
  search?: string;
  type?: ElectionType;
  status?: ElectionStatus;
  page?: number;
  limit?: number;
};
