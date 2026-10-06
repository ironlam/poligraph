import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DEPARTMENTS } from "@/config/departments";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";

interface MaireCardProps {
  maire: {
    fullName: string;
    slug: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    departmentCode: string;
    functionStart: Date | null;
    firstElectedDate: Date | null;
    mandateStart: Date | null;
    party: { shortName: string; color: string | null; slug: string | null } | null;
    commune: { name: string; departmentCode: string; population: number | null } | null;
  };
}

export function MaireCard({ maire }: MaireCardProps) {
  const startYear =
    maire.firstElectedDate?.getFullYear() ??
    maire.functionStart?.getFullYear() ??
    maire.mandateStart?.getFullYear();
  const deptName = DEPARTMENTS[maire.departmentCode]?.name;

  return (
    <Link href={`/politiques/${maire.slug}`} prefetch={false}>
      <Card className="h-full transition-all hover:shadow-sm hover:border-primary/50 hover:-translate-y-0.5 cursor-pointer">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            {maire.photoUrl && (
              <PoliticianAvatar
                photoUrl={maire.photoUrl}
                blobPhotoUrl={maire.blobPhotoUrl}
                fullName={maire.fullName}
                size="sm"
                className="shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="font-semibold leading-tight">{maire.fullName}</p>

              {maire.commune && (
                <p className="text-sm text-muted-foreground mt-0.5">{maire.commune.name}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {deptName && (
                  <Badge variant="outline" className="text-xs">
                    {deptName} ({maire.departmentCode})
                  </Badge>
                )}
                {maire.party && (
                  <Badge
                    variant="secondary"
                    className="text-xs"
                    style={{
                      backgroundColor: maire.party.color ? `${maire.party.color}20` : undefined,
                      color: maire.party.color || undefined,
                      borderColor: maire.party.color ? `${maire.party.color}40` : undefined,
                    }}
                  >
                    {maire.party.shortName}
                  </Badge>
                )}
              </div>

              {startYear && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <span>En poste depuis {startYear}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
