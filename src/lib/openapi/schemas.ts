/**
 * OpenAPI Schema Definitions
 * Reusable schemas for API documentation
 *
 * @openapi
 * components:
 *   schemas:
 *     Pagination:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 20
 *         total:
 *           type: integer
 *           example: 150
 *         totalPages:
 *           type: integer
 *           example: 8
 *
 *     PartySummary:
 *       type: object
 *       properties:
 *         shortName:
 *           type: string
 *           example: "LR"
 *         name:
 *           type: string
 *           example: "Les Républicains"
 *         color:
 *           type: string
 *           nullable: true
 *           example: "#0066CC"
 *
 *     PoliticianSummary:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         slug:
 *           type: string
 *           example: "jean-dupont"
 *         fullName:
 *           type: string
 *           example: "Jean Dupont"
 *         photoUrl:
 *           type: string
 *           nullable: true
 *         currentParty:
 *           $ref: '#/components/schemas/PartySummary'
 *
 *     Politician:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         slug:
 *           type: string
 *           example: "jean-dupont"
 *         fullName:
 *           type: string
 *           example: "Jean Dupont"
 *         firstName:
 *           type: string
 *           example: "Jean"
 *         lastName:
 *           type: string
 *           example: "Dupont"
 *         civility:
 *           type: string
 *           enum: [M, MME]
 *           nullable: true
 *         birthDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         deathDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         birthPlace:
 *           type: string
 *           nullable: true
 *         photoUrl:
 *           type: string
 *           nullable: true
 *         currentParty:
 *           $ref: '#/components/schemas/PartySummary'
 *
 *     Mandate:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [DEPUTE, SENATEUR, DEPUTE_EUROPEEN, PRESIDENT, PREMIER_MINISTRE, MINISTRE, SECRETAIRE_ETAT, MAIRE, PRESIDENT_REGION, PRESIDENT_DEPARTEMENT, CONSEILLER_REGIONAL, CONSEILLER_DEPARTEMENTAL, CONSEILLER_MUNICIPAL]
 *         title:
 *           type: string
 *           example: "Député de la 3ème circonscription du Rhône"
 *         institution:
 *           type: string
 *           nullable: true
 *         constituency:
 *           type: string
 *           nullable: true
 *         startDate:
 *           type: string
 *           format: date
 *         endDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         isCurrent:
 *           type: boolean
 *
 *     Declaration:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [PATRIMOINE, INTERETS]
 *         year:
 *           type: integer
 *           example: 2024
 *         url:
 *           type: string
 *           format: uri
 *           nullable: true
 *
 *     PoliticianDetails:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         slug:
 *           type: string
 *         fullName:
 *           type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         civility:
 *           type: string
 *           enum: [M, MME]
 *           nullable: true
 *         birthDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         deathDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         birthPlace:
 *           type: string
 *           nullable: true
 *         photoUrl:
 *           type: string
 *           nullable: true
 *         currentParty:
 *           $ref: '#/components/schemas/PartySummary'
 *         mandates:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Mandate'
 *         declarations:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Declaration'
 *         affairsCount:
 *           type: integer
 *           description: Nombre d'affaires publiées impliquant la personne, tous rôles confondus.
 *         adverseAffairsCount:
 *           type: integer
 *           description: Affaires où la personne est mise en cause (procédures validées par un juge).
 *         affairsMentionedCount:
 *           type: integer
 *           description: Affaires où la personne est simplement mentionnée.
 *         affairsVictimOrPlaintiffCount:
 *           type: integer
 *           description: Affaires où la personne est victime ou plaignante.
 *         favorableOutcomeCount:
 *           type: integer
 *           description: Affaires closes sans condamnation (relaxe, acquittement, non-lieu, classement, prescription).
 *
 *     Source:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *           format: uri
 *         title:
 *           type: string
 *         publisher:
 *           type: string
 *           nullable: true
 *         publishedAt:
 *           type: string
 *           format: date
 *           nullable: true
 *
 *     Affair:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         slug:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [ENQUETE_PRELIMINAIRE, MISE_EN_EXAMEN, PROCES_EN_COURS, CONDAMNATION_PREMIERE_INSTANCE, CONDAMNATION_DEFINITIVE, APPEL_EN_COURS, RELAXE, NON_LIEU, PRESCRIPTION]
 *         category:
 *           type: string
 *           enum: [CORRUPTION, FRAUDE_FISCALE, BLANCHIMENT, TRAFIC_INFLUENCE, PRISE_ILLEGALE_INTERET, DETOURNEMENT_FONDS, ABUS_BIENS_SOCIAUX, EMPLOI_FICTIF, FAVORITISME, RECEL, VIOLENCE, HARCELEMENT_MORAL, HARCELEMENT_SEXUEL, AGRESSION_SEXUELLE, VIOL, DIFFAMATION, INJURES, INCITATION_HAINE, AUTRE]
 *         factsDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         startDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         verdictDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         sentence:
 *           type: string
 *           nullable: true
 *         appeal:
 *           type: boolean
 *         politician:
 *           $ref: '#/components/schemas/PoliticianSummary'
 *         partyAtTime:
 *           $ref: '#/components/schemas/PartySummary'
 *         sources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Source'
 *
 *     Scrutin:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         externalId:
 *           type: string
 *         title:
 *           type: string
 *         votingDate:
 *           type: string
 *           format: date
 *         legislature:
 *           type: integer
 *           example: 16
 *         votesFor:
 *           type: integer
 *         votesAgainst:
 *           type: integer
 *         votesAbstain:
 *           type: integer
 *         result:
 *           type: string
 *           enum: [ADOPTED, REJECTED]
 *         sourceUrl:
 *           type: string
 *           format: uri
 *           nullable: true
 *
 *     Vote:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         position:
 *           type: string
 *           enum: [POUR, CONTRE, ABSTENTION, NON_VOTANT, ABSENT]
 *         scrutin:
 *           $ref: '#/components/schemas/Scrutin'
 *
 *     VoteStats:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *         pour:
 *           type: integer
 *         contre:
 *           type: integer
 *         abstention:
 *           type: integer
 *         nonVotant:
 *           type: integer
 *         absent:
 *           type: integer
 *         participationRate:
 *           type: number
 *           format: float
 *
 *     SearchResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         fullName:
 *           type: string
 *         slug:
 *           type: string
 *         photoUrl:
 *           type: string
 *           nullable: true
 *         party:
 *           type: string
 *           nullable: true
 *         partyColor:
 *           type: string
 *           nullable: true
 *         mandate:
 *           type: string
 *           nullable: true
 *
 *     Party:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         slug:
 *           type: string
 *           nullable: true
 *           example: "les-republicains"
 *         name:
 *           type: string
 *           example: "Les Républicains"
 *         shortName:
 *           type: string
 *           example: "LR"
 *         color:
 *           type: string
 *           nullable: true
 *           example: "#0066CC"
 *         politicalPosition:
 *           type: string
 *           enum: [FAR_LEFT, LEFT, CENTER_LEFT, CENTER, CENTER_RIGHT, RIGHT, FAR_RIGHT]
 *           nullable: true
 *         logoUrl:
 *           type: string
 *           nullable: true
 *         foundedDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         dissolvedDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         website:
 *           type: string
 *           nullable: true
 *         memberCount:
 *           type: integer
 *           description: Nombre de membres actuels
 *
 *     PartyDetails:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         slug:
 *           type: string
 *           nullable: true
 *         name:
 *           type: string
 *         shortName:
 *           type: string
 *         color:
 *           type: string
 *           nullable: true
 *         politicalPosition:
 *           type: string
 *           enum: [FAR_LEFT, LEFT, CENTER_LEFT, CENTER, CENTER_RIGHT, RIGHT, FAR_RIGHT]
 *           nullable: true
 *         logoUrl:
 *           type: string
 *           nullable: true
 *         description:
 *           type: string
 *           nullable: true
 *         foundedDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         dissolvedDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         ideology:
 *           type: string
 *           nullable: true
 *         headquarters:
 *           type: string
 *           nullable: true
 *         website:
 *           type: string
 *           nullable: true
 *         memberCount:
 *           type: integer
 *         members:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               slug:
 *                 type: string
 *               fullName:
 *                 type: string
 *               photoUrl:
 *                 type: string
 *                 nullable: true
 *               currentMandate:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   type:
 *                     type: string
 *                   title:
 *                     type: string
 *               affairsCount:
 *                 type: integer
 *         externalIds:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               source:
 *                 type: string
 *               externalId:
 *                 type: string
 *               url:
 *                 type: string
 *                 nullable: true
 *         predecessor:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: string
 *             slug:
 *               type: string
 *             name:
 *               type: string
 *             shortName:
 *               type: string
 *         successors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               slug:
 *                 type: string
 *               name:
 *                 type: string
 *               shortName:
 *                 type: string
 *
 *     MandateSummary:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         type:
 *           type: string
 *           enum: [DEPUTE, SENATEUR, DEPUTE_EUROPEEN, PRESIDENT_REPUBLIQUE, PREMIER_MINISTRE, MINISTRE, SECRETAIRE_ETAT, MINISTRE_DELEGUE, PRESIDENT_REGION, PRESIDENT_DEPARTEMENT, MAIRE, ADJOINT_MAIRE, CONSEILLER_REGIONAL, CONSEILLER_DEPARTEMENTAL, CONSEILLER_MUNICIPAL, PRESIDENT_PARTI, OTHER]
 *         title:
 *           type: string
 *         institution:
 *           type: string
 *         role:
 *           type: string
 *           nullable: true
 *         constituency:
 *           type: string
 *           nullable: true
 *         departmentCode:
 *           type: string
 *           nullable: true
 *         startDate:
 *           type: string
 *           format: date
 *         endDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         isCurrent:
 *           type: boolean
 *         politician:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             slug:
 *               type: string
 *             fullName:
 *               type: string
 *             photoUrl:
 *               type: string
 *               nullable: true
 *
 *     ElectionSummary:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         slug:
 *           type: string
 *           example: "municipales-2026"
 *         type:
 *           type: string
 *           enum: [PRESIDENTIELLE, LEGISLATIVES, SENATORIALES, MUNICIPALES, DEPARTEMENTALES, REGIONALES, EUROPEENNES, REFERENDUM]
 *         title:
 *           type: string
 *         shortTitle:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [UPCOMING, REGISTRATION, CANDIDACIES, CAMPAIGN, ROUND_1, BETWEEN_ROUNDS, ROUND_2, COMPLETED]
 *         scope:
 *           type: string
 *           enum: [NATIONAL, REGIONAL, DEPARTMENTAL, MUNICIPAL, EUROPEAN]
 *         suffrage:
 *           type: string
 *           enum: [DIRECT, INDIRECT]
 *         round1Date:
 *           type: string
 *           format: date
 *           nullable: true
 *         round2Date:
 *           type: string
 *           format: date
 *           nullable: true
 *         dateConfirmed:
 *           type: boolean
 *         totalSeats:
 *           type: integer
 *           nullable: true
 *         candidacyCount:
 *           type: integer
 *           description: Nombre de candidatures enregistrées
 *
 *     ElectionDetails:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         slug:
 *           type: string
 *         type:
 *           type: string
 *           enum: [PRESIDENTIELLE, LEGISLATIVES, SENATORIALES, MUNICIPALES, DEPARTEMENTALES, REGIONALES, EUROPEENNES, REFERENDUM]
 *         title:
 *           type: string
 *         shortTitle:
 *           type: string
 *           nullable: true
 *         description:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [UPCOMING, REGISTRATION, CANDIDACIES, CAMPAIGN, ROUND_1, BETWEEN_ROUNDS, ROUND_2, COMPLETED]
 *         scope:
 *           type: string
 *           enum: [NATIONAL, REGIONAL, DEPARTMENTAL, MUNICIPAL, EUROPEAN]
 *         suffrage:
 *           type: string
 *           enum: [DIRECT, INDIRECT]
 *         totalSeats:
 *           type: integer
 *           nullable: true
 *         round1Date:
 *           type: string
 *           format: date
 *           nullable: true
 *         round2Date:
 *           type: string
 *           format: date
 *           nullable: true
 *         dateConfirmed:
 *           type: boolean
 *         registrationDeadline:
 *           type: string
 *           format: date
 *           nullable: true
 *         candidacyDeadline:
 *           type: string
 *           format: date
 *           nullable: true
 *         campaignStartDate:
 *           type: string
 *           format: date
 *           nullable: true
 *         decreeUrl:
 *           type: string
 *           nullable: true
 *         sourceUrl:
 *           type: string
 *           nullable: true
 *         candidacies:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               candidateName:
 *                 type: string
 *               partyLabel:
 *                 type: string
 *                 nullable: true
 *               constituencyName:
 *                 type: string
 *                 nullable: true
 *               isElected:
 *                 type: boolean
 *               round1Votes:
 *                 type: integer
 *                 nullable: true
 *               round1Pct:
 *                 type: number
 *                 nullable: true
 *               round2Votes:
 *                 type: integer
 *                 nullable: true
 *               round2Pct:
 *                 type: number
 *                 nullable: true
 *               politician:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   id:
 *                     type: string
 *                   slug:
 *                     type: string
 *                   fullName:
 *                     type: string
 *                   photoUrl:
 *                     type: string
 *                     nullable: true
 *               party:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   id:
 *                     type: string
 *                   slug:
 *                     type: string
 *                   shortName:
 *                     type: string
 *                   color:
 *                     type: string
 *                     nullable: true
 *         rounds:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               round:
 *                 type: integer
 *               date:
 *                 type: string
 *                 format: date
 *               registeredVoters:
 *                 type: integer
 *                 nullable: true
 *               actualVoters:
 *                 type: integer
 *                 nullable: true
 *               participationRate:
 *                 type: number
 *                 nullable: true
 *               blankVotes:
 *                 type: integer
 *                 nullable: true
 *               nullVotes:
 *                 type: integer
 *                 nullable: true
 *
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Erreur serveur"
 */

export {};
