export interface WatchlistPolitician {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  party: string | null;
  partyColor: string | null;
}

export interface WatchlistParty {
  slug: string;
  name: string;
  shortName: string | null;
  color: string | null;
  memberCount: number;
}

export interface ActivityItem {
  type: "vote" | "affair" | "party-update";
  date: string;
  politician: WatchlistPolitician | null;
  party: WatchlistParty | null;
  data: Record<string, unknown>;
}

export interface ActivityStats {
  votesCount: number;
  activeAffairsCount: number;
}

export interface ActivityResponse {
  activity: ActivityItem[];
  politicians: WatchlistPolitician[];
  parties: WatchlistParty[];
  stats: ActivityStats;
}
