import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <div className="text-sm text-muted-foreground mb-4">
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-3/4 mb-2" />
      <Skeleton className="h-5 w-1/2 mb-6" />
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
