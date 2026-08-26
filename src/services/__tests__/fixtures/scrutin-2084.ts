/**
 * Real-data fixture for the regression test on scrutin VTANR5L17V7183
 * (amendment n°2084 de Mme Lechon, "loi d'urgence agricole").
 *
 * The production bug: the policy title correctly described the amendment
 * (transparency on cooperatives' revenue distribution), but the citizen impact
 * described a completely different measure (banning low-price agricultural
 * imports) inferred from the broad dossier summary, never from the amendment.
 *
 * Texts below are the PLAIN-TEXT (HTML-stripped) versions, i.e. what the
 * substance resolver emits as block.text.
 */

/** Official dispositif of amendment 2084 (Amendment.content, HTML stripped). */
export const AMENDMENT_2084_CONTENT = `I. – Après l'article L. 524-2-1 du code rural et de la pêche maritime, il est inséré un article L. 524-2-2 ainsi rédigé : « Art. L. 524-2-2. – Afin de renforcer la transparence de la formation et de la répartition de la valeur dans la chaîne agroalimentaire, les sociétés coopératives agricoles et leurs unions publient annuellement : « 1° Les résultats nets des filiales qu'elles contrôlent au sens de l'article L. 233-3 du code de commerce ; « 2° La part des résultats consolidés du groupe revenant à la coopérative ; « 3° La part des résultats effectivement redistribuée aux associés coopérateurs, sous forme de ristournes, de compléments de prix ou de toute autre rémunération ; « 4° Un indicateur synthétique du taux de redistribution de la valeur aux associés coopérateurs ; « 5° Les critères et modalités de détermination de cette redistribution. « 6° La part des résultats affectée aux réserves ainsi que les principaux flux financiers entre la coopérative et ses filiales. « Ces informations sont mises à disposition des associés coopérateurs dans des conditions garantissant leur lisibilité, leur sincérité et leur comparabilité. « Un décret en Conseil d'État précise les modalités d'application du présent article. »`;

/** Official exposé sommaire of amendment 2084 (Amendment.summary, HTML stripped). */
export const AMENDMENT_2084_SUMMARY = `Le présent projet de loi renforce la position des agriculteurs dans la chaîne de valeur, notamment en améliorant les mécanismes de formation des prix et de négociation. Dans cette perspective, la transparence constitue un levier essentiel. Le présent amendement vise donc à compléter les dispositifs existants en instaurant une publication claire, standardisée et accessible des résultats des filiales, des mécanismes de redistribution, des flux financiers intra-groupe et de la part des résultats affectée aux réserves.`;

/** Approved policy title for this scrutin (correct: describes the amendment). */
export const POLICY_TITLE_2084 = `Obliger les coopératives agricoles à publier la répartition de leurs revenus`;
export const POLICY_SUBTITLE_2084 = `Les coopératives devront rendre publics chaque année les résultats de leurs filiales, la part redistribuée aux agriculteurs et les flux financiers internes.`;

/** The BROAD dossier summary the buggy pipeline fed the model (not the amendment). */
export const DOSSIER_SUMMARY_BROAD = `- Propose de créer des mesures temporaires pour soutenir les agriculteurs face à des crises comme les aléas climatiques ou les fluctuations des prix.
- Contexte de tensions récurrentes dans le secteur agricole, avec des manifestations et des revendications sur les revenus et les normes.
- Concerne les agriculteurs, les coopératives agricoles, les distributeurs et les pouvoirs publics.`;

/** The stale/wrong scrutin.summary that also leaked into the prompt. */
export const SCRUTIN_SUMMARY_WRONG = `Les députés ont rejeté un amendement visant à renforcer les protections pour les agriculteurs face aux importations à bas prix, avec seulement 37 voix pour contre 38.`;

/**
 * The WRONG citizen impact that shipped to production. Describes a low-price
 * import ban — a measure absent from amendment 2084.
 */
export const WRONG_CITIZEN_IMPACT = `**De quoi s'agit-il ?**

Vous votez sur un texte destiné à aider les agriculteurs français à faire face à des difficultés comme les mauvaises récoltes ou la baisse des prix.

**Ce qui était proposé**

Un amendement visait à ajouter une nouvelle règle après l'article 22 du projet de loi. **Il proposait d'interdire l'importation de produits agricoles à bas prix si ces produits ne respectaient pas les mêmes normes sociales et environnementales que celles imposées aux agriculteurs français.** Cette mesure aurait concerné des produits comme les céréales, la viande ou les fruits et légumes.

**Le résultat du vote**

L'amendement a été rejeté de justesse, avec 37 voix pour et 38 contre.`;

/**
 * A correct citizen impact grounded in amendment 2084 (transparency on
 * cooperatives' revenue distribution). Used as the positive case for the guard.
 */
export const CORRECT_CITIZEN_IMPACT = `**De quoi s'agit-il ?**

Les députés ont examiné un texte qui cherche à renforcer la position des agriculteurs dans la chaîne agroalimentaire.

**Ce qui était proposé**

Un amendement proposait d'obliger les coopératives agricoles à publier chaque année la répartition de leurs revenus : **les résultats de leurs filiales, la part effectivement redistribuée aux associés coopérateurs et les flux financiers internes au groupe.** L'objectif affiché était plus de transparence sur la valeur reversée aux agriculteurs.

**Le résultat du vote**

L'amendement a été rejeté de justesse, avec 37 voix pour et 38 contre.`;
