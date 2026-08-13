import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CHAMBER_SHORT_LABELS } from "@/config/labels";
import { ROUTES } from "@/config/routes";
import { Users } from "lucide-react";
import type { GroupListingItem } from "@/lib/data/groupes";

interface GroupCardProps {
  group: GroupListingItem;
}

export function GroupCard({ group }: GroupCardProps) {
  const href = group.slug ? ROUTES.groupeDetail(group.slug) : "#";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <Link href={href} prefetch={false} className="block">
          <div className="flex items-center gap-3 mb-3">
            {group.color && (
              <span
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
                aria-hidden="true"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{group.name}</p>
              <p className="text-xs text-muted-foreground">{group.code}</p>
            </div>
            <Badge
              variant="outline"
              className={
                group.chamber === "AN" ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700"
              }
            >
              {CHAMBER_SHORT_LABELS[group.chamber]}
            </Badge>
          </div>

          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <Users className="h-3.5 w-3.5" />
            <span>
              {group.seatCount} membre{group.seatCount > 1 ? "s" : ""}
            </span>
          </div>

          {group.stats && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold">{Math.round(group.stats.cohesionPct)}%</p>
                <p className="text-xs text-muted-foreground">Cohésion</p>
              </div>
              <div>
                <p className="text-lg font-bold">
                  {Math.round(group.stats.governmentAlignmentPct)}%
                </p>
                <p className="text-xs text-muted-foreground">Concordance</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Indisponible</p>
                <p className="text-xs text-muted-foreground">Participation</p>
              </div>
            </div>
          )}
        </Link>
      </CardContent>
    </Card>
  );
}
