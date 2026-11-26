import { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Landmark,
  Vote,
  Users,
  Hand,
  ArrowUp,
  FileCheck,
  Shield,
  UserCheck,
  Scale,
  MessageCircleQuestion,
} from "lucide-react";
import { FAQJsonLd } from "@/components/seo/JsonLd";
import { ROUTES } from "@/config/routes";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const metadata: Metadata = {
  title: "Assemblée nationale : fonctionnement et votes",
  description:
    "Comprendre le fonctionnement de l'Assemblée nationale : types de votes, rôle du président de séance, délégation de vote et réalité de l'absentéisme parlementaire.",
  alternates: { canonical: "/institutions/assemblee-nationale" },
};

const KEY_NUMBERS = [
  { label: "Députés", value: "577", color: "#0066CC" },
  { label: "Groupes politiques", value: "8", color: "#6B21A8" },
  { label: "Commissions permanentes", value: "8", color: "#0D9488" },
  { label: "Ans de législature", value: "5", color: "#DC2626" },
];

const VOTE_TYPES = [
  {
    name: "Vote à main levée",
    icon: <Hand className="h-5 w-5" />,
    color: "#059669",
    description:
      "Le mode le plus courant. Le président de séance évalue visuellement la majorité. Rapide, mais aucune trace individuelle n'est conservée.",
    frequency: "~80% des votes",
    recorded: false,
  },
  {
    name: "Vote par assis et levé",
    icon: <ArrowUp className="h-5 w-5" />,
    color: "#0D9488",
    description:
      "Utilisé quand le résultat du vote à main levée est contesté. Les députés se lèvent successivement pour et contre. Toujours pas de trace individuelle.",
    frequency: "Rare",
    recorded: false,
  },
  {
    name: "Scrutin public ordinaire",
    icon: <Vote className="h-5 w-5" />,
    color: "#0066CC",
    description:
      "Demandé par un groupe parlementaire ou la conférence des présidents. Chaque député vote individuellement via un boîtier électronique. Seuls les présents ou ayant délégué leur vote sont comptés.",
    frequency: "~200-300 par session",
    recorded: true,
  },
  {
    name: "Scrutin solennel",
    icon: <FileCheck className="h-5 w-5" />,
    color: "#DC2626",
    description:
      "Réservé aux textes majeurs : budget, motion de censure, révision constitutionnelle. Tous les 577 députés sont appelés à voter individuellement à la tribune.",
    frequency: "~10-15 par an",
    recorded: true,
  },
];

export default function AssembleeNationalePage() {
  return (
    <>
      <FAQJsonLd
        questions={[
          {
            question: "Pourquoi seulement 70 votants sur 577 députés lors d'un scrutin ?",
            answer:
              "Lors d'un scrutin public ordinaire, seuls les députés physiquement présents dans l'hémicycle (ou ayant donné une délégation de vote) sont comptabilisés. La plupart des scrutins ont lieu en semaine, souvent en soirée, sur des textes techniques examinés en commission au préalable. Les députés non présents ne sont ni « pour », ni « contre », ni « abstention » : ils sont simplement non-votants.",
          },
          {
            question: "Pourquoi le président de l'Assemblée nationale ne vote-t-il pas ?",
            answer:
              "Par tradition républicaine (convention de non-vote), le président de l'Assemblée nationale ne participe pas aux votes. Cette convention garantit son impartialité dans la conduite des débats. Il ne vote qu'en cas d'égalité parfaite des voix, où sa voix est alors prépondérante.",
          },
          {
            question: "Comment fonctionne la délégation de vote à l'Assemblée nationale ?",
            answer:
              "Un député empêché peut confier son vote à un collègue, dans des conditions encadrées par la Constitution (article 27). Un député ne peut recevoir qu'une seule délégation. Elle est personnelle, nominative et valable pour un scrutin précis ou pour une durée limitée (8 jours maximum). Les cas autorisés incluent la maladie, une mission du Gouvernement ou un cas de force majeure.",
          },
        ]}
      />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-4xl">
        <Breadcrumb
          items={[
            { label: "Institutions", href: "/institutions" },
            { label: "Assemblée nationale" },
          ]}
        />

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: "#0066CC15" }}>
              <Landmark className="h-8 w-8" style={{ color: "#0066CC" }} />
            </div>
            <div>
              <h1 className="text-3xl font-display font-extrabold tracking-tight">
                L&apos;Assemblée nationale
              </h1>
              <p className="text-lg text-muted-foreground">577 députés, comment ça fonctionne ?</p>
            </div>
          </div>
        </div>

        {/* Key Numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {KEY_NUMBERS.map((n) => (
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

        {/* Section 1: Types de vote */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Vote className="h-6 w-6" style={{ color: "#0066CC" }} />
            Les types de vote
          </h2>
          <p className="text-muted-foreground mb-6">
            Tous les votes ne se ressemblent pas. La plupart ne laissent aucune trace individuelle,
            ce qui explique pourquoi seule une minorité de scrutins apparaît dans nos données.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {VOTE_TYPES.map((vote) => (
              <Card key={vote.name} className="h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: `${vote.color}15` }}
                      >
                        <span style={{ color: vote.color }}>{vote.icon}</span>
                      </div>
                      <CardTitle className="text-lg">{vote.name}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{vote.description}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs">
                      {vote.frequency}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: vote.recorded ? "#059669" : "#9CA3AF",
                        color: vote.recorded ? "#059669" : "#9CA3AF",
                      }}
                    >
                      {vote.recorded ? "Vote nominatif" : "Pas de trace individuelle"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Encadré explicatif */}
          <Card className="mt-6 border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <MessageCircleQuestion
                  className="h-6 w-6 shrink-0 mt-0.5"
                  style={{ color: "#0066CC" }}
                />
                <div>
                  <h3 className="font-semibold mb-2">Pourquoi seulement 70 votants sur 577 ?</h3>
                  <p className="text-sm text-muted-foreground">
                    Lors d&apos;un <strong>scrutin public ordinaire</strong>, seuls les députés
                    physiquement présents dans l&apos;hémicycle (ou ayant donné une délégation de
                    vote) sont comptabilisés. La plupart des scrutins ont lieu en semaine, souvent
                    en soirée, sur des textes techniques examinés en commission au préalable. Les
                    députés non présents ne sont ni &quot;pour&quot;, ni &quot;contre&quot;, ni
                    &quot;abstention&quot; : ils sont simplement <strong>non-votants</strong>.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Ce n&apos;est que lors des <strong>scrutins solennels</strong> (budget, motion
                    de censure) que la quasi-totalité des 577 députés vote.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 2: Président de séance */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Shield className="h-6 w-6" style={{ color: "#0066CC" }} />
            Le rôle du président de séance
          </h2>
          <p className="text-muted-foreground mb-6">
            Le président de l&apos;Assemblée nationale (ou un vice-président qui le supplée) préside
            les débats et dirige les votes.
          </p>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-1">La convention de non-vote</h3>
                <p className="text-sm text-muted-foreground">
                  Par tradition républicaine, le président de l&apos;Assemblée nationale ne
                  participe pas aux votes. Cette convention garantit son impartialité dans la
                  conduite des débats. Il ne vote qu&apos;en cas d&apos;égalité parfaite des voix,
                  où sa voix est alors <strong>prépondérante</strong>.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Sur Poligraph</h3>
                <p className="text-sm text-muted-foreground">
                  Lorsqu&apos;un scrutin affiche le président de l&apos;Assemblée comme
                  &quot;non-votant&quot;, ce n&apos;est pas de l&apos;absentéisme : c&apos;est
                  l&apos;application de cette convention. Nous contextualisons cette information
                  avec le label &quot;Non-votant (président de séance)&quot;.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 3: Délégation de vote */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <UserCheck className="h-6 w-6" style={{ color: "#0066CC" }} />
            La délégation de vote
          </h2>
          <p className="text-muted-foreground mb-6">
            Un député empêché peut confier son vote à un collègue, dans des conditions encadrées par
            la Constitution (article 27).
          </p>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Règles</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Un député ne peut recevoir qu&apos;une seule délégation</li>
                  <li>
                    La délégation est personnelle et nominative (le délégataire vote au nom du
                    délégant)
                  </li>
                  <li>
                    Elle est valable pour un scrutin précis ou pour une durée limitée (8 jours
                    maximum, sauf cas particuliers)
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Cas autorisés</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Maladie ou accident</li>
                  <li>Mission confiée par le Gouvernement</li>
                  <li>Service national ou force majeure</li>
                  <li>
                    Session extraordinaire d&apos;une autre assemblée (pour les cumulants avant
                    2017)
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Conséquence sur les chiffres</h3>
                <p className="text-sm text-muted-foreground">
                  Un député ayant reçu une délégation compte pour deux voix dans le décompte.
                  C&apos;est pourquoi le total des voix exprimées peut dépasser le nombre de députés
                  physiquement présents.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 4: Absentéisme */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Users className="h-6 w-6" style={{ color: "#0066CC" }} />
            L&apos;absentéisme, mythe et réalité
          </h2>
          <p className="text-muted-foreground mb-6">
            L&apos;image du député absent de l&apos;hémicycle est trompeuse. Le travail
            parlementaire ne se résume pas aux séances publiques.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Le travail en commission</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Les 8 commissions permanentes sont le cœur du travail législatif. C&apos;est là
                  que les textes sont examinés article par article, amendés et débattus en détail.
                  Un député peut siéger en commission pendant qu&apos;un vote a lieu dans
                  l&apos;hémicycle.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Le travail en circonscription</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Les députés passent environ la moitié de leur temps en circonscription :
                  permanences, rencontres avec les élus locaux, entreprises, associations. Ce
                  travail de terrain est essentiel mais invisible dans les statistiques de présence.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Auditions et missions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Commissions d&apos;enquête, missions d&apos;information, groupes d&apos;études,
                  auditions d&apos;experts... Ces activités ne sont pas comptabilisées dans la
                  présence en séance publique.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Mesurer la participation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Pour évaluer la participation d&apos;un député, il est plus pertinent de regarder
                  sa présence aux <strong>scrutins solennels</strong> (où tous sont appelés à voter)
                  que sa présence aux scrutins ordinaires de routine.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6 border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Scale className="h-6 w-6 shrink-0 mt-0.5" style={{ color: "#D97706" }} />
                <div>
                  <h3 className="font-semibold mb-2">Nuance importante</h3>
                  <p className="text-sm text-muted-foreground">
                    Cela ne signifie pas que l&apos;absentéisme n&apos;existe pas. Certains députés
                    ont une participation nettement plus faible que leurs collègues, y compris aux
                    scrutins solennels. Mais juger un député uniquement sur sa présence en
                    hémicycle, c&apos;est ignorer une grande partie de son travail.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* CTA */}
        <section>
          <Card className="bg-muted">
            <CardContent className="pt-6 text-center">
              <h2 className="text-xl font-bold mb-2">Explorez nos données</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Consultez les profils des députés, leurs votes et l&apos;activité de
                l&apos;Assemblée nationale.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  href="/politiques?mandate=depute"
                  className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
                >
                  Voir les députés
                </Link>
                <Link
                  href={ROUTES.assembleeNationale}
                  className="inline-flex items-center px-4 py-2 border rounded-md text-sm hover:bg-muted"
                >
                  Voir les votes de l&apos;Assemblée
                </Link>
                <Link
                  href="/institutions"
                  className="inline-flex items-center px-4 py-2 border rounded-md text-sm hover:bg-muted"
                >
                  Toutes les institutions
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
