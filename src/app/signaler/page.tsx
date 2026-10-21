import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackForm } from "./FeedbackForm";
import { sanitizePagePath } from "@/lib/feedback/page-path";

export const metadata: Metadata = {
  title: "Signaler une erreur ou donner un avis",
  description:
    "Une information semble fausse, un affichage pose problème, une idée vous vient : écrivez-nous, sans compte.",
  robots: { index: false, follow: true },
};

export default async function SignalerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { from } = await searchParams;
  const pagePath = sanitizePagePath(Array.isArray(from) ? from[0] : from);

  return (
    <main className="container mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-3 title-page">Signaler une erreur ou donner un avis</h1>
      <p className="mb-8 text-muted-foreground">
        Une information vous semble fausse, un affichage pose problème, une idée vous vient ?
        Dites-le nous ici, sans créer de compte. Chaque message est lu par l&apos;équipe.
      </p>

      <FeedbackForm pagePath={pagePath} />

      <p className="mt-8 text-sm text-muted-foreground">
        Pour un problème technique avec le serveur MCP, une vulnérabilité ou une question
        d&apos;ordre juridique, la page{" "}
        <Link href="/support" className="text-primary underline underline-offset-2">
          Support
        </Link>{" "}
        indique le bon canal.
      </p>
    </main>
  );
}
