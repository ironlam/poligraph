import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HorizontalBars } from "./HorizontalBars";
import { MethodologyDisclaimer } from "./MethodologyDisclaimer";
import { ParliamentaryWorkCallout } from "./ParliamentaryWorkCallout";
import type { GroupDissidenceStats } from "@/services/voteStats";
import type { Chamber } from "@/generated/prisma";

interface ParticipationSectionProps {
  groupDissidenceAN: GroupDissidenceStats[];
  groupDissidenceSENAT: GroupDissidenceStats[];
  chamber?: Chamber;
}

function participationNotice(chamber?: Chamber): string {
  if (chamber === "SENAT") {
    return "La participation aux scrutins publics du Sénat reste indisponible pendant la validation de la complétude officielle et des identités reliées. Elle ne mesure jamais la présence physique.";
  }
  return "Les agrégats de participation ne sont pas publiés tant qu'ils ne peuvent pas être dérivés du même périmètre d'éligibilité que l'indicateur individuel.";
}

export function ParticipationSection({
  groupDissidenceAN,
  groupDissidenceSENAT,
  chamber,
}: ParticipationSectionProps) {
  return (
    <section aria-labelledby="participation-heading" className="py-8">
      <ParliamentaryWorkCallout />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle id="participation-heading">Participation aux scrutins publics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{participationNotice(chamber)}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Aucun classement, taux moyen ou taux par parti ou groupe n&apos;est affiché dans cet
            état.
          </p>
        </CardContent>
      </Card>

      {(groupDissidenceAN.length > 0 || groupDissidenceSENAT.length > 0) && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-1">Dissidence</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Fréquence à laquelle les membres d&apos;un groupe votent différemment de la majorité de
            leur groupe
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DissidenceCard
              title="Assemblée nationale"
              barsTitle="Dissidence par groupe AN"
              groups={groupDissidenceAN}
            />
            <DissidenceCard
              title="Sénat"
              barsTitle="Dissidence par groupe Sénat"
              groups={groupDissidenceSENAT}
            />
          </div>
        </div>
      )}

      <MethodologyDisclaimer
        details={
          <div className="space-y-3 text-sm">
            <p>
              Un taux individuel est publiable uniquement pour un mandat courant de député, avec une
              méthode supportée et au moins un scrutin éligible.
            </p>
            <p>
              Pour le Sénat, les positions pour, contre et abstention alimentent le numérateur. Le
              dénominateur ajoute NON_VOTANT, uniquement sur les scrutins dont la liste nominative
              est officiellement complète et pendant le mandat. NON_VOTANT signifie « n&apos;a pas
              pris part au vote », pas une absence physique.
            </p>
          </div>
        }
      >
        Les agrégats restent indisponibles jusqu&apos;à leur calcul à partir du même modèle
        d&apos;éligibilité individuel.
      </MethodologyDisclaimer>
    </section>
  );
}

function DissidenceCard({
  title,
  barsTitle,
  groups,
}: {
  title: string;
  barsTitle: string;
  groups: GroupDissidenceStats[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length > 0 ? (
          <HorizontalBars
            title={barsTitle}
            maxValue={100}
            bars={groups.map((group) => ({
              label: group.groupCode,
              value: group.avgDissidenceRate,
              color: group.groupColor || undefined,
              suffix: "%",
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Aucune donnée</p>
        )}
      </CardContent>
    </Card>
  );
}
