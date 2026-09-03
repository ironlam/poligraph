# AGENTS.md

Guidelines for AI coding assistants (Claude Code, Cursor, Codex, Aider, and any future agent) contributing to Poligraph.

This file follows the [agents.md](https://agents.md) convention. Human contributors should read it too; it captures what a new engineer needs to be productive without breaking the editorial mission.

---

## 1. What is Poligraph

Poligraph is a civic observatory of French political life. It aggregates public data about politicians, their mandates, their parliamentary votes, the judicial affairs they are involved in, the fact-checks made on their statements, and the press coverage they receive. The goal is to let any citizen verify, in one place, what their elected representatives do and say.

**Mission**: inform citizens with rigor, in a non-partisan way, using verifiable sources only.

**Stack**: Next.js 16 (App Router), React 19, Prisma 7, PostgreSQL (Supabase), TypeScript, Tailwind CSS 4, Inngest for async jobs, hosted on Vercel.

**Public site**: [poligraph.fr](https://poligraph.fr). **Source**: [github.com/ironlam/poligraph](https://github.com/ironlam/poligraph).

---

## 2. Editorial principles (non-negotiable)

These principles are constraints on every line of code, every generated string, every database write. They override convenience, performance, and cleverness. If a task conflicts with one of them, stop and flag the conflict.

1. **Civic mission over product metrics.** Every feature must serve citizen information. Engagement, virality, and retention are secondary.

2. **Strict non-partisanship.** Apply identical criteria to all politicians regardless of party. Never add party-specific heuristics, exceptions, or weights. If you catch yourself writing `if (party === "X")`, stop.

3. **Presumption of innocence (article 9-1 du Code civil).** Profiles with an ongoing judicial case must display the presumption-of-innocence mention. The default involvement level for a mentioned person is `MENTIONED_ONLY`. Never escalate involvement without explicit editorial validation and a verified source.

4. **Verified sources only.** Every judicial affair requires at least one verifiable journalistic source (Le Monde, Mediapart, AFP, Le Figaro, Libération, France Info, Reuters, AP). Never import from blogs, forums, social media, or unverified aggregators. Official data (Assemblée Nationale, Sénat, Gouvernement, HATVP) prevails over third-party interpretation.

5. **Transparency end-to-end.** Code is open. Methodology is documented. Every displayed claim must be traceable back to its source. If you add a data field, add a way for users to see where it came from.

6. **AI usage is narrow and declared.** AI is authorized for: classification, entity resolution, mention detection, moderation assistance, summarization of public documents from verified sources. AI is NOT authorized for: generating editorial content about people, writing biographies freehand, inferring motives, speculating on affairs, or producing any user-facing text that claims a fact not present in the source data. Biographies come from structured Wikidata, then human review.

7. **Gravity classification follows Sapin II logic.** Probity offenses tied to mandate (corruption, embezzlement, illegal campaign financing) rank above serious infractions (fraud, harassment, abuse) which rank above other infractions. This reflects mandate-specific gravity, not personal moral judgment.

8. **Inclusion scope.** French politicians only, living or deceased less than ten years ago, who held a mandate or are involved in a political judicial affair. No foreign leaders, no pre-1958 figures, no private citizens.

9. **Right of reply and GDPR.** Any cited person can request correction or removal. Only public data. When in doubt, err on the side of the person cited.

---

## 3. Repository layout

```
src/
  app/              Next.js App Router: pages and API routes
  components/       React components (~25 domain directories)
  config/           Constants, labels, enums, navigation
  services/         Business logic (sync services, affairs logic)
  lib/              Utilities
    db.ts             Prisma singleton (extended client, pg pool, serverless-tuned)
    auth.ts           Admin HMAC auth
    api/              API wrappers and external clients
    data/             Data-access functions (imported by pages)
    cache.ts          Caching helpers + tag invalidation
    affair-matching/  Affair <-> Politician resolver (signals + combiner)
    identity/         Identity resolution v2 (signal pipeline)
  inngest/          Async job orchestration
  types/            Domain interfaces
  hooks/            React hooks
  generated/prisma/ Auto-generated Prisma client (never edit)
prisma/             Schema and manual migrations
scripts/            Ops scripts (sync, backfill, fix, audit)
```

**Path alias**: `@/*` maps to `./src/*`.

**Prisma client**: import from `@/generated/prisma`, not `@prisma/client`. Prisma types: `import { Prisma } from "@/generated/prisma"`.

---

## 4. Commands

### Quick start

```bash
node -v                # Must be >= 22
npm install
# Set up .env with DATABASE_URL, ADMIN_PASSWORD, ANTHROPIC_API_KEY
npm run db:generate    # Generate Prisma client
npm run dev            # Dev server on localhost:3000
```

### Daily development

```bash
npm run dev            # Next.js dev server
npm run build          # prisma generate + next build
npm run typecheck      # TypeScript strict, no emit
npm run lint           # ESLint + prettier
npm run format         # Prettier fix
npm run test           # Vitest watch
npm run test:run       # Vitest single run (CI)
npm run test:coverage  # Vitest with coverage
```

### Database

```bash
npm run db:generate    # Regenerate Prisma client
npm run db:push        # Push schema to the configured DATABASE_URL
npm run db:studio      # Prisma Studio
```

### Diagnostics

```bash
npm run perf:check [slug]                               # Vote index scans, EXPLAIN ANALYZE
npx tsx scripts/rescan-affair-politicians.ts --verbose  # Retrofit affair-politician resolver
npm run audit:affairs                                   # Judicial affair quality audit
npm run wikidata:lookup -- "nom"                        # Local Wikidata Q-ID lookup
```

### Sync pipelines

Full list in `package.json` under `scripts`. Most have a `:stats` dry-run variant. Grouped by domain:

- **Politicians**: `sync:assemblee`, `sync:senat`, `sync:gouvernement`, `sync:president`, `sync:europarl`
- **Enrichment**: `sync:hatvp`, `sync:photos`, `sync:deceased`, `sync:birthdates`, `sync:careers`, `sync:partis`
- **Votes**: `sync:scrutins-an`, `sync:scrutins-senat`
- **Legislation**: `sync:legislation`, `sync:legislation:content`
- **Content**: `sync:press`, `sync:factchecks`, `sync:moderate`, `sync:enrich`
- **Elections**: `sync:rne:maires`, `sync:elections:municipales`, `sync:resultats-csv`
- **Orchestration**: `sync:daily`, `sync:full`

### Running arbitrary scripts

```bash
npx tsx scripts/my-script.ts
npx dotenv -e .env -- npx tsx scripts/x.ts   # When env loading is needed
```

### What belongs in `scripts/`

Two kinds of script live here, and only one of them stays.

**Durable**: re-runnable against any database state, assumes no particular
starting point. `sync-*`, read-only `audit-*`, `debug-*`, `seed-*`. Lives in
`scripts/` and gets a `package.json` entry so it is discoverable.

**One-shot**: assumes a specific broken state that stops existing the moment the
script succeeds. `backfill-*`, `migrate-*`, `fix-*`. Either write it in
`scripts/.local/` (gitignored), or land it in `scripts/` and delete it in the PR
that follows its run. A completed backfill has no second use: the state it
repairs is gone.

The distinction is the exit, not the prefix. A backfill kept "just in case" is
dead weight that every contributor has to read past, and any deleted script comes
back with `git log --diff-filter=D --name-only`.

`src/__tests__/consistency.test.ts` enforces the mechanical half of this: every
`package.json` entry and every `sync-full.ts` step must point at a file that
exists. Deleting a wired script without unwiring it fails CI.

---

## 5. Architecture essentials

### Data layer pattern

Pages import and render. Data modules query and cache. Business logic sits in services.

- **Data functions** live in `src/lib/data/`, one file per domain (politicians, affairs, parties, elections, scrutins, etc.).
- Convention: `queryX()` private uncached, `getXFiltered()` cached with bounded params, `searchX()` uncached for free-text, `getX()` router choosing between them.
- **Prisma Decimal fields** (e.g. `Affair.fineAmount`) cannot cross the RSC/Client boundary. Convert with `Number()` in the data function, not in the component.

### Where does my code go?

The sentence above leaves one box unnamed, and the codebase filled it in three different ways. Four homes, one question each. Enforced by `src/__tests__/architecture/layering-guards.test.ts`.

| Ask                                     | Home                       | Rule                                                |
| --------------------------------------- | -------------------------- | --------------------------------------------------- |
| Reading for a page?                     | `src/lib/data/<domain>.ts` | Queries and caches. **Never writes.**               |
| A rule the domain is always true under? | `src/lib/<domain>/`        | Reads and writes the DB. **Never opens a socket.**  |
| Talking to something outside?           | `src/lib/api/`             | The only outbound network clients under `src/lib/`. |
| A pipeline, a sync, a bulk write?       | `src/services/<domain>/`   | Orchestration. External I/O belongs here.           |

Read it as a decision, not a taxonomy: `publish-guard.ts` writes to the DB and is an invariant, so it is `src/lib/affairs/`. `discover-affairs.ts` calls the press, resolves, and writes in bulk, so it is `src/services/sync/`. `getPolitician()` renders a page, so it is `src/lib/data/`.

Two ratchets carry the debt that predates the rule, both frozen lists in the guard file: `NETWORK_EXCEPTIONS` (four `src/lib/` modules that fetch) and `PAGE_DB_DEBT` (nineteen public pages importing `@/lib/db` instead of reading through `src/lib/data/`). Entries come off the lists as code migrates. Adding one fails review.

### API route patterns

- **Public routes**: `withPublicRoute()` from `@/lib/api/with-public-route` (try-catch, 500 handler).
- **Admin routes**: `withAdminAuth()` from `@/lib/api/with-admin-auth`. Never write inline `isAuthenticated()`. CI blocks admin routes without it.
- **Admin mutations**: always wrap with `withValidation(schema)` from `@/lib/security/validate` and write to `db.auditLog` on every mutation.
- **Pagination**: `parsePagination()` from `@/lib/api/pagination` — never inline `parseInt(searchParams.get("page"))`.
- **v1 public API**: CORS `*`, tiered `withCache()` (`static` 1h, `daily` 5 min, `stats` 15 min).
- **CSV exports**: `stripMarkdownForCSV()` from `@/lib/csv`, max 50k rows, `poligraphId` is the primary stable join key.

### Key domain models

- **Politician** — core entity. `publicId` (poligraphId) is a stable public identifier of the form `PG000001`. Auto-generated by the Prisma extension in `src/lib/db.ts`.
- **Mandate** — political office. 1:1 associations for specialized data: `MandateLocal` (communeId, functionStart), `MandateGovernment` (governmentName), `MandateParliamentary` (parliamentaryGroupId), `MandateEuropean` (europeanGroupId).
- **Affair** — judicial case. Use `COALESCE(startDate, factsDate, createdAt)` for chronological sort. Display party with `getAffairPartyDisplay()` from `@/lib/affairs/party-display.ts`, never raw `affair.partyAtTime || politician.currentParty`. UI uses 4-level certainty (ETABLI > PRONONCE > EN_COURS > CLOS_FAVORABLE) from `@/config/certainty.ts`, not severity labels.
- **Scrutin** — parliamentary vote. Linked to legislative dossiers via `seanceRef` <-> `reunionRef` (the `dossierLegislatif` JSON field is always null; never rely on it).
- **Party vs ParliamentaryGroup** — never create a Party for a parliamentary group. Groups live in `ParliamentaryGroup`, linked to parties via `defaultPartyId`.
- **PublicationStatus** — controls public visibility: PUBLISHED, DRAFT, ARCHIVED, EXCLUDED, REJECTED.

### Identity resolution

Two distinct resolver systems:

- **Identity v2** (`src/lib/identity/`) — resolves a structured person description to a Politician row. Composable signal evaluators (birthdate, department, first-name, gender, external-id) feed a log-LR combiner. Auto-links only on `SAME` (>=0.95). `UNDECIDED` requires manual review.
- **Affair-to-Politician** (`src/lib/affair-matching/`) — decides which politician a candidate affair mentions. Nine signal evaluators, log-LR combiner, three-tier judgment (SAME / UNDECIDED / NO_MATCH). Every import pipeline (press analysis, discover-affairs, manual admin) calls the resolver. Every decision writes an `AffairPoliticianDecision` audit row. Admin review: `/admin/affair-matching/`.

### Caching strategy

- `"use cache"` directive: only for functions with bounded params, never with free-text search.
- `cacheLife("minutes")` default; `cacheLife("hours")` for election or reshuffle data only.
- `cacheTag()` uses entity-based tags (`politicians`, `affairs`, `parties`, `elections`) for targeted invalidation.
- `export const revalidate = N` (ISR) for listing pages with search.
- `React.cache()` to deduplicate between `generateMetadata()` and `page()`.
- **Never combine `generateStaticParams` with `searchParams`** on a page with `useCache: true` — it crashes with `DYNAMIC_SERVER_USAGE`. Use `revalidate = N` alone.

### Indexation / SEO doctrine

Index the pages that carry real content; keep thin, duplicate, or utility surfaces out of the index without blocking discovery (`noindex,follow`). Crawl blocking is a separate and stronger tool with its own preconditions, see below. The rules are pure and centralised so they stay testable and the sitemap cannot drift from them.

- **Indexable**: bare listings (`/affaires`, `/politiques`, `/parlement/votes`, `/parlement/dossiers`), rich politician profiles, significant communes, dossier detail pages, and scrutin detail pages that either decide a text (vote solennel, motion, article) or carry an editorial signal.
- **`noindex,follow`**: utility-filtered or paginated listing variants; thin politician profiles (no significant mandate, affair, fact-check, declaration, or biography); small communes; vote date-archive pages (`/parlement/votes/{YYYY-MM-DD}`); a thin profile's own sub-tabs (`/politiques/[slug]/votes` and `/relations`) inherit its verdict, never crawlable on their own; amendment scrutins carrying no editorial signal (no key-vote flag, no citizen impact), which arrive by the thousand and differ from one another by an amendment number. A correct self-canonical does not fix near-duplicate content; only withholding the page does.
- **Single sources of truth**: filter-key perimeters in `listing-filters.ts`; thin-profile thresholds (`SIGNIFICANT_MANDATE_TYPES`, `MAIRE_MIN_COMMUNE_POPULATION`, `MIN_BIOGRAPHY_LENGTH`) in `politician-robots.ts`; commune threshold in `commune-robots.ts`; date-archive rule in `parliament-robots.ts`; scrutin predicate in `scrutin-robots.ts`. `src/app/sitemap.ts` imports those constants or mirrors those predicates in SQL, never hardcodes them; where a predicate reads text through `trim()`, the SQL side uses `btrim` so both give the same verdict on whitespace. The profile sub-tabs reuse the same predicate through `politician-index-signals.ts`, a cheap signals loader feeding `politicianRobotsMetadata`, so a tab cannot drift from its profile.
- **Calibrate predicates against production, not intuition**: a signal only discriminates while it stays scarce. Two predicates in this repo shipped keyed on a signal that had become universal and therefore filtered nothing: the politician one on "has a mandate" when every published profile had one (#385), and a first version of the scrutin one on the summary and the approved policy title once the generators had covered practically the whole corpus. Count the verdicts on production data before choosing a threshold, prefer signals that cost a human decision, and re-measure when a generator starts filling one in bulk.
- **Crawl blocking vs `noindex`**: `noindex` and `rel=canonical` are read only after the fetch, so both cost a crawl before they can say anything. That is acceptable for a bounded surface, and not for one that is multiplicative (a facet space combining filter keys grows faster than the content behind it) or that re-runs expensive work on every hit. Those get a `robots.txt` Disallow: the `/parlement/votes` facets (one rule per key from `listing-filters.ts`, scoped to the `?` boundary so the `/themes/[theme]` and `[slug]` routes stay crawlable) and the politician tab deep-links (`?tab=`, `/votes?type=`, client-side views of one document). Never crawl-block a surface that earns clicks: the `/affaires/condamnations` facets carry the largest share of the site's organic traffic and are handled by canonical only.
- **Assets**: `opengraph-image` responses carry `X-Robots-Tag: noindex` (`next.config.ts` + `og-image-robots.ts`) **and**, since they dominated crawl for no indexation while re-rendering a full `ImageResponse` each time, a `robots.txt` Disallow for generic user agents. This reverses an earlier "never Disallow them" rule, and two conditions made it safe. Both must hold before doing the same to any asset route. First, the URLs had already left the index through the header: blocking the fetch on a still-indexed URL freezes it there, since Google can no longer read the noindex. Second, `SOCIAL_PREVIEW_USER_AGENTS` gets its own robots.txt group without the rule, so link previews keep resolving their `og:image`. A crawler obeys only the most specific group that names it and ignores every other, so that group has to restate each shared rule it should still follow.
- **Machine endpoints**: everything under `/api` (JSON/CSV exports, the OpenAPI schema) carries `X-Robots-Tag: noindex` (`next.config.ts` + `api-robots.ts`). They are linked from the site and get crawled, but must never rank as pages. Unlike the assets rule above, this stays a header with no `robots.txt` Disallow: the public data API must remain fetchable by anyone, so the crawl cost is accepted. The human-readable docs at `/docs/api` stay indexable.
- **Enforcement**: `src/lib/seo/__tests__/indexation-doctrine.test.ts` fails in CI if a strong page turns noindex, a thin one turns indexable, a filter key disappears, or the sitemap stops sharing the thresholds. `src/app/__tests__/robots.test.ts` covers the generated `robots.txt`, including that no rule reaches an indexable route and that the social group keeps the shared rules. Ship every SEO change with a code comment and a case in those tests. A guard that greps a source file must scope the match to the code, comments stripped: matching the whole file lets a signal named in the surrounding prose keep the guard green after the rule dropped it.
- **Private data stays private**: Search Console figures, query strings, and per-entity analysis live in `docs/search-console/` (gitignored) or Notion, never in the repo.

---

## 6. Code conventions

### Naming: French for the domain, English for code

| What               | Language                    | Example                                                     |
| ------------------ | --------------------------- | ----------------------------------------------------------- |
| Domain nouns       | French                      | `depute`, `maire`, `scrutin`, `affaire`, `parti`, `commune` |
| Programming verbs  | English                     | `sync*`, `get*`, `fetch*`, `create*`                        |
| Compound names     | English verb + French noun  | `syncDeputes()`, `getMaires()`                              |
| Prisma enum values | French SCREAMING_SNAKE_CASE | `DEPUTE`, `MAIRE`, `FONDATEUR`                              |
| URL paths          | See `src/config/routes.ts`  | `/parlement/votes/[slug]`                                   |
| File names         | French domain nouns         | `deputes.ts`, `scrutins.ts`                                 |
| npm scripts        | French domain nouns         | `sync:scrutins-an`                                          |

When unsure: if the noun is specific to French politics, law, or administration, use French. Generic programming terms stay English.

### Formatting

- Prettier: 100 char width, 2-space indent, double quotes, trailing commas (es5), semicolons.
- ESLint: `next/core-web-vitals` + prettier. Unused vars with `_` prefix allowed. `no-console` is a warning (disabled in `api/`, `services/`, `lib/`, `sync/`).
- Pre-commit: `lint-staged` runs ESLint fix + Prettier on staged files. Do not skip hooks.
- Comments explain a non-obvious invariant or constraint. Do not narrate the diff, the former
  implementation, or code that is already self-explanatory.

### Language rules for user-facing text

- French for all UI and content, English for code.
- **Always use real UTF-8 accents** in JSX text: `é`, `è`, `à`, `ê`, `ô`, `ç`, `ù`, `î`, `û`, `ë`. Never `\u00e9` escapes in JSX (treated as literal). Double-check every French string before committing. Common mistakes: `egalement` -> `également`, `elus` -> `élus`, `deputes` -> `députés`, `criteres` -> `critères`, `resultats` -> `résultats`.
- ESLint `react/no-unescaped-entities` forbids `'` in JSX: write `d{"'"}activité`, not `d'activité`.
- **No em dashes (—) or en dashes (–)** in generated content, commit messages, or UI text. They are the number-one AI-detection marker. Use commas, colons, parentheses, or regular hyphens.
- **No stereotypical transitions** in editorial content: `en outre`, `par ailleurs`, `il convient de noter`, `dans le cadre de`, `au sein de`. Vary sentence length. Prefer active voice and concrete verbs.

### Accessibility (WCAG 2.1 AA minimum)

Every UI element must be usable by keyboard, screen reader, and touch. Check before committing, not after.

- **Touch targets**: at least 44x44 px on mobile for interactive elements. Icon-only links: wrap in `inline-flex items-center justify-center h-9 w-9` minimum (36 px). Never ship bare `h-4 w-4` icons as standalone targets.
- **Icon-only controls** must have both `aria-label` (French, descriptive) and `title`. Decorative icons inside labeled parents: `aria-hidden="true"`.
- **Images**: all `<img>` need a descriptive `alt`. Decorative: `alt=""`.
- **Color contrast**: 4.5:1 for text, 3:1 for UI components. Test `text-muted-foreground` on any non-white background.
- **Keyboard navigation**: all interactive elements focusable and operable by keyboard. Do not remove the focus outline.
- **Semantic HTML**: `<button>` for actions, `<a>` for navigation. Never `<div onClick>`.
- **External links**: always `target="_blank" rel="noopener noreferrer"` and mention external destination in `aria-label` when not obvious.
- **Form inputs**: visible `<label>` or `aria-label`. Errors associated via `aria-describedby`.
- **Motion**: respect `prefers-reduced-motion`.

### Security (OWASP-hardened, security-first)

Mindset: AI-generated code ships vulnerabilities by default. Validate at every boundary, trust nothing.

- **Input validation**: every POST/PUT/PATCH API route uses a Zod schema via `withValidation(schema)`. Never trust `req.json()`.
- **Admin auth**: `withAdminAuth()` only. Inline `isAuthenticated()` is blocked by CI.
- **RLS** is enabled on every Supabase table. Policies grant `anon` role `SELECT` on published content. Prisma connects as `postgres` (bypasses RLS). This is defense in depth, not the primary gate.
- **SQL**: `Prisma.sql` template literals for raw queries. `$executeRawUnsafe` is blocked by CI.
- **XSS**: never `dangerouslySetInnerHTML` with user input. The Markdown component escapes HTML first.
- **Secrets**: never in `NEXT_PUBLIC_*`. Server-side only.
- **CSP**: `unsafe-eval` dev-only. HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff in production.
- **AI prompts**: always sanitize DB content before interpolation. Pattern: `sanitize = (s) => s.replace(/["\n\r]/g, " ").slice(0, 200)`. Use XML delimiters (`<votes>`, `<donnees>`) around interpolated content. Use `callAnthropic()` from `@/lib/api/anthropic`, not the SDK directly.
- **Rate limiting**: tiered middleware (general 60/min, search 30/min, export 5/min, admin 30/min, auth 5 per 15 min).
- **Audit log**: all admin mutations write to `db.auditLog` with action, entityType, entityId, changes, IP, user-agent.
- **Judicial fields** default to the most conservative value: `involvement: "MENTIONED_ONLY"`.
- **Factcheck queries** must filter by `FACTCHECK_ALLOWED_SOURCES` from `@/config/labels`.

### Threat model checklist (before shipping a feature)

Typical AI-code vulnerabilities are not classic SQL injection. They are:

1. Broken access control on endpoints (check every protected route, every protected action).
2. IDOR (never expose sequential IDs, always verify ownership server-side).
3. Stored XSS (sanitize every user input with DOMPurify, strict CSP).
4. SSRF (whitelist outbound URLs, block loopback and private ranges).
5. Path traversal (never interpolate user input into file paths).
6. Command injection (never pass user input to exec/spawn without escape).
7. CORS (never allow all origins on an endpoint that also has an unauthenticated mode).
8. Cross-file business-logic authorization bugs (the most dangerous, least caught class).

---

## 7. AI-specific guardrails

These rules apply to AI assistants specifically when generating code, queries, or prompts for this project.

### You must never

- **Generate biographical claims about real people freehand.** Biographies are derived from structured Wikidata, then human-validated. If asked to write a politician's bio, refuse and point to the Wikidata pipeline.
- **Insert numerical facts into biographies or editorial content** (vote counts, participation rates, number of declarations). Those are rendered live by page components. A biography with a hard-coded number is stale the day it is written.
- **Infer motive or intent** from judicial affairs, votes, or declarations. Report facts and sources only.
- **Write party-asymmetric logic.** No conditional branching on party name for editorial treatment.
- **Escalate `Affair.involvement` automatically.** The default `MENTIONED_ONLY` exists to protect the presumption of innocence. Only human moderators can upgrade involvement.
- **Auto-link politicians to affairs below threshold.** The resolver returns `SAME / UNDECIDED / NO_MATCH`. Only `SAME` (>= 0.95 for identity, above `SAME_THRESHOLD` for affair-matching) auto-links. `UNDECIDED` requires manual review.
- **Publish a judicial affair outside the guard (RGPD art. 10).** Never write `publicationStatus: "PUBLISHED"` on `Affair` directly. The only path to publication is `assertPublishable()` in `src/lib/affairs/publish-guard.ts`, which requires a source, requires every automated matching decision to be human-validated, and writes `verifiedAt` + `verifiedBy` atomically. A CI guard rejects direct `PUBLISHED` literals; variable-based writes are caught in review.
- **Let an automated pipeline create a non-DRAFT affair.** Press, Wikidata, Wikipedia and any future source create affairs in `DRAFT` only. Publication is always a separate, explicit human action.
- **Search Judilibre by a person's name.** Removed in #337: the corpus is pseudonymised, and name-based discovery produced 0 affairs over 156 decisions. Judilibre is reached only from a known reference (Judilibre id, ECLI, pourvoi number), it fills a `CourtDecision`, and it never creates or modifies an `Affair`. An architecture test blocks reintroduction.
- **Import data from unverified sources.** Blogs, forums, social media, unverified aggregators are not allowed as primary sources.
- **Add feature flags or compatibility shims** when the code can be changed directly.
- **Use em dashes (—) in any generated content.** Commas, colons, and parentheses do the job.

### You should

- **Read before you edit.** Check `prisma/schema.prisma` before writing `$queryRaw`. Check `src/config/labels.ts` before hard-coding a French string. Check `src/config/wikidata.ts` and run `npm run wikidata:lookup` before fetching a Q-ID via web search.
- **Pair data fixes with regression tests.** If you fix a false-positive mention or a wrong party display, add a test reproducing the bug before implementing the fix.
- **Prefer editing existing files** over creating new ones. Prefer deleting dead code over keeping legacy shims.
- **Use domain helpers**: `getAffairPartyDisplay()`, `getCertaintyLevel()`, `NUANCE_POLITIQUE_MAPPING`, `callAnthropic()`, `withAdminAuth()`, `withValidation()`, `parsePagination()`, `stripMarkdownForCSV()`. They encode editorial and security constraints.
- **Filter affairs through the centralized builders on every public surface.** Web pages, public API routes, CSV/JSON exports and the MCP server must use the where-builders in `src/lib/affairs/public-filters.ts` (`getPublishedAffairWhere`, `getAdverseAffairWhere`, `getMisEnCauseWhere`, `getFavorableOutcomeWhere`) and the per-role counters in `affair-counts.ts`. Never hand-roll a `publicationStatus`/status filter in a public surface: the MCP server consumes the public API and inherits its filters, so no judicial data leaks through a side door. Methodology is documented in `/methodologie` and the RGPD art. 10 measures in `docs/LEGAL.md` §7.
- **Default to small commits.** Under 400 changed lines per commit when possible. Split large features into schema, service, UI commits.
- **Write tests for every new service, data function, or pure utility** added by a `feat()` commit. Reference examples: `resolver.test.ts`, `hatvp-xml.test.ts`, `confidence.test.ts`.

### Explain-without-looking checkpoint

Before committing AI-generated code, you (the human reviewing the AI output) should be able to describe what the code does and why, without re-reading it. If not, you haven't reviewed it; you've accepted it. Send it back for a smaller chunk.

---

## 8. Non-obvious gotchas

These are scar-tissue lessons. Reading them costs thirty seconds; rediscovering them costs hours.

### Next.js 16 and App Router

- **`permanentRedirect()` in a page renders an HTML meta-refresh shell, not an HTTP 308.** For citation resolvers, URL shorteners, or crawler-facing redirects, use a Route Handler (`route.ts` returning `Response.redirect(url, 308)`).
- **`generateStaticParams` with `searchParams` and `useCache: true` crashes** with `DYNAMIC_SERVER_USAGE`. Use `revalidate = N` alone for ISR on dynamic pages.
- **ISR pages prerender at build time.** If the DB is unreachable during build, pages render empty. Vercel env vars must be set before build.
- **Repeated public images stay optimized.** Do not use `unoptimized` in public app or component
  code. Store unreliable remote assets in Blob rather than serving full originals to every reader.
- **Large link collections do not prefetch by default.** Footer, result grids and directories use
  `prefetch={false}`. The `href` remains in server HTML for readers and crawlers.
- **One visible dataset per client boundary.** Do not pass hidden panels or whole corpora into a
  client component. Give substantial indexable sections stable server-rendered URLs.

### Prisma 7

- **The `db` singleton is an extended client.** It auto-generates `publicId` on every `create()` call for 10 entity types via `createPoligraphIdExtension()`. The hook targets `create` only, not `createMany`. Adding a new `publicId` model requires a hook in `src/lib/public-ids/prisma-extension.ts` plus a PostgreSQL sequence.
- **After `prisma generate` with new models, restart the dev server.** The `globalForPrisma` singleton caches the old client; `db.newModel` will be `undefined` until restart.
- **`Prisma.sql` template literals parameterize values as text.** `::uuid` casts in raw SQL VALUES therefore fail. Use individual `db.model.update()` calls with concurrency batching for bulk UUID updates.
- **`{ not: null }` fails on some nullable fields in Prisma 7.** Use `$queryRaw` with `IS NOT NULL`.
- **`Politician.id` is a cuid (TEXT), not a UUID.** Never cast `::uuid` in a `$executeRaw` update against `Politician`; `adapter-pg` rejects with `42883: operator does not exist: text = uuid`. Pattern fix in `scripts/recalculate-prominence.ts`.

### PostgreSQL

- **`SUBSTRING(col FROM '\d+')` silently returns NULL.** POSIX ERE (used by `SUBSTRING`) doesn't support `\d`. Use `[0-9]+`. Always test raw regex patterns in isolation before deploying.
- **`CREATE INDEX CONCURRENTLY` cannot run inside a transaction.** Prisma wraps `$executeRaw` in implicit transactions. Use a direct `pg.Pool` for concurrent index creation (see `scripts/apply-vote-denorm-trigger.ts`).
- **Enum sort order is schema-declaration order**, not domain order. For `AffairStatus` certainty ordering, sort by `severity: "asc"` or use a SQL `CASE`.

### Server/Client boundaries

- **`"use client"` exports cannot be called as functions from server code, only rendered.** Shared constants and pure helpers go in `src/config/`, with no directive.
- **Prisma `Decimal` fields cannot serialize across RSC -> Client.** Convert with `Number()` in the data layer.

### Satori (OG images)

- **Every `<div>` with multiple children must have `display: "flex"`.** Satori does not implement default block layout.
- **Use template literals to concat text**, not JSX fragments. `{a} {b}` creates multiple text nodes and breaks Satori; `` `${a} ${b}` `` works.
- **Test every OG image at `/path/opengraph-image`** before committing.

### Storybook

- **`storybook-static/` is not in `eslint.config` `globalIgnores`.** If you build Storybook locally, `npm run lint` reports thousands of false errors from minified JS. The folder is gitignored, so CI never sees it. Lint specific files, or add the folder to ignores before running a full lint.

### Async jobs

- **Inngest `step.run()` serializes dates as ISO strings.** Rehydrate with `new Date(data.someDate)` in subsequent steps.
- **Parallel sync race conditions**: if a data-fix script runs while a sync process is still active, the sync can reintroduce bad data. Wait for all syncs to finish before running fixes.

### AI SDK streaming

- **`toTextStreamResponse()` silently swallows API errors** and returns HTTP 200 with zero bytes. The chat route (`src/app/api/chat/route.ts`) uses a manual `ReadableStream` with try/catch instead. Do not revert.
- **`TextDecoder` `stream` option goes on the `.decode(value, { stream: true })` call**, not on the constructor.

### Elections and scale

- **500k+ candidacies.** Never load unbounded.
- **`generateStaticParams` with heavy queries = Vercel OOM.** Return `[]` for ISR-only on heavy detail pages.
- **A _list_ is elected at T1, not a commune.** Only lists with >50% round-1 percentage win. `seatsWon > 0` is wrong (proportional seats go to losing lists too).
- **`municipales-2026-resultats` StatsSnapshot is not refreshed by `sync:compute-stats`.** Refresh via `scripts/tmp-update-stats.ts`.

### Programmes (politician platforms)

- **Position scale is -3..+3 (Int), not ternary -1/0/1.** Constant: `POSITION_MAX = 3` in `src/lib/programmes/matching.ts`. Radar uses `Math.abs(position) / POSITION_MAX * 100` for display.

### Data quality

- **Always match on ID or code fields, not fuzzy names.** `departmentCode: "42"` not `constituency: { startsWith: "Loire" }` (which matches Loiret and Loir-et-Cher too).
- **French administrative names mismatch.** RNE uses full legal names ("Libert Albanel"); ballot CSVs use short ballot names ("LIBERT"). Handle both variants.
- **Never fallback `affair.partyAtTime || politician.currentParty`.** Use `getAffairPartyDisplay()` which refuses the fallback when the current party was founded after the affair's facts date.
- **The `Elu` column in data.gouv.fr 2026 CSVs is always empty.** Derive `isElected` from `pctExpressed > 50` at T1.

---

## 9. CI pipeline

On push to `main` or `staging`, four parallel jobs run: **lint**, **typecheck**, **format-check**, **unit-tests**. Node 22. Prisma generate runs first in every job.

**Code Quality Guards** (`.github/workflows/code-quality.yml`): grep-based security checks (no npm install, ~6 s). They block:

- `$executeRawUnsafe`
- unsanitized `dangerouslySetInnerHTML`
- `NEXT_PUBLIC_` secrets
- `forwardRef` (deprecated pattern here)
- hardcoded Tailwind color classes (`text-blue-600` etc.)
- inline `parseInt` pagination in API routes
- admin routes without `withAdminAuth`
- unjustified `any` without `eslint-disable`

**Security headers** (`.github/workflows/security-headers.yml`) validates production response headers on every deploy.

If a CI check fails, fix the underlying issue. Never skip hooks with `--no-verify`.

**Workflow secrets live in two places.** Any API key used by a daily-sync script must exist both as a GitHub `production` environment secret and in the `env:` block of `.github/workflows/sync-daily.yml`. A secret defined only on the GitHub side never reaches the runner.

---

## 10. How to get more context

Beyond this file:

- `README.md` — public-facing project description.
- `prisma/schema.prisma` — source of truth for data model.
- `src/config/labels.ts` — ~150 French enum translations. Never hard-code a French label.
- `src/config/wikidata.ts` — known Q-IDs.
- `src/config/navigation.ts` — single source of truth for nav.
- `src/config/routes.ts` — parliament section routes.
- `src/config/certainty.ts` — the 4-level certainty hierarchy.
- `src/config/judicial-anchors.ts` — French-vs-foreign judicial indicators used by the resolver.
- `/sources` page — public editorial methodology.
- GitHub Issues — ongoing initiatives, roadmap.

A personal `CLAUDE.local.md` may exist in the working directory with deploy-specific workflows (Vercel aliases, production debugging, local shortcuts). It is gitignored by design. Do not copy its content into this file.

### Agentic remediation findings

When a task carries a `SEC-*`, `CI-*`, `DB-*`, `UX-*`, or `AGENT-*` identifier, read
`docs/audits/security-ux-baseline-2026-08.md` and
`docs/engineering/agentic-remediation.md` before investigating or changing code.

---

## 11. Reporting problems and suggesting changes

If an instruction in this file is wrong, outdated, or in tension with another guideline, open a GitHub issue labeled `docs:agents-md` and propose a concrete replacement. Do not silently work around it.

Project contact: [github.com/ironlam/poligraph/issues](https://github.com/ironlam/poligraph/issues).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
