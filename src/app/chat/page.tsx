import { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChatInterface } from "@/components/chat/ChatInterface";
import {
  MessageSquare,
  ShieldCheck,
  Database,
  Sparkles,
  Search,
  Scale,
  Vote,
  FileText,
  Users,
  Newspaper,
} from "lucide-react";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { openGraph } from "@/lib/seo/open-graph";

export const revalidate = 300; // ISR: re-check feature flag every 5 minutes

export const metadata: Metadata = {
  title: "Assistant IA - Poligraph",
  description:
    "Posez vos questions sur les représentants politiques français, les votes parlementaires et les dossiers législatifs. Réponses basées sur des sources officielles.",
  alternates: { canonical: "/chat" },
  openGraph: openGraph({
    title: "Assistant IA - Poligraph",
    description: "Posez vos questions sur la politique française. Réponses sourcées et factuelles.",
  }),
};

const EXAMPLE_QUESTIONS = [
  "Mon député a-t-il voté la réforme des retraites ?",
  "Quels sénateurs ont des affaires judiciaires en cours ?",
  "Combien de députés compte le groupe Renaissance ?",
  "Quel est le taux de participation de Marine Le Pen ?",
];

const CAPABILITIES = [
  {
    icon: Users,
    title: "Profils politiques",
    description: "Parcours, mandats et affiliations de 1 000+ responsables politiques",
  },
  {
    icon: Vote,
    title: "Votes parlementaires",
    description: "10 000+ scrutins avec résumés en langage clair",
  },
  {
    icon: Scale,
    title: "Affaires judiciaires",
    description: "Suivi factuel avec présomption d'innocence systématique",
  },
  {
    icon: FileText,
    title: "Dossiers législatifs",
    description: "1 700+ textes de loi indexés et résumés",
  },
  {
    icon: Newspaper,
    title: "Revue de presse",
    description: "Articles de presse et fact-checks agrégés",
  },
  {
    icon: Search,
    title: "Recherche sémantique",
    description: "Trouvez l'information par question en langage naturel",
  },
];

export default async function ChatPage() {
  const chatEnabled = await isFeatureEnabled("CHATBOT_ENABLED");

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Sparkles className="w-4 h-4" />
          {chatEnabled ? "Bêta" : "Prochainement"}
        </div>
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-3">
          Assistant Poligraph
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Posez vos questions sur les représentants politiques français, leurs mandats, les votes
          parlementaires ou les dossiers législatifs en cours.
        </p>
      </div>

      {/* Features badges */}
      <div className="flex flex-wrap justify-center gap-4 mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database className="w-4 h-4 text-primary" />
          <span>Données officielles</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-green-600" />
          <span>Sources vérifiées</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span>Réponses factuelles</span>
        </div>
      </div>

      {chatEnabled ? (
        /* Active chat interface */
        <Card className="shadow-lg">
          <CardHeader className="border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold">Chat avec l&apos;assistant</h2>
                <p className="text-sm text-muted-foreground">
                  Alimenté par notre IA et base de données
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ChatInterface />
          </CardContent>
        </Card>
      ) : (
        /* Coming soon preview */
        <div className="space-y-6">
          {/* Preview card mimicking chat UI */}
          <Card className="shadow-lg overflow-hidden">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold">Chat avec l&apos;assistant</h2>
                  <p className="text-sm text-muted-foreground">
                    Alimenté par notre IA et base de données
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Coming soon message */}
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">L&apos;assistant arrive bientôt</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  Nous finalisons un assistant conversationnel qui vous permettra d&apos;interroger
                  nos données politiques en langage naturel, avec des réponses sourcées et
                  vérifiables.
                </p>

                {/* Example questions preview */}
                <div className="max-w-sm mx-auto space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Exemples de questions
                  </p>
                  {EXAMPLE_QUESTIONS.map((q, i) => (
                    <div
                      key={i}
                      className="text-sm text-left px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/10 text-muted-foreground"
                    >
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Capabilities grid */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-center">
              Ce que l&apos;assistant pourra faire
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CAPABILITIES.map((cap) => (
                <div key={cap.title} className="flex gap-3 p-4 rounded-lg border bg-card">
                  <cap.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{cap.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{cap.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Architecture note */}
          <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Architecture RAG</span> :
              l&apos;assistant s&apos;appuie sur une base de données vectorielle (embeddings) pour
              retrouver les informations pertinentes avant de formuler sa réponse. Aucune
              hallucination possible : les réponses sont ancrées dans nos données vérifiées.
            </p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-medium mb-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Nos engagements
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>
            • Les réponses sont basées uniquement sur notre base de données de sources officielles
          </li>
          <li>
            • Toute affaire judiciaire est accompagnée d&apos;un rappel de la présomption
            d&apos;innocence
          </li>
          <li>
            • L&apos;assistant refuse de répondre s&apos;il n&apos;a pas l&apos;information dans sa
            base
          </li>
          <li>• Aucune opinion politique n&apos;est exprimée, uniquement des faits</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          <a href="/sources" className="underline hover:text-foreground">
            En savoir plus sur nos sources et notre méthodologie
          </a>
        </p>
      </div>
    </div>
  );
}
