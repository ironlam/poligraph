import { permanentRedirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    chamber?: string;
  }>;
}

export default async function VoteStatsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const chamber = params.chamber;
  const url = chamber ? `/statistiques?tab=votes&chamber=${chamber}` : "/statistiques?tab=votes";
  // 308, not 307: the vote stats moved to /statistiques for good. A temporary
  // redirect tells Google to keep the old URL in the index, which is how these
  // land in the "Page avec redirection" bucket instead of consolidating.
  permanentRedirect(url);
}
