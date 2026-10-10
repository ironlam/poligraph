import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8" aria-busy="true">
      <span className="sr-only">Chargement des gouvernements</span>
      <Skeleton className="mb-3 h-9 w-64" />
      <div className="mb-6 flex max-w-2xl flex-col gap-2">
        <Skeleton className="h-3.5 w-[60%] rounded-lg" />
        <Skeleton className="h-3.5 w-[90%] rounded-lg" />
        <Skeleton className="h-3.5 w-[75%] rounded-lg" />
      </div>
      <div className="flex flex-col gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
