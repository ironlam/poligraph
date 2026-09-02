import { getPublicPresidentialMeasureSlugByLegacyId } from "@/lib/data/presidential-measure-detail";
import { getPresidentialMeasurePath } from "@/lib/presidentielle/measure-route";

const ELECTION_SLUG = "presidentielle-2027";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slug = await getPublicPresidentialMeasureSlugByLegacyId(ELECTION_SLUG, id);
  if (slug === null) return new Response("Mesure introuvable", { status: 404 });
  return Response.redirect(new URL(getPresidentialMeasurePath(slug), request.url), 308);
}
