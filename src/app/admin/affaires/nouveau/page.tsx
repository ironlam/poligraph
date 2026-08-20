import { AffairForm } from "@/components/admin/AffairForm";
interface PageProps {
  searchParams: Promise<{ politicianId?: string }>;
}

export default async function NewAffairPage({ searchParams }: PageProps) {
  const { politicianId } = await searchParams;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Nouvelle affaire judiciaire</h1>
      <AffairForm initialPoliticianId={politicianId} />
    </div>
  );
}
