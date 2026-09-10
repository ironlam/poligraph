import { inngest } from "../client";

/**
 * Vague hebdomadaire de découverte d'affaires par recherche web.
 *
 * Cadencée sur deux contraintes, pas une seule. Le budget Brave d'abord :
 * l'abonnement offre 5 $ de crédits par mois, soit 1 000 requêtes, et une
 * requête égale un politicien. La capacité de modération ensuite, qui est la
 * vraie limite : mesuré sur les maires, environ 8 brouillons pour 100 élus
 * cherchés, chacun réclamant un arbitrage éditorial humain.
 *
 * Lundi 03:30 Paris, avant `sync:daily` (04:00) et le preflight de modération
 * (04:30) : les brouillons nés dans la nuit sont repris par le preflight du
 * matin même et arrivent en session avec leur recommandation déjà calculée.
 */

/** Requêtes par vague. 4 vagues tiennent dans l'enveloppe mensuelle offerte. */
const WAVE_SIZE = 250;

/**
 * Politiciens par étape durable.
 *
 * Le jugement IA est séquentiel et domine le temps de la passe. Découper évite
 * qu'une vague entière tienne dans une seule invocation, et une étape qui
 * échoue est rejouée sans refaire les précédentes : sur une passe qui dépense
 * des crédits payants, tout rejouer coûterait deux fois.
 */
const CHUNK_SIZE = 50;

/**
 * Plafond mensuel, aligné sur les crédits offerts.
 *
 * Dépasser ne casse rien, ça se facture. La garde existe pour que le
 * dépassement soit une décision et non un effet de bord d'un mois à cinq lundis.
 */
const MONTHLY_BUDGET = 1000;

/**
 * Combien chercher cette semaine, compte tenu du déjà dépensé.
 *
 * Extrait et exporté pour être testable : c'est la seule arithmétique de la
 * fonction, et une erreur de borne s'y traduirait en dépassement facturé ou en
 * vague muette.
 */
export function remainingWaveSize(
  spentThisMonth: number,
  waveSize = WAVE_SIZE,
  monthlyBudget = MONTHLY_BUDGET
): number {
  return Math.max(0, Math.min(waveSize, monthlyBudget - spentThisMonth));
}

export const discoverAffairsWebWave = inngest.createFunction(
  {
    id: "discover-affairs-web-wave",
    name: "Découverte d'affaires par recherche web (hebdomadaire)",
    retries: 1,
    // Deux vagues simultanées dépenseraient le budget en double et
    // estampilleraient les mêmes élus.
    concurrency: { limit: 1, key: '"discover-affairs-web"' },
  },
  { cron: "TZ=Europe/Paris 30 3 * * 1" },
  async ({ step }) => {
    const budget = await step.run("compute-budget", async () => {
      const { countSearchesThisMonth } = await import("@/lib/affair-discovery/search-priority");
      const spent = await countSearchesThisMonth();
      return { spent, remaining: remainingWaveSize(spent) };
    });

    if (budget.remaining === 0) {
      return { skipped: "enveloppe mensuelle épuisée", spent: budget.spent };
    }

    const totals = {
      politiciansSearched: 0,
      affairsCreated: 0,
      resultsJudged: 0,
      quotaExhausted: false,
      errors: 0,
    };

    for (let done = 0; done < budget.remaining; done += CHUNK_SIZE) {
      const limit = Math.min(CHUNK_SIZE, budget.remaining - done);

      // Pas d'offset à passer : la passe estampille au fur et à mesure, et le
      // curseur de rotation renvoie les estampillés en fin de file. Chaque
      // étape reprend donc naturellement là où la précédente s'est arrêtée.
      const stats = await step.run(`wave-${done / CHUNK_SIZE}`, async () => {
        const { discoverAffairsWeb } = await import("@/services/sync/discover-affairs-web");
        return discoverAffairsWeb({ limit });
      });

      totals.politiciansSearched += stats.politiciansSearched;
      totals.affairsCreated += stats.affairsCreated;
      totals.resultsJudged += stats.resultsJudged;
      totals.errors += stats.errors.length;

      // Solde épuisé : continuer brûlerait des requêtes vouées au 402, et les
      // élus non cherchés ne sont pas estampillés, donc rien n'est perdu.
      if (stats.quotaExhausted) {
        totals.quotaExhausted = true;
        break;
      }
    }

    return totals;
  }
);
