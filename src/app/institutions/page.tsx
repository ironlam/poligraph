import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  Scale,
  Globe,
  MapPin,
  Vote,
  Landmark,
  Crown,
  Briefcase,
} from "lucide-react";

export const revalidate = 300; // ISR: re-check feature flag every 5 minutes

export const metadata: Metadata = {
  title: "Comprendre les Institutions",
  description: "Guide simple pour comprendre les institutions politiques françaises et européennes",
  alternates: { canonical: "/institutions" },
};

interface Institution {
  name: string;
  role: string;
  members: string;
  mandate: string;
  election: string;
  color: string;
  icon: React.ReactNode;
  link?: string;
}

const FRENCH_EXECUTIVE: Institution[] = [
  {
    name: "Président de la République",
    role: "Chef de l'État, garant des institutions, chef des armées",
    members: "1 personne",
    mandate: "5 ans (2 mandats max)",
    election: "Suffrage universel direct",
    color: "#000091",
    icon: <Crown className="h-5 w-5" />,
  },
  {
    name: "Premier ministre",
    role: "Chef du Gouvernement, dirige l'action du Gouvernement",
    members: "1 personne",
    mandate: "Durée variable",
    election: "Nommé par le Président",
    color: "#000091",
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    name: "Gouvernement",
    role: "Détermine et conduit la politique de la Nation",
    members: "~30-40 ministres",
    mandate: "Durée variable",
    election: "Nommés par le Président sur proposition du PM",
    color: "#000091",
    icon: <Building2 className="h-5 w-5" />,
    link: "/politiques?mandate=gouvernement",
  },
];

const FRENCH_LEGISLATIVE: Institution[] = [
  {
    name: "Assemblée nationale",
    role: "Vote les lois, contrôle le Gouvernement, peut le renverser",
    members: "577 députés",
    mandate: "5 ans",
    election: "Suffrage universel direct (circonscriptions)",
    color: "#0066CC",
    icon: <Landmark className="h-5 w-5" />,
    link: "/institutions/assemblee-nationale",
  },
  {
    name: "Sénat",
    role: "Vote les lois, représente les collectivités territoriales",
    members: "348 sénateurs",
    mandate: "6 ans (renouvelé par moitié tous les 3 ans)",
    election: "Suffrage universel indirect (grands électeurs)",
    color: "#8B0000",
    icon: <Users className="h-5 w-5" />,
    link: "/politiques?mandate=senateur",
  },
];

const LOCAL_INSTITUTIONS: Institution[] = [
  {
    name: "Conseils régionaux",
    role: "Gestion des lycées, transports régionaux, développement économique",
    members: "~1 750 conseillers",
    mandate: "6 ans",
    election: "Suffrage universel direct (listes régionales)",
    color: "#6B21A8",
    icon: <MapPin className="h-5 w-5" />,
  },
  {
    name: "Conseils départementaux",
    role: "Action sociale, collèges, routes départementales",
    members: "~4 000 conseillers",
    mandate: "6 ans",
    election: "Suffrage universel direct (cantons)",
    color: "#0D9488",
    icon: <MapPin className="h-5 w-5" />,
  },
  {
    name: "Conseils municipaux",
    role: "Gestion de la commune, urbanisme, écoles primaires",
    members: "~500 000 conseillers",
    mandate: "6 ans",
    election: "Suffrage universel direct",
    color: "#059669",
    icon: <Building2 className="h-5 w-5" />,
  },
];

const EU_INSTITUTIONS: Institution[] = [
  {
    name: "Parlement européen",
    role: "Vote les lois européennes, contrôle la Commission, vote le budget",
    members: "720 députés (81 français)",
    mandate: "5 ans",
    election: "Suffrage universel direct dans chaque État membre",
    color: "#003399",
    icon: <Globe className="h-5 w-5" />,
    link: "/politiques?mandate=depute_europeen",
  },
  {
    name: "Conseil de l'Union européenne",
    role: "Adopte les lois avec le Parlement, coordonne les politiques",
    members: "27 ministres (1 par État selon le sujet)",
    mandate: "Présidence tournante (6 mois)",
    election: "Ministres nationaux",
    color: "#003399",
    icon: <Users className="h-5 w-5" />,
  },
  {
    name: "Commission européenne",
    role: "Propose les lois, exécute le budget, gardienne des traités",
    members: "27 commissaires (1 par État)",
    mandate: "5 ans",
    election: "Proposée par les États, approuvée par le Parlement",
    color: "#003399",
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    name: "Conseil européen",
    role: "Définit les orientations politiques générales de l'UE",
    members: "27 chefs d'État ou de gouvernement",
    mandate: "Sommets réguliers",
    election: "Dirigeants nationaux",
    color: "#003399",
    icon: <Crown className="h-5 w-5" />,
  },
];

function InstitutionCard({ institution }: { institution: Institution }) {
  const content = (
    <Card className="h-full hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${institution.color}15` }}>
            <span style={{ color: institution.color }}>{institution.icon}</span>
          </div>
          <CardTitle className="text-lg">{institution.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{institution.role}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            {institution.members}
          </Badge>
          <Badge variant="outline" className="text-xs">
            Mandat : {institution.mandate}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>Élection :</strong> {institution.election}
        </p>
      </CardContent>
    </Card>
  );

  if (institution.link) {
    return (
      <Link href={institution.link} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

function ProcessDiagram() {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Vote className="h-5 w-5" />
          Comment une loi est-elle votée ?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center">
          <div className="flex-1 p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
            <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1">
              1. Projet de loi
            </div>
            <p className="text-xs text-muted-foreground">Gouvernement ou parlementaires</p>
          </div>
          <div className="text-2xl text-muted-foreground hidden md:block">→</div>
          <div className="text-2xl text-muted-foreground md:hidden">↓</div>
          <div className="flex-1 p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950">
            <div className="font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
              2. Assemblée nationale
            </div>
            <p className="text-xs text-muted-foreground">Examen et vote</p>
          </div>
          <div className="text-2xl text-muted-foreground hidden md:block">→</div>
          <div className="text-2xl text-muted-foreground md:hidden">↓</div>
          <div className="flex-1 p-4 rounded-lg bg-red-50 dark:bg-red-950">
            <div className="font-semibold text-red-700 dark:text-red-300 mb-1">3. Sénat</div>
            <p className="text-xs text-muted-foreground">Examen et vote</p>
          </div>
          <div className="text-2xl text-muted-foreground hidden md:block">→</div>
          <div className="text-2xl text-muted-foreground md:hidden">↓</div>
          <div className="flex-1 p-4 rounded-lg bg-green-50 dark:bg-green-950">
            <div className="font-semibold text-green-700 dark:text-green-300 mb-1">
              4. Promulgation
            </div>
            <p className="text-xs text-muted-foreground">Par le Président</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 text-center">
          En cas de désaccord, une commission mixte paritaire (7 députés + 7 sénateurs) tente de
          trouver un compromis. L&apos;Assemblée a le dernier mot.
        </p>
      </CardContent>
    </Card>
  );
}

function KeyNumbers() {
  const numbers = [
    { label: "Députés", value: "577", color: "#0066CC" },
    { label: "Sénateurs", value: "348", color: "#8B0000" },
    { label: "Eurodéputés FR", value: "81", color: "#003399" },
    { label: "Communes", value: "34 945", color: "#059669" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {numbers.map((n) => (
        <Card key={n.label} className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold mb-1" style={{ color: n.color }}>
              {n.value}
            </div>
            <div className="text-sm text-muted-foreground">{n.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function InstitutionsPage() {
  const [institutionsEnabled, governmentsEnabled] = await Promise.all([
    isFeatureEnabled("INSTITUTIONS_SECTION"),
    isFeatureEnabled("gouvernements"),
  ]);
  if (!institutionsEnabled) notFound();
  // The Government card points at the governments directory once that section is live.
  const executive = governmentsEnabled
    ? FRENCH_EXECUTIVE.map((inst) =>
        inst.name === "Gouvernement" ? { ...inst, link: "/politiques/gouvernements" } : inst
      )
    : FRENCH_EXECUTIVE;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-4">
          Comprendre les Institutions
        </h1>
        <p className="text-lg text-muted-foreground">
          Un guide simple pour comprendre comment fonctionnent nos institutions politiques, en
          France et en Europe.
        </p>
      </div>

      {/* Key Numbers */}
      <KeyNumbers />

      {/* Separation of Powers */}
      <Card className="mb-8 border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            La séparation des pouvoirs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            La démocratie française repose sur la séparation des trois pouvoirs, principe
            fondamental pour éviter les abus :
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-background border">
              <p className="font-semibold mb-1">Pouvoir exécutif</p>
              <p className="text-xs text-muted-foreground">
                Applique les lois. Président, Gouvernement.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-background border">
              <p className="font-semibold mb-1">Pouvoir législatif</p>
              <p className="text-xs text-muted-foreground">
                Vote les lois. Assemblée nationale, Sénat.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-background border">
              <p className="font-semibold mb-1">Pouvoir judiciaire</p>
              <p className="text-xs text-muted-foreground">Juge les litiges. Tribunaux, Cours.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* French Institutions - Executive */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Building2 className="h-6 w-6" style={{ color: "#000091" }} />
          Pouvoir exécutif
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {executive.map((inst) => (
            <InstitutionCard key={inst.name} institution={inst} />
          ))}
        </div>
      </section>

      {/* French Institutions - Legislative */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Landmark className="h-6 w-6" style={{ color: "#0066CC" }} />
          Pouvoir législatif
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {FRENCH_LEGISLATIVE.map((inst) => (
            <InstitutionCard key={inst.name} institution={inst} />
          ))}
        </div>
      </section>

      {/* Legislative Process */}
      <ProcessDiagram />

      {/* Local Institutions */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <MapPin className="h-6 w-6" style={{ color: "#059669" }} />
          Collectivités territoriales
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          La France est divisée en 18 régions, 101 départements et près de 35 000 communes. Chaque
          niveau a des compétences propres.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {LOCAL_INSTITUTIONS.map((inst) => (
            <InstitutionCard key={inst.name} institution={inst} />
          ))}
        </div>
      </section>

      {/* EU Institutions */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Globe className="h-6 w-6" style={{ color: "#003399" }} />
          Institutions européennes
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          L&apos;Union européenne compte 27 États membres. Ses institutions principales siègent à
          Bruxelles, Strasbourg et Luxembourg.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {EU_INSTITUTIONS.map((inst) => (
            <InstitutionCard key={inst.name} institution={inst} />
          ))}
        </div>
      </section>

      {/* EU Legislative Process */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            Le processus législatif européen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center">
            <div className="flex-1 p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1">
                1. Proposition
              </div>
              <p className="text-xs text-muted-foreground">Commission européenne</p>
            </div>
            <div className="text-2xl text-muted-foreground hidden md:block">→</div>
            <div className="text-2xl text-muted-foreground md:hidden">↓</div>
            <div className="flex-1 p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950">
              <div className="font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
                2. Parlement
              </div>
              <p className="text-xs text-muted-foreground">Amendements et vote</p>
            </div>
            <div className="text-2xl text-muted-foreground hidden md:block">→</div>
            <div className="text-2xl text-muted-foreground md:hidden">↓</div>
            <div className="flex-1 p-4 rounded-lg bg-purple-50 dark:bg-purple-950">
              <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">
                3. Conseil
              </div>
              <p className="text-xs text-muted-foreground">Vote des ministres</p>
            </div>
            <div className="text-2xl text-muted-foreground hidden md:block">→</div>
            <div className="text-2xl text-muted-foreground md:hidden">↓</div>
            <div className="flex-1 p-4 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="font-semibold text-green-700 dark:text-green-300 mb-1">
                4. Adoption
              </div>
              <p className="text-xs text-muted-foreground">Directive ou règlement</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            La plupart des lois européennes sont adoptées en &quot;codécision&quot; : le Parlement
            et le Conseil doivent tous deux approuver le texte.
          </p>
        </CardContent>
      </Card>

      {/* Glossary */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">Lexique</h2>
        <Card>
          <CardContent className="pt-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Suffrage universel direct</dt>
                <dd className="text-sm text-muted-foreground">
                  Tous les citoyens votent directement pour élire leurs représentants.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Suffrage universel indirect</dt>
                <dd className="text-sm text-muted-foreground">
                  Les citoyens élisent des &quot;grands électeurs&quot; qui votent ensuite.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Législature</dt>
                <dd className="text-sm text-muted-foreground">
                  Période de 5 ans durant laquelle siège une assemblée élue.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Motion de censure</dt>
                <dd className="text-sm text-muted-foreground">
                  Vote permettant à l&apos;Assemblée de renverser le Gouvernement.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Directive européenne</dt>
                <dd className="text-sm text-muted-foreground">
                  Loi européenne que chaque État doit transposer dans son droit national.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Règlement européen</dt>
                <dd className="text-sm text-muted-foreground">
                  Loi européenne directement applicable dans tous les États membres.
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {/* CTA */}
      <Card className="bg-muted">
        <CardContent className="pt-6 text-center">
          <h3 className="font-semibold mb-2">Explorez nos données</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Découvrez les profils de vos représentants : députés, sénateurs, ministres et
            eurodéputés.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/politiques"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              Voir tous les politiques
            </Link>
            <Link
              href="/sources"
              className="inline-flex items-center px-4 py-2 border rounded-md text-sm hover:bg-muted"
            >
              Notre méthodologie
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
