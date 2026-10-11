"use client";

import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MapDepartmentData } from "@/app/api/carte/route";
import { getDepartmentSlug } from "@/config/departments";
import { territoireDepartementPath } from "@/lib/territoires/paths";

interface MapSidebarProps {
  department: MapDepartmentData;
  onClose: () => void;
}

export function MapSidebar({ department, onClose }: MapSidebarProps) {
  const deptSlug = getDepartmentSlug(department.name);

  return (
    <Card className="w-full md:w-80 h-full md:h-auto border-l-0 md:border-l rounded-l-none md:rounded-l-lg">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg">{department.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{department.region}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-muted rounded-lg p-2">
            <div className="text-2xl font-bold">{department.totalSeats}</div>
            <div className="text-xs text-muted-foreground">Sièges</div>
          </div>
          {department.winningParty && (
            <div className="bg-muted rounded-lg p-2 flex flex-col items-center justify-center">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: department.winningParty.color || "#888" }}
                />
                <span className="text-sm font-bold" title={department.winningParty.name}>
                  {department.winningParty.shortName}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">Parti gagnant</div>
            </div>
          )}
        </div>

        {/* All parties sorted by seats */}
        {department.parties.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Répartition par parti</h4>
            <div className="flex flex-wrap gap-1">
              {department.parties.map((party) => (
                <Badge
                  key={party.id}
                  variant="outline"
                  className="text-xs"
                  title={`${party.name} — ${party.totalVotes.toLocaleString("fr-FR")} votes`}
                  style={{
                    borderColor: party.color || undefined,
                    backgroundColor: party.color ? `${party.color}20` : undefined,
                  }}
                >
                  {party.shortName}: {party.seats} siège{party.seats > 1 ? "s" : ""}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Action button */}
        <Button asChild className="w-full">
          <Link href={territoireDepartementPath(deptSlug)}>
            Voir le département
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
