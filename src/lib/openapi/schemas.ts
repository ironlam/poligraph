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
 *           format: cuid
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
 *           format: cuid
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
 *           format: date-time
 *           nullable: true
 *         deathDate:
 *           type: string
 *           format: date-time
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
 *           format: cuid
 *         type:
 *           type: string
 *           enum: [DEPUTE, SENATEUR, DEPUTE_EUROPEEN, PRESIDENT_REPUBLIQUE, PREMIER_MINISTRE, MINISTRE, SECRETAIRE_ETAT, MINISTRE_DELEGUE, PRESIDENT_REGION, VICE_PRESIDENT_REGION, PRESIDENT_DEPARTEMENT, VICE_PRESIDENT_DEPARTEMENT, MAIRE, ADJOINT_MAIRE, CONSEILLER_REGIONAL, CONSEILLER_DEPARTEMENTAL, CONSEILLER_MUNICIPAL, PRESIDENT_PARTI, OTHER]
 *         title:
 *           type: string
 *         institution:
 *           type: string
 *           nullable: true
 *         constituency:
 *           type: string
 *           nullable: true
 *         startDate:
 *           type: string
 *           format: date-time
 *         startDatePublicationStatus:
 *           type: string
 *           enum: [AVAILABLE, UNVERIFIED]
 *           description: Indique si la date de début peut être présentée comme vérifiée publiquement.
 *         endDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         isCurrent:
 *           type: boolean
 *
 *     Declaration:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
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
 *           format: cuid
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
 *           format: date-time
 *           nullable: true
 *         deathDate:
 *           type: string
 *           format: date-time
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
 *           format: cuid
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
 *           format: date-time
 *           nullable: true
 *
 *     Affair:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         slug:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [ENQUETE_PRELIMINAIRE, INSTRUCTION, INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN, MISE_EN_EXAMEN, RENVOI_TRIBUNAL, PROCES_EN_COURS, CONDAMNATION_PREMIERE_INSTANCE, APPEL_EN_COURS, POURVOI_EN_CASSATION, CONDAMNATION_DEFINITIVE, RELAXE, ACQUITTEMENT, NON_LIEU, PRESCRIPTION, CLASSEMENT_SANS_SUITE]
 *         category:
 *           type: string
 *           enum: [CORRUPTION, CORRUPTION_PASSIVE, TRAFIC_INFLUENCE, PRISE_ILLEGALE_INTERETS, FAVORITISME, DETOURNEMENT_FONDS_PUBLICS, FRAUDE_FISCALE, BLANCHIMENT, ABUS_BIENS_SOCIAUX, ABUS_CONFIANCE, EMPLOI_FICTIF, FINANCEMENT_ILLEGAL_CAMPAGNE, FINANCEMENT_ILLEGAL_PARTI, HARCELEMENT_MORAL, HARCELEMENT_SEXUEL, AGRESSION_SEXUELLE, VIOLENCE, MENACE, DIFFAMATION, INJURE, INCITATION_HAINE, FAUX_ET_USAGE_FAUX, RECEL, CONFLIT_INTERETS, AUTRE]
 *         involvement:
 *           type: string
 *           enum: [DIRECT, INDIRECT, MENTIONED_ONLY, VICTIM, PLAINTIFF]
 *         factsDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         startDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         verdictDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         sentence:
 *           type: string
 *           nullable: true
 *         appeal:
 *           type: boolean
 *         semantics:
 *           type: object
 *           description: Sémantique éditoriale canonique. Les champs de statut/certitude ne doivent être attribués au politique que si statusAppliesToPolitician=true.
 *           properties:
 *             involvementLabel:
 *               type: string
 *             statusLabel:
 *               type: string
 *             statusDescription:
 *               type: string
 *             categoryLabel:
 *               type: string
 *             statusAppliesToPolitician:
 *               type: boolean
 *             needsPresumption:
 *               type: boolean
 *             certaintyLevel:
 *               type: string
 *               enum: [ETABLI, PRONONCE, EN_COURS, CLOS_SANS_CHARGE, CLOS_FAVORABLE]
 *               nullable: true
 *             certaintyLabel:
 *               type: string
 *               nullable: true
 *             judicialMaturity:
 *               type: string
 *               enum: [CONDAMNATION, PROCEDURE_VALIDEE, ENQUETE, INSTRUCTION_CLOSE, CLOSE_SANS_CONDAMNATION]
 *             judicialMaturityLabel:
 *               type: string
 *         politician:
 *           $ref: '#/components/schemas/PoliticianSummary'
 *         partyAtTime:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/PartySummary'
 *         sources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Source'
 *
 *     FactCheck:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         slug:
 *           type: string
 *           nullable: true
 *         claimText:
 *           type: string
 *         claimant:
 *           type: string
 *           nullable: true
 *         title:
 *           type: string
 *         verdict:
 *           type: string
 *         verdictRating:
 *           type: string
 *           enum: [TRUE, MOSTLY_TRUE, HALF_TRUE, MISLEADING, OUT_OF_CONTEXT, MOSTLY_FALSE, FALSE, UNVERIFIABLE]
 *         source:
 *           type: string
 *         sourceUrl:
 *           type: string
 *           format: uri
 *         publishedAt:
 *           type: string
 *           format: date-time
 *         claimDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         politicians:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PoliticianSummary'
 *
 *     Scrutin:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
 *         externalId:
 *           type: string
 *         title:
 *           type: string
 *         votingDate:
 *           type: string
 *           format: date-time
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
 *           format: cuid
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
 *         eligibleScrutins:
 *           type: integer
 *           nullable: true
 *         scrutinsSansVoteEnregistre:
 *           type: integer
 *           nullable: true
 *           description: Scrutins éligibles sans ligne Vote enregistrée. Ne prouve pas une absence physique.
 *         participationRate:
 *           type: number
 *           format: float
 *           nullable: true
 *         participationStatus:
 *           type: string
 *           enum: [AVAILABLE, SOURCE_INSUFFICIENT, COMPUTATION_INCOMPLETE]
 *
 *     SearchResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: cuid
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
 *           format: date-time
 *           nullable: true
 *         dissolvedDate:
 *           type: string
 *           format: date-time
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
 *           format: date-time
 *           nullable: true
 *         dissolvedDate:
 *           type: string
 *           format: date-time
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
 *           enum: [DEPUTE, SENATEUR, DEPUTE_EUROPEEN, PRESIDENT_REPUBLIQUE, PREMIER_MINISTRE, MINISTRE, SECRETAIRE_ETAT, MINISTRE_DELEGUE, PRESIDENT_REGION, VICE_PRESIDENT_REGION, PRESIDENT_DEPARTEMENT, VICE_PRESIDENT_DEPARTEMENT, MAIRE, ADJOINT_MAIRE, CONSEILLER_REGIONAL, CONSEILLER_DEPARTEMENTAL, CONSEILLER_MUNICIPAL, PRESIDENT_PARTI, OTHER]
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
 *           format: date-time
 *         startDatePublicationStatus:
 *           type: string
 *           enum: [AVAILABLE, UNVERIFIED]
 *           description: Indique si la date de début peut être présentée comme vérifiée publiquement.
 *         endDate:
 *           type: string
 *           format: date-time
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
 *           format: date-time
 *           nullable: true
 *         round2Date:
 *           type: string
 *           format: date-time
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
 *           format: date-time
 *           nullable: true
 *         round2Date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         dateConfirmed:
 *           type: boolean
 *         registrationDeadline:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         candidacyDeadline:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         campaignStartDate:
 *           type: string
 *           format: date-time
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
 *                 format: date-time
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
